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
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            
            const stmt = db.prepare(`
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
            `);

            // 按 channel_id + model_name + hour 聚合
            const aggregated = {};
            
            logs.forEach(log => {
                const timestamp = Number(log.createdAt);
                const hour = Math.floor(timestamp / 3600) * 3600;
                const key = `${log.channelId}:${log.modelName}:${hour}`;
                
                if (!aggregated[key]) {
                    aggregated[key] = {
                        channelId: log.channelId,
                        modelName: log.modelName,
                        hour: hour,
                        tokens: 0,
                        requestCount: 0,
                        quota: 0,
                        errorCount: 0,
                        latencySum: 0
                    };
                }
                
                const agg = aggregated[key];
                const totalTokens = (log.promptTokens || 0) + (log.completionTokens || 0);
                
                agg.tokens += totalTokens;
                agg.requestCount++;
                agg.quota += log.quota || 0;
                agg.latencySum += log.useTime || 0;
                
                if (log.type === LOG_TYPE_ERROR) {
                    agg.errorCount++;
                }
            });

            Object.values(aggregated).forEach(agg => {
                const avgLatency = agg.requestCount > 0 ? Math.round(agg.latencySum / agg.requestCount) : 0;
                stmt.run(
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

            stmt.finalize();
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

module.exports = { syncLogs, syncChannelSnapshots, cleanOldData, getSyncState, prisma, rebuildStatsForDateRange };

