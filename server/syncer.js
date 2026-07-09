const { PrismaClient } = require('@prisma/client');
const db = require('./db');
const { metricsFromLog, parseCacheHitTokens } = require('./tokenMetrics');

const prisma = new PrismaClient();

const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = Number.parseInt(process.env.SYNC_MAX_BATCHES_PER_RUN || '100', 10);
const LOG_TYPE_CONSUME = 2;
const LOG_TYPE_ERROR = 5;
const USAGE_STATS_BACKFILL_KEY = 'usage_stats_backfilled_v1';
const USAGE_STATS_CACHE_HIT_BACKFILL_KEY = 'usage_stats_cache_hit_backfilled_v2';
// C2 extended-metrics backfill: repopulates the new other-derived columns from
// historical logs (id <= the upgrade-time last_synced_id). Resumable: progress
// is persisted per batch so a kill/restart continues. Bounded per run by
// SYNC_MAX_BATCHES_PER_RUN.
const EXTENDED_BACKFILL_END_KEY = 'extended_backfill_end_id_v1';
const EXTENDED_BACKFILL_PROGRESS_KEY = 'extended_backfill_progress_id_v1';
const EXTENDED_BACKFILL_DONE_KEY = 'extended_backfill_done_v1';

const syncState = {
    lastFetchedCount: 0,
    lastProcessedBatches: 0,
    lastProcessedLogs: 0,
    lastSyncedId: 0,
    estimatedBacklog: 0,
    consecutiveFailures: 0,
    lastSuccessfulSyncAt: null,
    lastRunStartedAt: null,
    lastRunFinishedAt: null,
    lastError: null
};

function getRebuildHourRange(startTs, endTs) {
    const startHour = Math.floor(startTs / 3600) * 3600;
    const endHour = Math.floor((endTs - 1) / 3600) * 3600;

    return {
        startHour,
        endHour,
        queryStartTs: startHour,
        queryEndTs: endHour + 3599
    };
}

async function getMeta(key) {
    return new Promise((resolve, reject) => {
        db.get("SELECT value FROM meta WHERE key = ?", [key], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.value : null);
        });
    });
}

async function setMeta(key, value) {
    return new Promise((resolve, reject) => {
        db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function updateStats(logs) {
    return updateAggregates(logs, { includeStats: true, includeUsageStats: true });
}

async function updateUsageStats(logs) {
    return updateAggregates(logs, { includeStats: false, includeUsageStats: true });
}

// Extended metric accumulator (C2). These are sums per hourly bucket; averages
// and rates (avg latency, TTFT, TPS, success-rate) are derived at query time.
// - success_count: consume rows (type 2); error_count already covers type 5.
// - first_token_*: TTFT from other.frt (ms), only counted when frtMs > 0
//   (streaming). We do not store a redundant latency_ms_sum; use_time_sum_sec
//   carries whole-request seconds for throughput/avg-latency derivation.
function newExtendedAgg() {
    return {
        cacheCreationTokens: 0,
        imageTokens: 0,
        audioTokens: 0,
        reasoningRequests: 0,
        toolCalls: 0,
        toolQuota: 0,
        successCount: 0,
        firstTokenMsSum: 0,
        firstTokenCount: 0,
        useTimeSumSec: 0
    };
}

function accumulateExtended(agg, metrics, log) {
    agg.cacheCreationTokens += metrics.cacheCreationTokens;
    agg.imageTokens += metrics.imageTokens;
    agg.audioTokens += metrics.audioInputTokens + metrics.audioOutputTokens;
    agg.reasoningRequests += metrics.reasoning ? 1 : 0;
    agg.toolCalls += metrics.toolCalls;
    agg.toolQuota += metrics.toolQuota;
    agg.successCount += log.type === LOG_TYPE_CONSUME ? 1 : 0;
    agg.firstTokenMsSum += metrics.frtMs > 0 ? metrics.frtMs : 0;
    agg.firstTokenCount += metrics.frtMs > 0 ? 1 : 0;
    agg.useTimeSumSec += metrics.useTimeSec;
}

async function updateAggregates(logs, { includeStats, includeUsageStats }) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            const statsStmt = includeStats ? db.prepare(`
                INSERT INTO stats (
                    channel_id, model_name, hour,
                    prompt_tokens, completion_tokens, cache_hit_tokens, tokens,
                    request_count, quota, error_count, avg_latency,
                    cache_creation_tokens, image_tokens, audio_tokens, reasoning_requests,
                    tool_calls, tool_quota, success_count,
                    first_token_ms_sum, first_token_count, use_time_sum_sec
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(channel_id, model_name, hour)
                DO UPDATE SET
                    prompt_tokens = prompt_tokens + excluded.prompt_tokens,
                    completion_tokens = completion_tokens + excluded.completion_tokens,
                    cache_hit_tokens = cache_hit_tokens + excluded.cache_hit_tokens,
                    tokens = tokens + excluded.tokens,
                    request_count = request_count + excluded.request_count,
                    quota = quota + excluded.quota,
                    error_count = error_count + excluded.error_count,
                    avg_latency = CASE
                        WHEN request_count + excluded.request_count > 0
                        THEN (avg_latency * request_count + excluded.avg_latency * excluded.request_count) / (request_count + excluded.request_count)
                        ELSE 0
                    END,
                    cache_creation_tokens = cache_creation_tokens + excluded.cache_creation_tokens,
                    image_tokens = image_tokens + excluded.image_tokens,
                    audio_tokens = audio_tokens + excluded.audio_tokens,
                    reasoning_requests = reasoning_requests + excluded.reasoning_requests,
                    tool_calls = tool_calls + excluded.tool_calls,
                    tool_quota = tool_quota + excluded.tool_quota,
                    success_count = success_count + excluded.success_count,
                    first_token_ms_sum = first_token_ms_sum + excluded.first_token_ms_sum,
                    first_token_count = first_token_count + excluded.first_token_count,
                    use_time_sum_sec = use_time_sum_sec + excluded.use_time_sum_sec
            `) : null;

            const usageStmt = includeUsageStats ? db.prepare(`
                INSERT INTO usage_stats (
                    hour, user_group, channel_id, model_name, token_id,
                    prompt_tokens, completion_tokens, cache_hit_tokens, tokens, request_count, quota, error_count, avg_latency,
                    cache_creation_tokens, image_tokens, audio_tokens, reasoning_requests,
                    tool_calls, tool_quota, success_count,
                    first_token_ms_sum, first_token_count, use_time_sum_sec
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(hour, user_group, channel_id, model_name, token_id)
                DO UPDATE SET
                    prompt_tokens = prompt_tokens + excluded.prompt_tokens,
                    completion_tokens = completion_tokens + excluded.completion_tokens,
                    cache_hit_tokens = cache_hit_tokens + excluded.cache_hit_tokens,
                    tokens = tokens + excluded.tokens,
                    request_count = request_count + excluded.request_count,
                    quota = quota + excluded.quota,
                    error_count = error_count + excluded.error_count,
                    avg_latency = CASE
                        WHEN request_count + excluded.request_count > 0
                        THEN (avg_latency * request_count + excluded.avg_latency * excluded.request_count) / (request_count + excluded.request_count)
                        ELSE 0
                    END,
                    cache_creation_tokens = cache_creation_tokens + excluded.cache_creation_tokens,
                    image_tokens = image_tokens + excluded.image_tokens,
                    audio_tokens = audio_tokens + excluded.audio_tokens,
                    reasoning_requests = reasoning_requests + excluded.reasoning_requests,
                    tool_calls = tool_calls + excluded.tool_calls,
                    tool_quota = tool_quota + excluded.tool_quota,
                    success_count = success_count + excluded.success_count,
                    first_token_ms_sum = first_token_ms_sum + excluded.first_token_ms_sum,
                    first_token_count = first_token_count + excluded.first_token_count,
                    use_time_sum_sec = use_time_sum_sec + excluded.use_time_sum_sec
            `) : null;

            const statsAggregated = {};
            const usageAggregated = {};

            logs.forEach(log => {
                const timestamp = Number(log.createdAt);
                const hour = Math.floor(timestamp / 3600) * 3600;
                const channelId = log.channelId || 0;
                const modelName = log.modelName || '';
                const tokenId = log.tokenId || 0;
                const userGroup = log.group || '';
                const metrics = metricsFromLog(log);
                const {
                    promptTokens,
                    completionTokens,
                    cacheHitTokens,
                    tokens: totalTokens
                } = metrics;
                const quota = log.quota || 0;
                const latency = log.useTime || 0;
                const errorCount = log.type === LOG_TYPE_ERROR ? 1 : 0;

                if (includeStats) {
                    const statsKey = `${channelId}:${modelName}:${hour}`;
                    if (!statsAggregated[statsKey]) {
                        statsAggregated[statsKey] = {
                            channelId,
                            modelName,
                            hour,
                            promptTokens: 0,
                            completionTokens: 0,
                            cacheHitTokens: 0,
                            tokens: 0,
                            requestCount: 0,
                            quota: 0,
                            errorCount: 0,
                            latencySum: 0,
                            ...newExtendedAgg()
                        };
                    }
                    const statsAgg = statsAggregated[statsKey];
                    statsAgg.promptTokens += promptTokens;
                    statsAgg.completionTokens += completionTokens;
                    statsAgg.cacheHitTokens += cacheHitTokens;
                    statsAgg.tokens += totalTokens;
                    statsAgg.requestCount++;
                    statsAgg.quota += quota;
                    statsAgg.errorCount += errorCount;
                    statsAgg.latencySum += latency;
                    accumulateExtended(statsAgg, metrics, log);
                }

                if (includeUsageStats) {
                    const usageKey = `${hour}:${userGroup}:${channelId}:${modelName}:${tokenId}`;
                    if (!usageAggregated[usageKey]) {
                        usageAggregated[usageKey] = {
                            hour,
                            userGroup,
                            channelId,
                            modelName,
                            tokenId,
                            promptTokens: 0,
                            completionTokens: 0,
                            cacheHitTokens: 0,
                            tokens: 0,
                            requestCount: 0,
                            quota: 0,
                            errorCount: 0,
                            latencySum: 0,
                            ...newExtendedAgg()
                        };
                    }
                    const usageAgg = usageAggregated[usageKey];
                    usageAgg.promptTokens += promptTokens;
                    usageAgg.completionTokens += completionTokens;
                    usageAgg.cacheHitTokens += cacheHitTokens;
                    usageAgg.tokens += totalTokens;
                    usageAgg.requestCount++;
                    usageAgg.quota += quota;
                    usageAgg.errorCount += errorCount;
                    usageAgg.latencySum += latency;
                    accumulateExtended(usageAgg, metrics, log);
                }
            });

            if (statsStmt) {
                Object.values(statsAggregated).forEach(agg => {
                    const avgLatency = agg.requestCount > 0 ? Math.round(agg.latencySum / agg.requestCount) : 0;
                    statsStmt.run(
                        agg.channelId,
                        agg.modelName,
                        agg.hour,
                        agg.promptTokens,
                        agg.completionTokens,
                        agg.cacheHitTokens,
                        agg.tokens,
                        agg.requestCount,
                        agg.quota,
                        agg.errorCount,
                        avgLatency,
                        agg.cacheCreationTokens,
                        agg.imageTokens,
                        agg.audioTokens,
                        agg.reasoningRequests,
                        agg.toolCalls,
                        agg.toolQuota,
                        agg.successCount,
                        agg.firstTokenMsSum,
                        agg.firstTokenCount,
                        agg.useTimeSumSec
                    );
                });
            }

            if (usageStmt) {
                Object.values(usageAggregated).forEach(agg => {
                    const avgLatency = agg.requestCount > 0 ? Math.round(agg.latencySum / agg.requestCount) : 0;
                    usageStmt.run(
                        agg.hour,
                        agg.userGroup,
                        agg.channelId,
                        agg.modelName,
                        agg.tokenId,
                        agg.promptTokens,
                        agg.completionTokens,
                        agg.cacheHitTokens,
                        agg.tokens,
                        agg.requestCount,
                        agg.quota,
                        agg.errorCount,
                        avgLatency,
                        agg.cacheCreationTokens,
                        agg.imageTokens,
                        agg.audioTokens,
                        agg.reasoningRequests,
                        agg.toolCalls,
                        agg.toolQuota,
                        agg.successCount,
                        agg.firstTokenMsSum,
                        agg.firstTokenCount,
                        agg.useTimeSumSec
                    );
                });
            }

            if (statsStmt) {
                statsStmt.finalize();
            }
            if (usageStmt) {
                usageStmt.finalize();
            }
            db.run("COMMIT", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

async function getLatestLogId() {
    const latestLog = await prisma.log.findFirst({
        where: {
            type: { in: [LOG_TYPE_CONSUME, LOG_TYPE_ERROR] }
        },
        orderBy: { id: 'desc' },
        select: { id: true }
    });

    return latestLog?.id || 0;
}

function getSyncState() {
    return { ...syncState };
}

async function syncLogs() {
    syncState.lastRunStartedAt = new Date().toISOString();

    try {
        const lastIdStr = await getMeta('last_synced_id');
        let lastId = lastIdStr ? parseInt(lastIdStr, 10) : 0;
        let processedLogs = 0;
        let processedBatches = 0;

        while (processedBatches < MAX_BATCHES_PER_RUN) {
            const logs = await prisma.log.findMany({
                where: {
                    id: { gt: lastId },
                    type: { in: [LOG_TYPE_CONSUME, LOG_TYPE_ERROR] }
                },
                take: BATCH_SIZE,
                orderBy: { id: 'asc' }
            });

            syncState.lastFetchedCount = logs.length;

            if (logs.length === 0) {
                break;
            }

            processedBatches += 1;
            processedLogs += logs.length;
            console.log(`[SYNC] Batch ${processedBatches}: fetched ${logs.length} logs from id>${lastId}`);

            await updateStats(logs);

            lastId = logs[logs.length - 1].id;
            await setMeta('last_synced_id', lastId.toString());
        }

        const latestLogId = await getLatestLogId();
        syncState.lastProcessedBatches = processedBatches;
        syncState.lastProcessedLogs = processedLogs;
        syncState.lastSyncedId = lastId;
        syncState.estimatedBacklog = Math.max(0, latestLogId - lastId);
        syncState.lastSuccessfulSyncAt = new Date().toISOString();
        syncState.lastRunFinishedAt = syncState.lastSuccessfulSyncAt;
        syncState.consecutiveFailures = 0;
        syncState.lastError = null;

        return {
            processedLogs,
            processedBatches,
            lastSyncedId: lastId,
            estimatedBacklog: syncState.estimatedBacklog
        };
    } catch (error) {
        syncState.consecutiveFailures += 1;
        syncState.lastError = error.message;
        syncState.lastRunFinishedAt = new Date().toISOString();
        console.error('[SYNC] Error:', error);
        throw error;
    }
}

// 同步渠道快照（每小时执行一次）
async function syncChannelSnapshots() {
    try {
        const channels = await prisma.channel.findMany({
            select: {
                id: true,
                status: true,
                responseTime: true,
                balance: true
            }
        });

        const now = Math.floor(Date.now() / 1000);
        
        const stmt = db.prepare(`
            INSERT INTO channel_snapshots (channel_id, status, response_time, balance, snapshot_time)
            VALUES (?, ?, ?, ?, ?)
        `);

        channels.forEach(ch => {
            stmt.run(ch.id, ch.status, ch.responseTime || 0, ch.balance || 0, now);
        });

        stmt.finalize();
        console.log(`[SYNC] Saved ${channels.length} channel snapshots`);
    } catch (error) {
        console.error("[SYNC] Channel snapshot error:", error);
    }
}

// 清理旧数据（保留30天）
async function cleanOldData() {
    try {
        const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
        
        await db.runAsync("DELETE FROM stats WHERE hour < ?", [thirtyDaysAgo]);
        await db.runAsync("DELETE FROM usage_stats WHERE hour < ?", [thirtyDaysAgo]);
        await db.runAsync("DELETE FROM channel_snapshots WHERE snapshot_time < ?", [thirtyDaysAgo]);
        await db.runAsync("DELETE FROM alert_history WHERE triggered_at < ?", [thirtyDaysAgo]);
        
        console.log("[SYNC] Cleaned old data (>30 days)");
    } catch (error) {
        console.error("[SYNC] Clean old data error:", error);
    }
}

// 重建指定时间范围内的统计数据 (startTs: 秒级时间戳, endTs: 秒级时间戳)
async function rebuildStatsForDateRange(startTs, endTs) {
    if (!startTs || !endTs || startTs >= endTs) {
        throw new Error('Invalid time range for rebuild');
    }

    const { startHour, endHour, queryStartTs, queryEndTs } = getRebuildHourRange(startTs, endTs);

    // 1. 从 stats 中删除旧有聚合数据
    await new Promise((resolve, reject) => {
        db.run("DELETE FROM stats WHERE hour >= ? AND hour <= ?", [startHour, endHour], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });

    await new Promise((resolve, reject) => {
        db.run("DELETE FROM usage_stats WHERE hour >= ? AND hour <= ?", [startHour, endHour], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });

    let processedLogs = 0;
    let processedBatches = 0;
    let lastId = 0;

    // 2. 分批拉取对应时间范围内的原始日志并重新聚合
    while (true) {
        const logs = await prisma.log.findMany({
            where: {
                id: { gt: lastId },
                createdAt: { gte: BigInt(queryStartTs), lte: BigInt(queryEndTs) },
                type: { in: [LOG_TYPE_CONSUME, LOG_TYPE_ERROR] }
            },
            take: BATCH_SIZE,
            orderBy: { id: 'asc' }
        });

        if (logs.length === 0) {
            break;
        }

        processedBatches += 1;
        processedLogs += logs.length;
        console.log(`[REBUILD] Batch ${processedBatches}: fetched ${logs.length} logs in time range`);

        await updateStats(logs);

        lastId = logs[logs.length - 1].id;
    }

    await setMeta('last_rebuild_time', new Date().toISOString());

    return { processedLogs, processedBatches, timeRange: { startTs, endTs }, rebuiltHours: { startHour, endHour } };
}

async function rebuildUsageStatsForDateRange(startTs, endTs, maxId = null) {
    if (!startTs || !endTs || startTs >= endTs) {
        throw new Error('Invalid time range for usage_stats rebuild');
    }

    const { startHour, endHour, queryStartTs, queryEndTs } = getRebuildHourRange(startTs, endTs);

    await new Promise((resolve, reject) => {
        db.run("DELETE FROM usage_stats WHERE hour >= ? AND hour <= ?", [startHour, endHour], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });

    let processedLogs = 0;
    let processedBatches = 0;
    let lastId = 0;

    while (true) {
        const where = {
            id: { gt: lastId },
            createdAt: { gte: BigInt(queryStartTs), lte: BigInt(queryEndTs) },
            type: { in: [LOG_TYPE_CONSUME, LOG_TYPE_ERROR] }
        };
        if (maxId !== null) {
            where.id.lte = maxId;
        }

        const logs = await prisma.log.findMany({
            where,
            take: BATCH_SIZE,
            orderBy: { id: 'asc' }
        });

        if (logs.length === 0) {
            break;
        }

        processedBatches += 1;
        processedLogs += logs.length;
        console.log(`[REBUILD] Usage batch ${processedBatches}: fetched ${logs.length} logs in time range`);

        await updateUsageStats(logs);

        lastId = logs[logs.length - 1].id;
    }

    return { processedLogs, processedBatches, timeRange: { startTs, endTs }, rebuiltHours: { startHour, endHour } };
}

async function ensureUsageStatsBackfill() {
    const lastIdStr = await getMeta('last_synced_id');
    const lastSyncedId = lastIdStr ? parseInt(lastIdStr, 10) : 0;
    if (!lastSyncedId) {
        await setMeta(USAGE_STATS_BACKFILL_KEY, new Date().toISOString());
        await setMeta(USAGE_STATS_CACHE_HIT_BACKFILL_KEY, new Date().toISOString());
        return { skipped: true };
    }

    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - 30 * 24 * 3600;
    const completed = await getMeta(USAGE_STATS_BACKFILL_KEY);
    const cacheHitCompleted = await getMeta(USAGE_STATS_CACHE_HIT_BACKFILL_KEY);

    if (completed && cacheHitCompleted) {
        return { skipped: true };
    }

    const result = await rebuildUsageStatsForDateRange(startTs, endTs, lastSyncedId);
    if (!completed) {
        await setMeta(USAGE_STATS_BACKFILL_KEY, new Date().toISOString());
    }
    await setMeta(USAGE_STATS_CACHE_HIT_BACKFILL_KEY, new Date().toISOString());
    return result;
}

// Backfill helper: re-derive the extended metrics from a batch of historical
// logs and ADD them onto existing stats/usage_stats rows. UPDATE-only (no
// INSERT) so missing buckets are left untouched rather than created as
// partial rows. Each log is processed exactly once across runs thanks to the
// persisted progress id, so the additive UPDATE never double-counts.
function updateExtendedMetrics(logs) {
    const statsAgg = {};
    const usageAgg = {};

    logs.forEach(log => {
        const timestamp = Number(log.createdAt);
        const hour = Math.floor(timestamp / 3600) * 3600;
        const channelId = log.channelId || 0;
        const modelName = log.modelName || '';
        const tokenId = log.tokenId || 0;
        const userGroup = log.group || '';
        const metrics = metricsFromLog(log);

        const statsKey = `${channelId}:${modelName}:${hour}`;
        if (!statsAgg[statsKey]) {
            statsAgg[statsKey] = { channelId, modelName, hour, ...newExtendedAgg() };
        }
        accumulateExtended(statsAgg[statsKey], metrics, log);

        const usageKey = `${hour}:${userGroup}:${channelId}:${modelName}:${tokenId}`;
        if (!usageAgg[usageKey]) {
            usageAgg[usageKey] = { hour, userGroup, channelId, modelName, tokenId, ...newExtendedAgg() };
        }
        accumulateExtended(usageAgg[usageKey], metrics, log);
    });

    const extendedSetClause = `
        cache_creation_tokens = cache_creation_tokens + ?,
        image_tokens = image_tokens + ?,
        audio_tokens = audio_tokens + ?,
        reasoning_requests = reasoning_requests + ?,
        tool_calls = tool_calls + ?,
        tool_quota = tool_quota + ?,
        success_count = success_count + ?,
        first_token_ms_sum = first_token_ms_sum + ?,
        first_token_count = first_token_count + ?,
        use_time_sum_sec = use_time_sum_sec + ?`;

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            const statsStmt = db.prepare(`UPDATE stats SET ${extendedSetClause}
                WHERE channel_id = ? AND model_name = ? AND hour = ?`);
            Object.values(statsAgg).forEach(agg => {
                statsStmt.run(
                    agg.cacheCreationTokens, agg.imageTokens, agg.audioTokens,
                    agg.reasoningRequests, agg.toolCalls, agg.toolQuota,
                    agg.successCount, agg.firstTokenMsSum, agg.firstTokenCount, agg.useTimeSumSec,
                    agg.channelId, agg.modelName, agg.hour
                );
            });
            statsStmt.finalize();

            const usageStmt = db.prepare(`UPDATE usage_stats SET ${extendedSetClause}
                WHERE hour = ? AND user_group = ? AND channel_id = ? AND model_name = ? AND token_id = ?`);
            Object.values(usageAgg).forEach(agg => {
                usageStmt.run(
                    agg.cacheCreationTokens, agg.imageTokens, agg.audioTokens,
                    agg.reasoningRequests, agg.toolCalls, agg.toolQuota,
                    agg.successCount, agg.firstTokenMsSum, agg.firstTokenCount, agg.useTimeSumSec,
                    agg.hour, agg.userGroup, agg.channelId, agg.modelName, agg.tokenId
                );
            });
            usageStmt.finalize();

            db.run("COMMIT", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

// Resumable, batch-bounded backfill of the extended metric columns from
// historical logs.other. The old/new boundary (end_id) is captured from
// last_synced_id on the first run; callers must invoke the first step before
// syncing new logs so the ranges never overlap. Progress is persisted per
// batch, so a kill/restart continues from where it left off.
async function stepExtendedMetricsBackfill() {
    const done = await getMeta(EXTENDED_BACKFILL_DONE_KEY);
    if (done) {
        return { skipped: true };
    }

    const lastIdStr = await getMeta('last_synced_id');
    const lastSyncedId = lastIdStr ? parseInt(lastIdStr, 10) : 0;

    let endIdStr = await getMeta(EXTENDED_BACKFILL_END_KEY);
    if (!endIdStr) {
        if (!lastSyncedId) {
            await setMeta(EXTENDED_BACKFILL_DONE_KEY, new Date().toISOString());
            return { skipped: true };
        }
        endIdStr = String(lastSyncedId);
        await setMeta(EXTENDED_BACKFILL_END_KEY, endIdStr);
        await setMeta(EXTENDED_BACKFILL_PROGRESS_KEY, '0');
    }
    const endId = parseInt(endIdStr, 10);

    const progressStr = await getMeta(EXTENDED_BACKFILL_PROGRESS_KEY);
    let progressId = progressStr ? parseInt(progressStr, 10) : 0;

    if (progressId >= endId) {
        await setMeta(EXTENDED_BACKFILL_DONE_KEY, new Date().toISOString());
        return { skipped: true, completed: true };
    }

    let processedLogs = 0;
    let processedBatches = 0;

    while (processedBatches < MAX_BATCHES_PER_RUN) {
        const logs = await prisma.log.findMany({
            where: {
                id: { gt: progressId, lte: endId },
                type: { in: [LOG_TYPE_CONSUME, LOG_TYPE_ERROR] }
            },
            take: BATCH_SIZE,
            orderBy: { id: 'asc' }
        });

        if (logs.length === 0) {
            break;
        }

        processedBatches += 1;
        processedLogs += logs.length;
        console.log(`[BACKFILL-EXT] Batch ${processedBatches}: fetched ${logs.length} logs (id>${progressId}, <=${endId})`);

        await updateExtendedMetrics(logs);

        progressId = logs[logs.length - 1].id;
        await setMeta(EXTENDED_BACKFILL_PROGRESS_KEY, progressId.toString());
    }

    const completed = progressId >= endId;
    if (completed) {
        await setMeta(EXTENDED_BACKFILL_DONE_KEY, new Date().toISOString());
    }

    return { processedLogs, processedBatches, progressId, endId, completed };
}

module.exports = {
    syncLogs,
    syncChannelSnapshots,
    cleanOldData,
    getSyncState,
    prisma,
    rebuildStatsForDateRange,
    ensureUsageStatsBackfill,
    stepExtendedMetricsBackfill,
    parseCacheHitTokens,
    getRebuildHourRange,
    updateStats,
    updateUsageStats
};

