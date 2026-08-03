const { PrismaClient } = require('@prisma/client');
const db = require('./db');
const { metricsFromLog, parseCacheHitTokens } = require('./tokenMetrics');

const prisma = new PrismaClient();

const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = Number.parseInt(process.env.SYNC_MAX_BATCHES_PER_RUN || '100', 10);
const LOG_TYPE_CONSUME = 2;
const LOG_TYPE_ERROR = 5;

// Only select fields used by aggregation to reduce Prisma transfer overhead.
// The `other` field (large JSON) and `content` (free text) are the biggest
// savings when omitted from unrelated queries.
const LOG_SELECT = {
    id: true,
    createdAt: true,
    channelId: true,
    modelName: true,
    tokenId: true,
    group: true,
    type: true,
    quota: true,
    useTime: true,
    promptTokens: true,
    completionTokens: true,
    other: true
};
const USAGE_STATS_BACKFILL_KEY = 'usage_stats_backfilled_v1';
const USAGE_STATS_CACHE_HIT_BACKFILL_KEY = 'usage_stats_cache_hit_backfilled_v2';
// C2 extended-metrics backfill: repopulates the new other-derived columns from
// historical logs (id <= the upgrade-time last_synced_id). Resumable: progress
// is persisted per batch so a kill/restart continues. Bounded per run by
// SYNC_MAX_BATCHES_PER_RUN.
const EXTENDED_BACKFILL_END_KEY = 'extended_backfill_end_id_v1';
const EXTENDED_BACKFILL_PROGRESS_KEY = 'extended_backfill_progress_id_v1';
const EXTENDED_BACKFILL_DONE_KEY = 'extended_backfill_done_v1';
// Dedicated backfill for total_input_tokens (added after the extended backfill
// had already completed on deployed systems). Reuses the extended boundary.
const TOTAL_INPUT_BACKFILL_PROGRESS_KEY = 'total_input_backfill_progress_id_v1';
const TOTAL_INPUT_BACKFILL_DONE_KEY = 'total_input_backfill_done_v1';

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
        useTimeSumSec: 0,
        totalInputTokens: 0
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
    agg.totalInputTokens += metrics.totalInputTokens;
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
                    first_token_ms_sum, first_token_count, use_time_sum_sec, total_input_tokens
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    use_time_sum_sec = use_time_sum_sec + excluded.use_time_sum_sec,
                    total_input_tokens = total_input_tokens + excluded.total_input_tokens
            `) : null;

            const usageStmt = includeUsageStats ? db.prepare(`
                INSERT INTO usage_stats (
                    hour, user_group, channel_id, model_name, token_id,
                    prompt_tokens, completion_tokens, cache_hit_tokens, tokens, request_count, quota, error_count, avg_latency,
                    cache_creation_tokens, image_tokens, audio_tokens, reasoning_requests,
                    tool_calls, tool_quota, success_count,
                    first_token_ms_sum, first_token_count, use_time_sum_sec, total_input_tokens
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    use_time_sum_sec = use_time_sum_sec + excluded.use_time_sum_sec,
                    total_input_tokens = total_input_tokens + excluded.total_input_tokens
            `) : null;

            const statsAggregated = {};
            const usageAggregated = {};
            const keyStatsStmt = db.prepare(`
                INSERT INTO key_stats (
                    channel_id, key_index, model_name, hour,
                    prompt_tokens, completion_tokens, cache_hit_tokens, tokens, request_count, quota, error_count, avg_latency,
                    cache_creation_tokens, image_tokens, audio_tokens, reasoning_requests,
                    tool_calls, tool_quota, success_count,
                    first_token_ms_sum, first_token_count, use_time_sum_sec, total_input_tokens
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(channel_id, key_index, model_name, hour)
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
                    use_time_sum_sec = use_time_sum_sec + excluded.use_time_sum_sec,
                    total_input_tokens = total_input_tokens + excluded.total_input_tokens
            `);
            const keyStatsAggregated = {};

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
                // Multi-key per-key aggregation
                if (metrics.isMultiKey && metrics.multiKeyIndex >= 0) {
                    const keyStatsKey = `${channelId}:${metrics.multiKeyIndex}:${modelName}:${hour}`;
                    if (!keyStatsAggregated[keyStatsKey]) {
                        keyStatsAggregated[keyStatsKey] = {
                            channelId,
                            keyIndex: metrics.multiKeyIndex,
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
                    const keyAgg = keyStatsAggregated[keyStatsKey];
                    keyAgg.promptTokens += promptTokens;
                    keyAgg.completionTokens += completionTokens;
                    keyAgg.cacheHitTokens += cacheHitTokens;
                    keyAgg.tokens += totalTokens;
                    keyAgg.requestCount++;
                    keyAgg.quota += quota;
                    keyAgg.errorCount += errorCount;
                    keyAgg.latencySum += latency;
                    accumulateExtended(keyAgg, metrics, log);
                }
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
                        agg.useTimeSumSec,
                        agg.totalInputTokens
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
                        agg.useTimeSumSec,
                        agg.totalInputTokens
                    );
                });
            }

            if (statsStmt) {
                statsStmt.finalize();
            }
            if (usageStmt) {
                usageStmt.finalize();
            if (keyStatsStmt) {
                Object.values(keyStatsAggregated).forEach(agg => {
                    const avgLatency = agg.requestCount > 0 ? Math.round(agg.latencySum / agg.requestCount) : 0;
                    keyStatsStmt.run(
                        agg.channelId,
                        agg.keyIndex,
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
                        agg.useTimeSumSec,
                        agg.totalInputTokens
                    );
                });
            }
            if (keyStatsStmt) {
                keyStatsStmt.finalize();
            }
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
 select: LOG_SELECT,
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
                name: true,
                status: true,
                responseTime: true,
                balance: true,
                usedQuota: true,
                channelInfo: true
            }
        });

        const now = Math.floor(Date.now() / 1000);

        // Fetch the most recent key_status_json per channel for change detection
        const prevSnapshots = await db.allAsync(
            `SELECT cs1.channel_id, cs1.key_status_json
             FROM channel_snapshots cs1
             INNER JOIN (
                 SELECT channel_id, MAX(snapshot_time) as max_time
                 FROM channel_snapshots
                 WHERE key_status_json IS NOT NULL
                 GROUP BY channel_id
             ) cs2 ON cs1.channel_id = cs2.channel_id AND cs1.snapshot_time = cs2.max_time`
        );
        const prevKeyStatus = Object.fromEntries(
            prevSnapshots.map(r => [r.channel_id, r.key_status_json])
        );

        const keyStatusChanges = [];
        
        const stmt = db.prepare(`
            INSERT INTO channel_snapshots (channel_id, status, response_time, balance, used_quota, key_status_json, snapshot_time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        channels.forEach(ch => {
            let keyStatusJson = null;
            let newKeyStatus = null;
            if (ch.channelInfo) {
                try {
                    const info = typeof ch.channelInfo === 'string'
                        ? JSON.parse(ch.channelInfo)
                        : ch.channelInfo;
                    if (info && info.is_multi_key) {
                        newKeyStatus = {
                            multi_key_size: info.multi_key_size || 0,
                            multi_key_mode: info.multi_key_mode || null,
                            status_list: info.multi_key_status_list || {},
                            disabled_reason: info.multi_key_disabled_reason || {},
                            disabled_time: info.multi_key_disabled_time || {},
                            polling_index: info.multi_key_polling_index || 0
                        };
                        keyStatusJson = JSON.stringify(newKeyStatus);
                    }
                } catch {
                    // Ignore parse errors
                }
            }

            // Detect key status changes by comparing with previous snapshot
            if (newKeyStatus && prevKeyStatus[ch.id]) {
                try {
                    const oldStatus = JSON.parse(prevKeyStatus[ch.id]);
                    const oldList = oldStatus.status_list || {};
                    const newList = newKeyStatus.status_list || {};
                    const maxIdx = Math.max(
                        ...Object.keys({ ...oldList, ...newList }).map(Number)
                    );
                    for (let idx = 0; idx <= maxIdx; idx++) {
                        const oldSt = oldList[idx] !== undefined ? oldList[idx] : 1;
                        const newSt = newList[idx] !== undefined ? newList[idx] : 1;
                        if (oldSt !== newSt) {
                            keyStatusChanges.push({
                                channel_id: ch.id,
                                channel_name: ch.name,
                                key_index: idx,
                                old_status: oldSt,
                                new_status: newSt,
                                reason: newKeyStatus.disabled_reason[idx] || null,
                                timestamp: now
                            });
                        }
                    }
                } catch {
                    // Ignore comparison errors
                }
            }

            stmt.run(
                ch.id,
                ch.status,
                ch.responseTime || 0,
                ch.balance || 0,
                Number(ch.usedQuota) || 0,
                keyStatusJson,
                now
            );
        });

        stmt.finalize();
        console.log(`[SYNC] Saved ${channels.length} channel snapshots${keyStatusChanges.length > 0 ? `, ${keyStatusChanges.length} key status changes detected` : ''}`);
        
        return { keyStatusChanges };
    } catch (error) {
        console.error("[SYNC] Channel snapshot error:", error);
        return { keyStatusChanges: [] };
    }
}

// 清理旧数据（保留30天）
async function cleanOldData() {
    try {
        const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS) || 90;
        const snapshotRetentionDays = retentionDays * 2;
        const alertRetentionDays = retentionDays * 4;
        const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 24 * 3600;
        const snapshotCutoff = Math.floor(Date.now() / 1000) - snapshotRetentionDays * 24 * 3600;
        const alertCutoff = Math.floor(Date.now() / 1000) - alertRetentionDays * 24 * 3600;
        
        await db.runAsync("DELETE FROM stats WHERE hour < ?", [cutoff]);
        await db.runAsync("DELETE FROM usage_stats WHERE hour < ?", [cutoff]);
        await db.runAsync("DELETE FROM key_stats WHERE hour < ?", [cutoff]);
        await db.runAsync("DELETE FROM channel_snapshots WHERE snapshot_time < ?", [snapshotCutoff]);
        await db.runAsync("DELETE FROM alert_history WHERE triggered_at < ?", [alertCutoff]);
        
        console.log(`[SYNC] Cleaned old data (stats/key_stats/usage_stats >${retentionDays}d, snapshots >${snapshotRetentionDays}d, alerts >${alertRetentionDays}d)`);
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
 select: LOG_SELECT,
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

// Capture the extended-backfill boundary (id <= last_synced_id) and persist it
// BEFORE any syncLogs runs. This must be called once at startup, before the sync
// loop starts, so that syncLogs can never advance last_synced_id past an
// unpersisted end_id (which would let a later re-capture overlap ranges and
// double-count extended metrics). Idempotent: no-op if the boundary or the
// completion flag is already set. If there is nothing to backfill yet
// (last_synced_id == 0), marks the backfill done.
async function captureExtendedBackfillBoundary() {
    const done = await getMeta(EXTENDED_BACKFILL_DONE_KEY);
    if (done) {
        return { skipped: true };
    }

    const existing = await getMeta(EXTENDED_BACKFILL_END_KEY);
    if (existing) {
        return { skipped: true, endId: parseInt(existing, 10) };
    }

    const lastIdStr = await getMeta('last_synced_id');
    const lastSyncedId = lastIdStr ? parseInt(lastIdStr, 10) : 0;
    if (!lastSyncedId) {
        await setMeta(EXTENDED_BACKFILL_DONE_KEY, new Date().toISOString());
        return { skipped: true };
    }

    await setMeta(EXTENDED_BACKFILL_END_KEY, String(lastSyncedId));
    await setMeta(EXTENDED_BACKFILL_PROGRESS_KEY, '0');
    return { captured: true, endId: lastSyncedId };
}

// Resumable, batch-bounded backfill of the extended metric columns from
// historical logs.other. The boundary (end_id) must have been captured first by
// captureExtendedBackfillBoundary(); if it is missing (capture failed or was
// skipped), this skips rather than re-read last_synced_id, so freshly-synced
// logs can never be double-counted. Progress is persisted per batch, so a
// kill/restart continues from where it left off.
async function stepExtendedMetricsBackfill() {
    const done = await getMeta(EXTENDED_BACKFILL_DONE_KEY);
    if (done) {
        return { skipped: true };
    }

    const endIdStr = await getMeta(EXTENDED_BACKFILL_END_KEY);
    if (!endIdStr) {
        // Boundary not captured; skip this run. New logs still get extended
        // metrics via the normal sync path (updateAggregates), so the only cost
        // of skipping is historical rows stay at zero - never a double-count.
        return { skipped: true };
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
 select: LOG_SELECT,
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

// Backfill ONLY total_input_tokens. The extended-metrics backfill above was
// already completed on deployed systems before this column existed and must not
// re-run (it would double-count the other extended columns). This reuses the
// same captured end_id boundary and updates only total_input_tokens, so it is
// safe to run alongside the already-done extended backfill. New logs get
// total_input_tokens via the live sync (updateAggregates).
function updateTotalInputTokens(logs) {
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

    const setClause = `total_input_tokens = total_input_tokens + ?`;

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            const statsStmt = db.prepare(`UPDATE stats SET ${setClause}
                WHERE channel_id = ? AND model_name = ? AND hour = ?`);
            Object.values(statsAgg).forEach(agg => {
                statsStmt.run(agg.totalInputTokens, agg.channelId, agg.modelName, agg.hour);
            });
            statsStmt.finalize();

            const usageStmt = db.prepare(`UPDATE usage_stats SET ${setClause}
                WHERE hour = ? AND user_group = ? AND channel_id = ? AND model_name = ? AND token_id = ?`);
            Object.values(usageAgg).forEach(agg => {
                usageStmt.run(agg.totalInputTokens, agg.hour, agg.userGroup, agg.channelId, agg.modelName, agg.tokenId);
            });
            usageStmt.finalize();

            db.run("COMMIT", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

async function stepTotalInputBackfill() {
    const done = await getMeta(TOTAL_INPUT_BACKFILL_DONE_KEY);
    if (done) {
        return { skipped: true };
    }

    const endIdStr = await getMeta(EXTENDED_BACKFILL_END_KEY);
    if (!endIdStr) {
        // Boundary not captured yet; skip (no double-count). New logs still get
        // total_input_tokens via the live sync path.
        return { skipped: true };
    }
    const endId = parseInt(endIdStr, 10);

    const progressStr = await getMeta(TOTAL_INPUT_BACKFILL_PROGRESS_KEY);
    let progressId = progressStr ? parseInt(progressStr, 10) : 0;
    if (progressId >= endId) {
        await setMeta(TOTAL_INPUT_BACKFILL_DONE_KEY, new Date().toISOString());
        return { skipped: true, completed: true };
    }

    let processedLogs = 0;
    let processedBatches = 0;

    while (processedBatches < MAX_BATCHES_PER_RUN) {
        const logs = await prisma.log.findMany({
            where: {
 select: LOG_SELECT,
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
        console.log(`[BACKFILL-TOTAL] Batch ${processedBatches}: fetched ${logs.length} logs (id>${progressId}, <=${endId})`);

        await updateTotalInputTokens(logs);

        progressId = logs[logs.length - 1].id;
        await setMeta(TOTAL_INPUT_BACKFILL_PROGRESS_KEY, progressId.toString());
    }

    const completed = progressId >= endId;
    if (completed) {
        await setMeta(TOTAL_INPUT_BACKFILL_DONE_KEY, new Date().toISOString());
    }

    return { processedLogs, processedBatches, progressId, endId, completed };
}

// Backfill key_stats from historical logs. Uses the same boundary as the
// extended-metrics backfill (EXTENDED_BACKFILL_END_KEY). Only writes to
// key_stats (stats/usage_stats are already populated by their own backfills).
function updateKeyStatsOnly(logs) {
    const keyStatsAggregated = {};

    logs.forEach(log => {
        const metrics = metricsFromLog(log);
        if (!metrics.isMultiKey || metrics.multiKeyIndex < 0) {
            return;
        }
        const timestamp = Number(log.createdAt);
        const hour = Math.floor(timestamp / 3600) * 3600;
        const channelId = log.channelId || 0;
        const modelName = log.modelName || '';
        const keyStatsKey = `${channelId}:${metrics.multiKeyIndex}:${modelName}:${hour}`;
        if (!keyStatsAggregated[keyStatsKey]) {
            keyStatsAggregated[keyStatsKey] = {
                channelId,
                keyIndex: metrics.multiKeyIndex,
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
        const keyAgg = keyStatsAggregated[keyStatsKey];
        keyAgg.promptTokens += metrics.promptTokens;
        keyAgg.completionTokens += metrics.completionTokens;
        keyAgg.cacheHitTokens += metrics.cacheHitTokens;
        keyAgg.tokens += metrics.tokens;
        keyAgg.requestCount++;
        keyAgg.quota += log.quota || 0;
        keyAgg.errorCount += log.type === LOG_TYPE_ERROR ? 1 : 0;
        keyAgg.latencySum += log.useTime || 0;
        accumulateExtended(keyAgg, metrics, log);
    });

    if (Object.keys(keyStatsAggregated).length === 0) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            const stmt = db.prepare(`
                INSERT INTO key_stats (
                    channel_id, key_index, model_name, hour,
                    prompt_tokens, completion_tokens, cache_hit_tokens, tokens, request_count, quota, error_count, avg_latency,
                    cache_creation_tokens, image_tokens, audio_tokens, reasoning_requests,
                    tool_calls, tool_quota, success_count,
                    first_token_ms_sum, first_token_count, use_time_sum_sec, total_input_tokens
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(channel_id, key_index, model_name, hour)
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
                    use_time_sum_sec = use_time_sum_sec + excluded.use_time_sum_sec,
                    total_input_tokens = total_input_tokens + excluded.total_input_tokens
            `);
            Object.values(keyStatsAggregated).forEach(agg => {
                const avgLatency = agg.requestCount > 0 ? Math.round(agg.latencySum / agg.requestCount) : 0;
                stmt.run(
                    agg.channelId, agg.keyIndex, agg.modelName, agg.hour,
                    agg.promptTokens, agg.completionTokens, agg.cacheHitTokens, agg.tokens,
                    agg.requestCount, agg.quota, agg.errorCount, avgLatency,
                    agg.cacheCreationTokens, agg.imageTokens, agg.audioTokens, agg.reasoningRequests,
                    agg.toolCalls, agg.toolQuota, agg.successCount,
                    agg.firstTokenMsSum, agg.firstTokenCount, agg.useTimeSumSec, agg.totalInputTokens
                );
            });
            stmt.finalize();
            db.run("COMMIT", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

const KEY_STATS_BACKFILL_PROGRESS_KEY = 'key_stats_backfill_progress_id_v1';
const KEY_STATS_BACKFILL_DONE_KEY = 'key_stats_backfill_done_v1';

async function stepKeyStatsBackfill() {
    const done = await getMeta(KEY_STATS_BACKFILL_DONE_KEY);
    if (done) {
        return { skipped: true };
    }

    const endIdStr = await getMeta(EXTENDED_BACKFILL_END_KEY);
    if (!endIdStr) {
        return { skipped: true };
    }
    const endId = parseInt(endIdStr, 10);

    const progressStr = await getMeta(KEY_STATS_BACKFILL_PROGRESS_KEY);
    let progressId = progressStr ? parseInt(progressStr, 10) : 0;
    if (progressId >= endId) {
        await setMeta(KEY_STATS_BACKFILL_DONE_KEY, new Date().toISOString());
        return { skipped: true, completed: true };
    }

    let processedLogs = 0;
    let processedBatches = 0;

    while (processedBatches < MAX_BATCHES_PER_RUN) {
        const logs = await prisma.log.findMany({
            where: {
 select: LOG_SELECT,
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
        console.log(`[BACKFILL-KEY] Batch ${processedBatches}: fetched ${logs.length} logs (id>${progressId}, <=${endId})`);

        await updateKeyStatsOnly(logs);

        progressId = logs[logs.length - 1].id;
        await setMeta(KEY_STATS_BACKFILL_PROGRESS_KEY, progressId.toString());
    }

    const completed = progressId >= endId;
    if (completed) {
        await setMeta(KEY_STATS_BACKFILL_DONE_KEY, new Date().toISOString());
    }

    return { processedLogs, processedBatches, progressId, endId, completed };
}

module.exports = {
    syncLogs,    stepKeyStatsBackfill,
    syncChannelSnapshots,
    cleanOldData,
    getSyncState,
    prisma,
    rebuildStatsForDateRange,
    ensureUsageStatsBackfill,
    captureExtendedBackfillBoundary,
    stepExtendedMetricsBackfill,
    stepTotalInputBackfill,
    parseCacheHitTokens,
    getRebuildHourRange,
    updateStats,
    updateUsageStats
};