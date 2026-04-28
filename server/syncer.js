const { PrismaClient } = require('@prisma/client');
const db = require('./db');

const prisma = new PrismaClient();

const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = Number.parseInt(process.env.SYNC_MAX_BATCHES_PER_RUN || '100', 10);
const LOG_TYPE_CONSUME = 2;
const LOG_TYPE_ERROR = 5;

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

function getNestedNumber(source, path) {
    const value = path.reduce((current, key) => current && current[key], source);
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function parseCacheHitTokens(other) {
    if (!other) {
        return 0;
    }

    try {
        const parsed = typeof other === 'string' ? JSON.parse(other) : other;
        if (!parsed || typeof parsed !== 'object') {
            return 0;
        }

        const candidates = [
            ['cached_tokens'],
            ['cache_hit_tokens'],
            ['cacheHitTokens'],
            ['cache_read_input_tokens'],
            ['prompt_tokens_details', 'cached_tokens'],
            ['usage', 'prompt_tokens_details', 'cached_tokens'],
            ['input_token_details', 'cache_read']
        ];

        return candidates.reduce((max, path) => Math.max(max, getNestedNumber(parsed, path)), 0);
    } catch (error) {
        return 0;
    }
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

async function updateAggregates(logs, { includeStats, includeUsageStats }) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            const statsStmt = includeStats ? db.prepare(`
                INSERT INTO stats (channel_id, model_name, hour, tokens, request_count, quota, error_count, avg_latency)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(channel_id, model_name, hour)
                DO UPDATE SET
                    tokens = tokens + excluded.tokens,
                    request_count = request_count + excluded.request_count,
                    quota = quota + excluded.quota,
                    error_count = error_count + excluded.error_count,
                    avg_latency = CASE
                        WHEN request_count + excluded.request_count > 0
                        THEN (avg_latency * request_count + excluded.avg_latency * excluded.request_count) / (request_count + excluded.request_count)
                        ELSE 0
                    END
            `) : null;

            const usageStmt = includeUsageStats ? db.prepare(`
                INSERT INTO usage_stats (
                    hour, user_group, channel_id, model_name, token_id,
                    prompt_tokens, completion_tokens, cache_hit_tokens, tokens, request_count, quota, error_count, avg_latency
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    END
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
                const promptTokens = log.promptTokens || 0;
                const completionTokens = log.completionTokens || 0;
                const totalTokens = promptTokens + completionTokens;
                const quota = log.quota || 0;
                const latency = log.useTime || 0;
                const cacheHitTokens = parseCacheHitTokens(log.other);
                const errorCount = log.type === LOG_TYPE_ERROR ? 1 : 0;

                if (includeStats) {
                    const statsKey = `${channelId}:${modelName}:${hour}`;
                    if (!statsAggregated[statsKey]) {
                        statsAggregated[statsKey] = {
                            channelId,
                            modelName,
                            hour,
                            tokens: 0,
                            requestCount: 0,
                            quota: 0,
                            errorCount: 0,
                            latencySum: 0
                        };
                    }
                    const statsAgg = statsAggregated[statsKey];
                    statsAgg.tokens += totalTokens;
                    statsAgg.requestCount++;
                    statsAgg.quota += quota;
                    statsAgg.errorCount += errorCount;
                    statsAgg.latencySum += latency;
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
                            latencySum: 0
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
                }
            });

            if (statsStmt) {
                Object.values(statsAggregated).forEach(agg => {
                    const avgLatency = agg.requestCount > 0 ? Math.round(agg.latencySum / agg.requestCount) : 0;
                    statsStmt.run(
                        agg.channelId,
                        agg.modelName,
                        agg.hour,
                        agg.tokens,
                        agg.requestCount,
                        agg.quota,
                        agg.errorCount,
                        avgLatency
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
                        avgLatency
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

    // 1. 从 stats 中删除旧有聚合数据
    await new Promise((resolve, reject) => {
        db.run("DELETE FROM stats WHERE hour >= ? AND hour <= ?", [startTs, endTs], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });

    await new Promise((resolve, reject) => {
        db.run("DELETE FROM usage_stats WHERE hour >= ? AND hour <= ?", [startTs, endTs], function(err) {
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
                createdAt: { gte: BigInt(startTs), lte: BigInt(endTs) },
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

    return { processedLogs, processedBatches, timeRange: { startTs, endTs } };
}

async function rebuildUsageStatsForDateRange(startTs, endTs, maxId = null) {
    if (!startTs || !endTs || startTs >= endTs) {
        throw new Error('Invalid time range for usage_stats rebuild');
    }

    await new Promise((resolve, reject) => {
        db.run("DELETE FROM usage_stats WHERE hour >= ? AND hour <= ?", [startTs, endTs], function(err) {
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
            createdAt: { gte: BigInt(startTs), lte: BigInt(endTs) },
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

    return { processedLogs, processedBatches, timeRange: { startTs, endTs } };
}

async function ensureUsageStatsBackfill() {
    const lastIdStr = await getMeta('last_synced_id');
    const lastSyncedId = lastIdStr ? parseInt(lastIdStr, 10) : 0;
    if (!lastSyncedId) {
        await setMeta('usage_stats_backfilled_v1', new Date().toISOString());
        await setMeta('usage_stats_cache_hit_backfilled_v1', new Date().toISOString());
        return { skipped: true };
    }

    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - 30 * 24 * 3600;
    const completed = await getMeta('usage_stats_backfilled_v1');
    const cacheHitCompleted = await getMeta('usage_stats_cache_hit_backfilled_v1');

    if (completed && cacheHitCompleted) {
        return { skipped: true };
    }

    const result = await rebuildUsageStatsForDateRange(startTs, endTs, lastSyncedId);
    if (!completed) {
        await setMeta('usage_stats_backfilled_v1', new Date().toISOString());
    }
    await setMeta('usage_stats_cache_hit_backfilled_v1', new Date().toISOString());
    return result;
}

module.exports = { syncLogs, syncChannelSnapshots, cleanOldData, getSyncState, prisma, rebuildStatsForDateRange, ensureUsageStatsBackfill, parseCacheHitTokens };

