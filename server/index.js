const express = require('express');
const cors = require('cors');
const path = require('path');
const { syncLogs } = require('./syncer');
const { checkAlerts } = require('./alerter');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;

// Auth Middleware
const authMiddleware = (req, res, next) => {
    if (!ACCESS_PASSWORD) return next(); // No password set, allow all

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${ACCESS_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Apply Auth to all /api routes except login (if we had one, but client handles token storage)
app.use('/api', authMiddleware);

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// API: Get Stats
app.get('/api/stats', (req, res) => {
    const { channel_id, model_name, start_ts, end_ts } = req.query;

    let query = "SELECT channel_id, model_name, hour, tokens, request_count FROM stats WHERE 1=1";
    let params = [];

    if (channel_id) {
        query += " AND channel_id = ?";
        params.push(channel_id);
    }
    if (model_name) {
        query += " AND model_name = ?";
        params.push(model_name);
    }
    if (start_ts) {
        query += " AND hour >= ?";
        params.push(start_ts);
    }
    if (end_ts) {
        query += " AND hour <= ?";
        params.push(end_ts);
    }

    query += " ORDER BY hour ASC";

    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// API: Get Summary
app.get('/api/summary', (req, res) => {
    const { start_ts, end_ts } = req.query;
    let query = `
        SELECT 
            SUM(tokens) as total_tokens, 
            SUM(request_count) as total_requests,
            COUNT(DISTINCT model_name) as active_models
        FROM stats WHERE 1=1
    `;
    let params = [];

    if (start_ts) {
        query += " AND hour >= ?";
        params.push(start_ts);
    }
    if (end_ts) {
        query += " AND hour <= ?";
        params.push(end_ts);
    }

    db.get(query, params, (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(row || { total_tokens: 0, total_requests: 0, active_models: 0 });
    });
});

// API: Get Analysis (Grouped)
app.get('/api/analysis', (req, res) => {
    const { type, start_ts, end_ts } = req.query; // type: 'model' or 'channel'
    const groupBy = type === 'channel' ? 'channel_id' : 'model_name';

    let query = `
        SELECT ${groupBy} as name, SUM(tokens) as value 
        FROM stats WHERE 1=1
    `;
    let params = [];

    if (start_ts) {
        query += " AND hour >= ?";
        params.push(start_ts);
    }
    if (end_ts) {
        query += " AND hour <= ?";
        params.push(end_ts);
    }

    query += ` GROUP BY ${groupBy} ORDER BY value DESC LIMIT 20`; // Increased limit for better visualization

    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// API: Get Latency & RPM/TPM Analysis
app.get('/api/analysis/latency', async (req, res) => {
    const { start_ts, end_ts } = req.query;

    try {
        const where = {};
        if (start_ts) where.createdAt = { gte: parseInt(start_ts) };
        if (end_ts) where.createdAt = { ...where.createdAt, lte: parseInt(end_ts) };

        // 1. Get Slowest Requests (Top 20)
        const slowRequests = await prisma.log.findMany({
            where,
            orderBy: { useTime: 'desc' },
            take: 20,
            select: {
                id: true,
                useTime: true,
                modelName: true,
                channelId: true,
                createdAt: true,
                content: false // Don't fetch full content for list
            }
        });

        // 2. Calculate Trend (Latency, RPM, TPM)
        // Fetch recent logs (limit 5000 for performance)
        const recentLogs = await prisma.log.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 5000,
            select: {
                createdAt: true,
                useTime: true,
                promptTokens: true,
                completionTokens: true
            }
        });

        const trend = {};
        recentLogs.forEach(log => {
            const date = new Date(Number(log.createdAt) * 1000);
            // Group by minute for finer granularity, or hour
            // Let's do per hour for stability, or per 10 mins?
            // User wants RPM/TPM, usually per minute. But 5000 logs might span a long time.
            // Let's stick to Hourly for now to match the previous "Trend" concept, but calculate Rate per Minute (avg) within that hour?
            // Or just show "Requests per Hour" and "Tokens per Hour".
            // Let's do "Per Hour" grouping.
            const key = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`;

            if (!trend[key]) trend[key] = {
                latencySum: 0,
                count: 0,
                tokens: 0
            };

            trend[key].latencySum += log.useTime;
            trend[key].count++;
            trend[key].tokens += (log.promptTokens + log.completionTokens);
        });

        const trendData = Object.keys(trend).map(key => ({
            time: key,
            avg_latency: Math.round(trend[key].latencySum / trend[key].count),
            rpm: trend[key].count, // Actually Requests Per Hour in this sample
            tpm: trend[key].tokens // Tokens Per Hour
        })).reverse();

        res.json({
            slow_requests: slowRequests.map(r => ({
                ...r,
                createdAt: r.createdAt.toString()
            })),
            latency_trend: trendData
        });

    } catch (error) {
        console.error("Latency analysis error:", error);
        res.status(500).json({ error: error.message });
    }
});

// API: Get Raw Logs (Direct from Prisma)
app.get('/api/logs', async (req, res) => {
    const { page = 1, pageSize = 20, channel_id, model_name, start_ts, end_ts } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    try {
        const where = {};
        if (channel_id) where.channelId = parseInt(channel_id);
        if (model_name) where.modelName = { contains: model_name };

        // Time range filter
        if (start_ts || end_ts) {
            where.createdAt = {};
            if (start_ts) where.createdAt.gte = parseInt(start_ts);
            if (end_ts) where.createdAt.lte = parseInt(end_ts);
        }

        const [total, logs, stats] = await prisma.$transaction([
            prisma.log.count({ where }),
            prisma.log.findMany({
                where,
                skip,
                take: parseInt(pageSize),
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    createdAt: true,
                    channelId: true,
                    modelName: true,
                    useTime: true,
                    promptTokens: true,
                    completionTokens: true,
                    quota: true,
                    content: true  // 添加完整内容字段
                }
            }),
            // Aggregate stats for the filtered logs
            prisma.log.aggregate({
                where,
                _sum: {
                    promptTokens: true,
                    completionTokens: true,
                    quota: true
                }
            })
        ]);

        // Convert BigInt to string for JSON serialization
        const serializedLogs = logs.map(log => ({
            ...log,
            createdAt: log.createdAt.toString(),
            id: log.id
        }));

        res.json({
            data: serializedLogs,
            total,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            stats: {
                total_tokens: (stats._sum.promptTokens || 0) + (stats._sum.completionTokens || 0),
                total_cost: (stats._sum.quota || 0) / 500000 // Assuming 500k quota = $1
            }
        });
    } catch (error) {
        console.error("Logs fetch error:", error);
        res.status(500).json({ error: error.message });
    }
});

// API: Get Channels
app.get('/api/channels', async (req, res) => {
    try {
        const channels = await prisma.channel.findMany({
            select: { id: true, name: true }
        });
        res.json(channels);
    } catch (error) {
        console.error("Channels fetch error:", error);
        res.status(500).json({ error: error.message });
    }
});

// API: Get Alerts
app.get('/api/alerts', (req, res) => {
    db.all("SELECT * FROM alerts", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// API: Create Alert
app.post('/api/alerts', (req, res) => {
    const { name, rule, enabled, start_time, end_time, notify_telegram, notify_feishu, notify_wecom, trigger_action } = req.body;
    db.run(
        "INSERT INTO alerts (name, rule, enabled, start_time, end_time, notify_telegram, notify_feishu, notify_wecom, trigger_action) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            name,
            JSON.stringify(rule),
            enabled ? 1 : 0,
            start_time,
            end_time,
            notify_telegram ? 1 : 0,
            notify_feishu ? 1 : 0,
            notify_wecom ? 1 : 0,
            trigger_action || 'notify'
        ],
        function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

// API: Update Alert
app.put('/api/alerts/:id', (req, res) => {
    const { name, rule, enabled, start_time, end_time, notify_telegram, notify_feishu, notify_wecom, trigger_action } = req.body;
    db.run(
        "UPDATE alerts SET name = ?, rule = ?, enabled = ?, start_time = ?, end_time = ?, notify_telegram = ?, notify_feishu = ?, notify_wecom = ?, trigger_action = ? WHERE id = ?",
        [
            name,
            JSON.stringify(rule),
            enabled ? 1 : 0,
            start_time,
            end_time,
            notify_telegram ? 1 : 0,
            notify_feishu ? 1 : 0,
            notify_wecom ? 1 : 0,
            trigger_action || 'notify',
            req.params.id
        ],
        function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true });
        }
    );
});

// API: Toggle Alert
app.patch('/api/alerts/:id/toggle', (req, res) => {
    const { enabled } = req.body;
    db.run(
        "UPDATE alerts SET enabled = ? WHERE id = ?",
        [enabled ? 1 : 0, req.params.id],
        function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true });
        }
    );
});

// API: Delete Alert
app.delete('/api/alerts/:id', (req, res) => {
    db.run("DELETE FROM alerts WHERE id = ?", [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

// Production: Serve static frontend files
if (process.env.NODE_ENV === 'production') {
    const publicPath = path.join(__dirname, 'public');
    app.use(express.static(publicPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });
}

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Start Sync Loop (every 5 seconds)
    setInterval(async () => {
        await syncLogs();
    }, 5000);

    // Start Alert Loop (every 60 seconds)
    setInterval(async () => {
        await checkAlerts();
    }, 60000);
});
