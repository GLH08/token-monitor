const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { syncLogs, syncChannelSnapshots, cleanOldData, prisma } = require('./syncer');
const { checkAlerts, getAlertHistory, ALERT_TYPES } = require('./alerter');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;

// ==================== 认证中间件 ====================
const authMiddleware = (req, res, next) => {
    if (!ACCESS_PASSWORD) return next();
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${ACCESS_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

app.use('/api', authMiddleware);

// ==================== 基础统计 API ====================
app.get('/api/stats', async (req, res) => {
    const { channel_id, model_name, start_ts, end_ts } = req.query;
    let query = "SELECT channel_id, model_name, hour, tokens, request_count, quota, error_count, avg_latency FROM stats WHERE 1=1";
    let params = [];

    if (channel_id) { query += " AND channel_id = ?"; params.push(channel_id); }
    if (model_name) { query += " AND model_name = ?"; params.push(model_name); }
    if (start_ts) { query += " AND hour >= ?"; params.push(start_ts); }
    if (end_ts) { query += " AND hour <= ?"; params.push(end_ts); }
    query += " ORDER BY hour ASC";

    try {
        const rows = await db.allAsync(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/summary', async (req, res) => {
    const { start_ts, end_ts } = req.query;
    let query = `SELECT SUM(tokens) as total_tokens, SUM(request_count) as total_requests,
                 SUM(quota) as total_quota, SUM(error_count) as total_errors,
                 COUNT(DISTINCT model_name) as active_models FROM stats WHERE 1=1`;
    let params = [];
    if (start_ts) { query += " AND hour >= ?"; params.push(start_ts); }
    if (end_ts) { query += " AND hour <= ?"; params.push(end_ts); }

    try {
        const row = await db.getAsync(query, params);
        res.json({
            total_tokens: row?.total_tokens || 0,
            total_requests: row?.total_requests || 0,
            total_quota: row?.total_quota || 0,
            total_errors: row?.total_errors || 0,
            active_models: row?.active_models || 0,
            total_cost: (row?.total_quota || 0) / 500000
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/analysis', async (req, res) => {
    const { type, start_ts, end_ts } = req.query;
    const groupBy = type === 'channel' ? 'channel_id' : 'model_name';
    let query = `SELECT ${groupBy} as name, SUM(tokens) as value, SUM(quota) as quota,
                 SUM(request_count) as requests, SUM(error_count) as errors FROM stats WHERE 1=1`;
    let params = [];
    if (start_ts) { query += " AND hour >= ?"; params.push(start_ts); }
    if (end_ts) { query += " AND hour <= ?"; params.push(end_ts); }
    query += ` GROUP BY ${groupBy} ORDER BY value DESC LIMIT 20`;

    try {
        const rows = await db.allAsync(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==================== 渠道监控 API ====================
app.get('/api/channels/overview', async (req, res) => {
    try {
        const channels = await prisma.channel.findMany({
            select: {
                id: true, name: true, type: true, status: true, weight: true,
                responseTime: true, testTime: true, balance: true,
                usedQuota: true, tag: true, priority: true, models: true, group: true
            }
        });
        
        const statusCount = { enabled: 0, disabled: 0, autoDisabled: 0 };
        channels.forEach(ch => {
            if (ch.status === 1) statusCount.enabled++;
            else if (ch.status === 2) statusCount.disabled++;
            else if (ch.status === 3) statusCount.autoDisabled++;
        });
        
        res.json({ channels, statusCount, total: channels.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/channels/performance', async (req, res) => {
    const { start_ts, end_ts } = req.query;
    try {
        const rows = await db.allAsync(
            `SELECT channel_id, SUM(tokens) as tokens, SUM(request_count) as requests,
             SUM(quota) as quota, SUM(error_count) as errors,
             SUM(avg_latency * request_count) / SUM(request_count) as avg_latency
             FROM stats WHERE hour >= ? AND hour <= ?
             GROUP BY channel_id ORDER BY requests DESC`,
            [start_ts, end_ts]
        );
        
        const channelIds = rows.map(r => r.channel_id);
        const channels = await prisma.channel.findMany({
            where: { id: { in: channelIds } },
            select: { id: true, name: true, type: true }
        });
        const channelMap = Object.fromEntries(channels.map(c => [c.id, c]));
        
        const result = rows.map(r => ({
            channelId: r.channel_id,
            channelName: channelMap[r.channel_id]?.name || `Channel ${r.channel_id}`,
            channelType: channelMap[r.channel_id]?.type,
            requests: r.requests,
            tokens: r.tokens,
            quota: r.quota,
            cost: r.quota / 500000,
            errors: r.errors,
            errorRate: r.requests > 0 ? (r.errors / r.requests * 100).toFixed(2) : 0,
            avgLatency: Math.round(r.avg_latency || 0)
        }));
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ==================== 模型分析 API ====================
app.get('/api/models/analysis', async (req, res) => {
    const { start_ts, end_ts } = req.query;
    try {
        const rows = await db.allAsync(
            `SELECT model_name, SUM(tokens) as tokens, SUM(request_count) as requests,
             SUM(quota) as quota, SUM(error_count) as errors,
             SUM(avg_latency * request_count) / SUM(request_count) as avg_latency
             FROM stats WHERE hour >= ? AND hour <= ?
             GROUP BY model_name ORDER BY quota DESC`,
            [start_ts, end_ts]
        );
        
        // 获取模型定价信息
        const modelNames = rows.map(r => r.model_name);
        let modelMap = {};
        try {
            const models = await prisma.model.findMany({
                where: { modelName: { in: modelNames } }
            });
            modelMap = Object.fromEntries(models.map(m => [m.modelName, m]));
        } catch (e) { /* models 表可能不存在 */ }
        
        const models = rows.map(r => ({
            model_name: r.model_name,
            requests: r.requests,
            tokens: r.tokens,
            quota: r.quota,
            cost: r.quota / 500000,
            errors: r.errors,
            errorRate: r.requests > 0 ? (r.errors / r.requests * 100).toFixed(2) : 0,
            avgLatency: Math.round(r.avg_latency || 0),
            modelRatio: modelMap[r.model_name]?.modelRatio,
            completionRatio: modelMap[r.model_name]?.completionRatio
        }));
        
        const summary = {
            totalModels: models.length,
            totalRequests: models.reduce((sum, m) => sum + m.requests, 0),
            totalTokens: models.reduce((sum, m) => sum + m.tokens, 0),
            totalCost: models.reduce((sum, m) => sum + m.cost, 0)
        };
        
        res.json({ models, summary });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/models/latency-compare', async (req, res) => {
    const { start_ts, end_ts, models } = req.query;
    const modelList = models ? models.split(',') : [];
    
    try {
        let query = `SELECT model_name, hour, avg_latency, request_count FROM stats WHERE hour >= ? AND hour <= ?`;
        const params = [start_ts, end_ts];
        
        if (modelList.length > 0) {
            query += ` AND model_name IN (${modelList.map(() => '?').join(',')})`;
            params.push(...modelList);
        }
        query += " ORDER BY hour ASC";
        
        const rows = await db.allAsync(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ==================== Token 监控 API ====================
app.get('/api/tokens/overview', async (req, res) => {
    try {
        const tokens = await prisma.token.findMany({
            select: {
                id: true, name: true, status: true,
                remainQuota: true, usedQuota: true,
                unlimitedQuota: true, expiredTime: true,
                accessedTime: true, group: true, usedCount: true
            }
        });
        
        const now = Math.floor(Date.now() / 1000);
        const result = tokens.map(t => ({
            id: t.id,
            name: t.name,
            status: t.status,
            remainQuota: Number(t.remainQuota),
            usedQuota: Number(t.usedQuota),
            unlimitedQuota: t.unlimitedQuota,
            expiredTime: t.expiredTime ? Number(t.expiredTime) : -1,
            accessedTime: t.accessedTime ? Number(t.accessedTime) : null,
            group: t.group,
            usedCount: t.usedCount || 0,
            isExpired: t.expiredTime && t.expiredTime !== BigInt(-1) && Number(t.expiredTime) < now,
            isExhausted: !t.unlimitedQuota && t.remainQuota <= 0,
            usagePercent: t.unlimitedQuota ? null : 
                (Number(t.usedQuota) / (Number(t.usedQuota) + Number(t.remainQuota)) * 100).toFixed(1)
        }));
        
        const statusCount = {
            enabled: result.filter(t => t.status === 1).length,
            disabled: result.filter(t => t.status === 2).length,
            expired: result.filter(t => t.isExpired).length,
            exhausted: result.filter(t => t.isExhausted).length
        };
        
        res.json({ tokens: result, statusCount, total: result.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tokens/:id/usage', async (req, res) => {
    const { start_ts, end_ts } = req.query;
    const tokenId = parseInt(req.params.id);
    
    try {
        const logs = await prisma.log.findMany({
            where: {
                tokenId: tokenId,
                createdAt: { gte: parseInt(start_ts), lte: parseInt(end_ts) },
                type: 2
            },
            select: { createdAt: true, quota: true, modelName: true, promptTokens: true, completionTokens: true }
        });
        
        const hourlyUsage = {};
        logs.forEach(log => {
            const hour = Math.floor(Number(log.createdAt) / 3600) * 3600;
            if (!hourlyUsage[hour]) hourlyUsage[hour] = { quota: 0, requests: 0, tokens: 0 };
            hourlyUsage[hour].quota += log.quota;
            hourlyUsage[hour].requests++;
            hourlyUsage[hour].tokens += log.promptTokens + log.completionTokens;
        });
        
        res.json(Object.entries(hourlyUsage).map(([hour, data]) => ({
            hour: parseInt(hour),
            time: new Date(parseInt(hour) * 1000).toLocaleString(),
            quota: data.quota,
            cost: data.quota / 500000,
            requests: data.requests,
            tokens: data.tokens
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ==================== 错误日志 API ====================
app.get('/api/errors', async (req, res) => {
    const { page = 1, pageSize = 50, channel_id, model_name, start_ts, end_ts } = req.query;
    
    try {
        const where = { type: 5 };
        if (channel_id) where.channelId = parseInt(channel_id);
        if (model_name) where.modelName = { contains: model_name };
        if (start_ts || end_ts) {
            where.createdAt = {};
            if (start_ts) where.createdAt.gte = parseInt(start_ts);
            if (end_ts) where.createdAt.lte = parseInt(end_ts);
        }
        
        const [total, logs] = await prisma.$transaction([
            prisma.log.count({ where }),
            prisma.log.findMany({
                where,
                skip: (parseInt(page) - 1) * parseInt(pageSize),
                take: parseInt(pageSize),
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, createdAt: true, channelId: true,
                    modelName: true, content: true, other: true, useTime: true
                }
            })
        ]);
        
        res.json({
            logs: logs.map(l => ({
                id: l.id,
                created_at: Number(l.createdAt),
                channel_id: l.channelId,
                model_name: l.modelName,
                content: l.content,
                other: l.other,
                use_time: l.useTime
            })),
            total, page: parseInt(page), pageSize: parseInt(pageSize)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/errors/summary', async (req, res) => {
    const { start_ts, end_ts } = req.query;
    
    try {
        const rows = await db.allAsync(
            `SELECT channel_id, model_name, SUM(error_count) as errors, SUM(request_count) as total
             FROM stats WHERE hour >= ? AND hour <= ? AND error_count > 0
             GROUP BY channel_id, model_name ORDER BY errors DESC LIMIT 50`,
            [start_ts, end_ts]
        );
        
        res.json(rows.map(r => ({
            channelId: r.channel_id,
            modelName: r.model_name,
            errors: r.errors,
            total: r.total,
            errorRate: r.total > 0 ? (r.errors / r.total * 100).toFixed(2) : 0
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ==================== 性能分析 API ====================
app.get('/api/analysis/latency', async (req, res) => {
    const { start_ts, end_ts } = req.query;
    
    try {
        // 慢请求 Top 20
        const slowRequests = await prisma.log.findMany({
            where: {
                createdAt: { gte: parseInt(start_ts), lte: parseInt(end_ts) },
                type: 2
            },
            orderBy: { useTime: 'desc' },
            take: 20,
            select: { id: true, useTime: true, modelName: true, channelId: true, createdAt: true }
        });

        // 趋势数据
        const rows = await db.allAsync(
            `SELECT hour, SUM(request_count) as requests, SUM(tokens) as tokens,
             SUM(avg_latency * request_count) / SUM(request_count) as avg_latency
             FROM stats WHERE hour >= ? AND hour <= ?
             GROUP BY hour ORDER BY hour ASC`,
            [start_ts, end_ts]
        );

        res.json({
            slow_requests: slowRequests.map(r => ({ ...r, createdAt: r.createdAt.toString() })),
            latency_trend: rows.map(r => ({
                hour: r.hour,
                time: new Date(r.hour * 1000).toLocaleString(),
                rpm: r.requests,
                tpm: r.tokens,
                avg_latency: Math.round(r.avg_latency || 0)
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== 原始日志 API ====================
app.get('/api/logs', async (req, res) => {
    const { page = 1, pageSize = 20, channel_id, model_name, start_ts, end_ts } = req.query;
    
    try {
        const where = { type: 2 };
        if (channel_id) where.channelId = parseInt(channel_id);
        if (model_name) where.modelName = { contains: model_name };
        if (start_ts || end_ts) {
            where.createdAt = {};
            if (start_ts) where.createdAt.gte = parseInt(start_ts);
            if (end_ts) where.createdAt.lte = parseInt(end_ts);
        }

        const [total, logs, stats] = await prisma.$transaction([
            prisma.log.count({ where }),
            prisma.log.findMany({
                where,
                skip: (parseInt(page) - 1) * parseInt(pageSize),
                take: parseInt(pageSize),
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, createdAt: true, channelId: true, modelName: true,
                    useTime: true, promptTokens: true, completionTokens: true, quota: true, content: true
                }
            }),
            prisma.log.aggregate({
                where,
                _sum: { promptTokens: true, completionTokens: true, quota: true }
            })
        ]);

        res.json({
            data: logs.map(l => ({ ...l, createdAt: l.createdAt.toString() })),
            total, page: parseInt(page), pageSize: parseInt(pageSize),
            stats: {
                total_tokens: (stats._sum.promptTokens || 0) + (stats._sum.completionTokens || 0),
                total_cost: (stats._sum.quota || 0) / 500000
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/channels', async (req, res) => {
    try {
        const channels = await prisma.channel.findMany({ select: { id: true, name: true } });
        res.json(channels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ==================== 告警 API ====================
app.get('/api/alerts', async (req, res) => {
    try {
        const rows = await db.allAsync("SELECT * FROM alerts ORDER BY id DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/alerts', async (req, res) => {
    const { name, rule, enabled, start_time, end_time, notify_telegram, trigger_action } = req.body;
    try {
        const result = await db.runAsync(
            `INSERT INTO alerts (name, rule, enabled, start_time, end_time, notify_telegram, trigger_action, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, JSON.stringify(rule), enabled ? 1 : 0, start_time, end_time, notify_telegram ? 1 : 0, trigger_action || 'notify', Math.floor(Date.now() / 1000)]
        );
        res.json({ id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/alerts/:id', async (req, res) => {
    const { name, rule, enabled, start_time, end_time, notify_telegram, trigger_action } = req.body;
    try {
        await db.runAsync(
            `UPDATE alerts SET name = ?, rule = ?, enabled = ?, start_time = ?, end_time = ?, notify_telegram = ?, trigger_action = ? WHERE id = ?`,
            [name, JSON.stringify(rule), enabled ? 1 : 0, start_time, end_time, notify_telegram ? 1 : 0, trigger_action || 'notify', req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/alerts/:id/toggle', async (req, res) => {
    const { enabled } = req.body;
    try {
        await db.runAsync("UPDATE alerts SET enabled = ? WHERE id = ?", [enabled ? 1 : 0, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/alerts/:id', async (req, res) => {
    try {
        await db.runAsync("DELETE FROM alerts WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/alerts/history', async (req, res) => {
    const { limit = 100, alert_id } = req.query;
    try {
        const history = await getAlertHistory(parseInt(limit), alert_id ? parseInt(alert_id) : null);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/alerts/types', (req, res) => {
    res.json(ALERT_TYPES);
});


// ==================== 实时统计 ====================
let realtimeStats = { rpm: 0, tpm: 0, activeChannels: 0, activeModels: 0, timestamp: 0 };

async function updateRealtimeStats() {
    try {
        const now = Math.floor(Date.now() / 1000);
        const oneMinuteAgo = now - 60;
        
        const stats = await prisma.log.aggregate({
            where: { createdAt: { gte: oneMinuteAgo }, type: 2 },
            _count: { id: true },
            _sum: { promptTokens: true, completionTokens: true }
        });
        
        const activeChannels = await prisma.log.groupBy({
            by: ['channelId'],
            where: { createdAt: { gte: oneMinuteAgo }, type: 2 }
        });
        
        const activeModels = await prisma.log.groupBy({
            by: ['modelName'],
            where: { createdAt: { gte: oneMinuteAgo }, type: 2 }
        });
        
        realtimeStats = {
            rpm: stats._count.id || 0,
            tpm: (stats._sum.promptTokens || 0) + (stats._sum.completionTokens || 0),
            activeChannels: activeChannels.length,
            activeModels: activeModels.length,
            timestamp: now
        };
    } catch (error) {
        console.error("[REALTIME] Update error:", error.message);
    }
}

app.get('/api/realtime', (req, res) => {
    res.json(realtimeStats);
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


// ==================== 启动服务 ====================
server.listen(PORT, () => {
    console.log(`[SERVER] Running on port ${PORT}`);

    // 日志同步 (每5秒)
    setInterval(async () => {
        await syncLogs();
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
        await syncChannelSnapshots();
    }, 3600000);

    // 清理旧数据 (每天)
    setInterval(async () => {
        await cleanOldData();
    }, 86400000);

    // 启动时立即执行一次
    updateRealtimeStats();
    syncChannelSnapshots();
});
