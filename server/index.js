const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const { syncLogs, syncChannelSnapshots, cleanOldData, getSyncState, prisma, ensureUsageStatsBackfill, captureExtendedBackfillBoundary, stepExtendedMetricsBackfill, stepTotalInputBackfill, stepKeyStatsBackfill } = require('./syncer');
const { checkAlerts } = require('./alerter');
const { isAuthEnabled, verifyToken } = require('./auth');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// 额度转美元的单位（new-api 默认 500000）
const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;

// 同步延迟监控指标
const syncMetrics = {
    lastSyncTime: null,
    lastSyncDuration: 0,
    totalSyncCount: 0,
    lastError: null,
    startedAt: new Date().toISOString()
};

// 实时统计数据
let realtimeStats = { qps: 0, tps: 0, activeChannels: 0 };

async function updateRealtimeStats() {
    try {
        const now = Math.floor(Date.now() / 1000);
        const currentHour = Math.floor(now / 3600) * 3600;
        const secondsElapsed = Math.max(1, Math.min(3600, now - currentHour));

        // Query the local stats table for the current hour bucket. This avoids
        // hitting the Prisma source DB every 5 seconds; the stats table lags
        // by at most one sync interval (5s), which is acceptable for realtime.
        const row = await db.getAsync(
            `SELECT SUM(request_count) as requests,
                    SUM(tokens) as tokens,
                    COUNT(DISTINCT channel_id) as channels
             FROM stats WHERE hour = ?`,
            [currentHour]
        );

        const requests = row?.requests || 0;
        const tokens = row?.tokens || 0;
        const channels = row?.channels || 0;

        realtimeStats = {
            qps: Number((requests / secondsElapsed).toFixed(2)),
            tps: Number((tokens / secondsElapsed).toFixed(2)),
            activeChannels: channels
        };
    } catch (error) {
        console.error('[REALTIME] Update error:', error.message);
    }
}

// ==================== 认证中间件 ====================
const authMiddleware = (req, res, next) => {
    if (!isAuthEnabled()) {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const verification = verifyToken(token);
    if (!verification.valid) {
        return res.status(401).json({ error: verification.reason === 'expired' ? 'Session expired' : 'Unauthorized' });
    }

    req.auth = verification.payload;
    next();
};

app.use('/api/auth', require('./routes/auth'));
app.use('/api', authMiddleware);

app.get('/api/realtime', (req, res) => {
    res.json({ success: true, data: realtimeStats });
});

app.use('/api', require('./routes/stats'));
app.use('/api/usage', require('./routes/usage'));
app.use('/api', require('./routes/logs'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/tokens', require('./routes/tokens'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/model-status', require('./routes/modelStatus'));
app.use('/api/admin', require('./routes/admin'));

// ==================== 健康检查 & 系统信息 ====================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        startedAt: syncMetrics.startedAt,
        sync: {
            lastSyncTime: syncMetrics.lastSyncTime,
            lastSyncDuration: syncMetrics.lastSyncDuration,
            totalSyncCount: syncMetrics.totalSyncCount,
            lastError: syncMetrics.lastError,
            ...getSyncState()
        },
        timestamp: new Date().toISOString()
    });
});

app.get('/api/system/info', (req, res) => {
    res.json({
        success: true,
        data: {
            version: '2.0.0',
            quotaPerUnit: QUOTA_PER_UNIT,
            maxMonitorModels: parseInt(process.env.MAX_MONITOR_MODELS) || 50,
            syncInterval: 5000,
            alertInterval: 60000,
            sync: getSyncState()
        }
    });
});

// ==================== 静态文件服务 ====================
if (process.env.NODE_ENV === 'production') {
    const publicPath = path.join(__dirname, 'public');
    app.use(express.static(publicPath));
    app.use((req, res, next) => {
        if (req.method === 'GET' && !req.path.startsWith('/api')) {
            res.sendFile(path.join(publicPath, 'index.html'));
        } else {
            next();
        }
    });
}

// ==================== WebSocket 服务 ====================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('[WS] Client connected');
    ws.send(JSON.stringify({ type: 'realtime', data: realtimeStats }));

    ws.on('close', () => console.log('[WS] Client disconnected'));
});

function broadcastRealtimeStats() {
    const message = JSON.stringify({ type: 'realtime', data: realtimeStats });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function broadcastKeyStatusChanges(changes) {
    if (!changes || changes.length === 0) return;
    const message = JSON.stringify({ type: 'key_status_change', data: changes });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    // Record each change in alert_history for audit trail
    changes.forEach(ch => {
        const statusLabel = ch.new_status === 3 ? '自动禁用' : ch.new_status === 2 ? '手动禁用' : '启用';
        const reasonText = ch.reason ? ` (原因: ${ch.reason})` : '';
        db.runAsync(
            `INSERT INTO alert_history (alert_id, alert_name, triggered_at, value, threshold, message, action_taken)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [0, '密钥状态变更', ch.timestamp, ch.new_status, ch.old_status,
             `渠道 ${ch.channel_name} 密钥 #${ch.key_index} 状态变更: ${statusLabel}${reasonText}`,
             'key_status_change']
        ).catch(err => console.error('[WS] alert_history insert error:', err));
    });
    changes.forEach(ch => {
        const statusLabel = ch.new_status === 3 ? '自动禁用' : ch.new_status === 2 ? '手动禁用' : '启用';
        console.log(`[WS] Key status change: channel ${ch.channel_name} key #${ch.key_index} -> ${statusLabel}${ch.reason ? ` (${ch.reason})` : ''}`);
    });
}


// ==================== 启动服务 ====================
server.listen(PORT, () => {
    console.log(`[SERVER] Running on port ${PORT}`);

    // Startup backfills run STRICTLY SEQUENTIALLY before the sync loop starts:
    //   1. ensureUsageStatsBackfill (may DELETE+rebuild usage_stats rows)
    //   2. captureExtendedBackfillBoundary (persist end_id from last_synced_id)
    //   3. stepExtendedMetricsBackfill (first batch, id <= end_id)
    // Serializing them prevents the usage_stats rebuild from racing the extended
    // backfill's UPDATEs on the same rows, and capturing end_id before syncLogs
    // prevents a later re-capture from overlapping freshly-synced logs and
    // double-counting extended metrics. The sync loop awaits this chain before
    // its first syncLogs; if any step fails it is logged and the chain resolves
    // so syncing still proceeds (the backfill simply skips on a missing end_id).
    const backfillReady = ensureUsageStatsBackfill()
        .then((result) => {
            if (!result.skipped) {
                console.log(`[SYNC] Backfilled usage_stats with ${result.processedLogs} logs`);
            }
        })
        .catch((error) => console.error('[SYNC] usage_stats backfill error:', error))
        .then(() => captureExtendedBackfillBoundary())
        .catch((error) => console.error('[SYNC] extended boundary capture error:', error))
        .then(() => stepExtendedMetricsBackfill())
        .then((result) => {
            if (result && !result.skipped) {
                console.log(`[SYNC] Extended backfill step: ${result.processedLogs} logs (completed=${!!result.completed})`);
            }
        })
        .catch((error) => console.error('[SYNC] extended backfill error:', error))
        .then(() => stepTotalInputBackfill())
        .then((result) => {
            if (result && !result.skipped) {
                console.log(`[SYNC] Total-input backfill step: ${result.processedLogs} logs (completed=${!!result.completed})`);
            }
        })
        .catch((error) => console.error('[SYNC] total-input backfill error:', error))
        .then(() => stepKeyStatsBackfill())
        .then((result) => {
            if (result && !result.skipped) {
                console.log(`[SYNC] Key-stats backfill step: ${result.processedLogs} logs (completed=${!!result.completed})`);
            }
        })
        .catch((error) => console.error('[SYNC] key-stats backfill error:', error));

    // 日志同步 (每5秒) + 延迟监控
    setInterval(async () => {
        const start = Date.now();
        try {
            await backfillReady;
            const result = await syncLogs();
            syncMetrics.lastSyncTime = new Date().toISOString();
            syncMetrics.lastSyncDuration = Date.now() - start;
            syncMetrics.totalSyncCount++;
            syncMetrics.lastError = null;
            if (result.processedLogs > 0) {
                console.log(`[SYNC] Processed ${result.processedLogs} logs in ${result.processedBatches} batch(es), backlog=${result.estimatedBacklog}`);
            }
            // Continue the resumable extended-metrics backfill (bounded per run).
            await stepExtendedMetricsBackfill().catch((error) => {
                console.error('[SYNC] Extended backfill step error:', error);
            });
            // Continue the dedicated total_input_tokens backfill (bounded per run).
            await stepTotalInputBackfill().catch((error) => {
                console.error('[SYNC] Total-input backfill step error:', error);
            });
            await stepKeyStatsBackfill().catch((error) => {
                console.error('[SYNC] Key-stats backfill step error:', error);
            });
        } catch (e) {
            syncMetrics.lastError = e.message;
        }
    }, 5000);

    // 告警检查 (每60秒)
    setInterval(async () => {
        await checkAlerts();
    }, 60000);

    // 实时统计更新 (每5秒)
    setInterval(async () => {
        await updateRealtimeStats();
        broadcastRealtimeStats();
    }, 5000);

    // 渠道快照 (每小时)
    setInterval(async () => {
        const snapResult = await syncChannelSnapshots();
        broadcastKeyStatusChanges(snapResult.keyStatusChanges);
    }, 3600000);

    // 清理旧数据 (每天)
    setInterval(async () => {
        await cleanOldData();
    }, 86400000);

    // 启动时立即执行一次
    updateRealtimeStats();
    syncChannelSnapshots().then(r => broadcastKeyStatusChanges(r.keyStatusChanges));
});
