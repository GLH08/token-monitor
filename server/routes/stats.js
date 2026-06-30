const express = require('express');
const router = express.Router();
const db = require('../db');
const { prisma } = require('../syncer');
const { mapStatsTotals, STATS_TOKEN_SUM_SQL } = require('../tokenMetrics');
const {
    parseTimeRange,
    parseOptionalId,
    parseModelList,
    parseHours,
    sendValidationError
} = require('../request');

const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;

function withTokenMetrics(row = {}) {
    return mapStatsTotals(row);
}

router.get('/stats', async (req, res) => {
    const { channel_id, model_name } = req.query;
    const timeRange = parseTimeRange(req.query);
    const channelId = parseOptionalId(channel_id);

    if (!timeRange || (channel_id && channelId === null)) {
        return sendValidationError(res);
    }

    let query = `SELECT channel_id, model_name, hour, prompt_tokens, completion_tokens, cache_hit_tokens,
                 tokens, request_count, quota, error_count, avg_latency FROM stats WHERE 1=1`;
    const params = [];

    if (channelId !== null) { query += " AND channel_id = ?"; params.push(channelId); }
    if (model_name) { query += " AND model_name = ?"; params.push(model_name); }
    if (timeRange.startTs !== null) { query += " AND hour >= ?"; params.push(timeRange.startTs); }
    if (timeRange.endTs !== null) { query += " AND hour <= ?"; params.push(timeRange.endTs); }
    query += " ORDER BY hour ASC";

    try {
        const rows = await db.allAsync(query, params);
        res.json(rows.map((row) => ({
            ...row,
            ...withTokenMetrics(row)
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/summary', async (req, res) => {
    const timeRange = parseTimeRange(req.query);
    if (!timeRange) {
        return sendValidationError(res);
    }

    let query = `SELECT ${STATS_TOKEN_SUM_SQL},
                 SUM(request_count) as total_requests,
                 SUM(quota) as total_quota, SUM(error_count) as total_errors,
                 COUNT(DISTINCT model_name) as active_models FROM stats WHERE 1=1`;
    const params = [];
    if (timeRange.startTs !== null) { query += " AND hour >= ?"; params.push(timeRange.startTs); }
    if (timeRange.endTs !== null) { query += " AND hour <= ?"; params.push(timeRange.endTs); }

    try {
        const row = await db.getAsync(query, params);
        const tokenMetrics = withTokenMetrics({
            prompt_tokens: row?.prompt_tokens,
            completion_tokens: row?.completion_tokens,
            cache_hit_tokens: row?.cache_hit_tokens,
            tokens: row?.tokens
        });

        res.json({
            total_tokens: tokenMetrics.tokens,
            total_prompt_tokens: tokenMetrics.prompt_tokens,
            total_completion_tokens: tokenMetrics.completion_tokens,
            total_cache_hit_tokens: tokenMetrics.cache_hit_tokens,
            net_input_tokens: tokenMetrics.net_input_tokens,
            throughput_total: tokenMetrics.throughput_total,
            total_requests: row?.total_requests || 0,
            total_quota: row?.total_quota || 0,
            total_errors: row?.total_errors || 0,
            active_models: row?.active_models || 0,
            total_cost: (row?.total_quota || 0) / QUOTA_PER_UNIT
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/analysis', async (req, res) => {
    const { type } = req.query;
    const timeRange = parseTimeRange(req.query);
    if (!timeRange || !['channel', 'model'].includes(type)) {
        return sendValidationError(res);
    }

    const groupBy = type === 'channel' ? 'channel_id' : 'model_name';
    let query = `SELECT ${groupBy} as name, ${STATS_TOKEN_SUM_SQL},
                 SUM(quota) as quota, SUM(request_count) as requests, SUM(error_count) as errors
                 FROM stats WHERE 1=1`;
    const params = [];
    if (timeRange.startTs !== null) { query += " AND hour >= ?"; params.push(timeRange.startTs); }
    if (timeRange.endTs !== null) { query += " AND hour <= ?"; params.push(timeRange.endTs); }
    query += ` GROUP BY ${groupBy} ORDER BY SUM(tokens) DESC LIMIT 20`;

    try {
        const rows = await db.allAsync(query, params);
        res.json(rows.map((row) => {
            const tokenMetrics = withTokenMetrics(row);
            return {
                name: row.name,
                value: tokenMetrics.tokens,
                ...tokenMetrics,
                quota: row.quota,
                requests: row.requests,
                errors: row.errors
            };
        }));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/channels/performance', async (req, res) => {
    const timeRange = parseTimeRange(req.query);
    if (!timeRange || timeRange.startTs === null || timeRange.endTs === null) {
        return sendValidationError(res, 'start_ts and end_ts are required');
    }

    try {
        const rows = await db.allAsync(
            `SELECT channel_id, ${STATS_TOKEN_SUM_SQL}, SUM(request_count) as requests,
             SUM(quota) as quota, SUM(error_count) as errors,
             SUM(avg_latency * request_count) / SUM(request_count) as avg_latency
             FROM stats WHERE hour >= ? AND hour <= ?
             GROUP BY channel_id ORDER BY requests DESC`,
            [timeRange.startTs, timeRange.endTs]
        );

        const channelIds = rows.map(r => r.channel_id);
        const channels = await prisma.channel.findMany({
            where: { id: { in: channelIds } },
            select: { id: true, name: true, type: true }
        });
        const channelMap = Object.fromEntries(channels.map(c => [c.id, c]));

        const result = rows.map(r => {
            const tokenMetrics = withTokenMetrics(r);
            return {
                channelId: r.channel_id,
                channelName: channelMap[r.channel_id]?.name || `Channel ${r.channel_id}`,
                channelType: channelMap[r.channel_id]?.type,
                requests: r.requests,
                ...tokenMetrics,
                quota: r.quota,
                cost: r.quota / QUOTA_PER_UNIT,
                errors: r.errors,
                errorRate: r.requests > 0 ? (r.errors / r.requests * 100).toFixed(2) : 0,
                avgLatency: Math.round(r.avg_latency || 0)
            };
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/models/analysis', async (req, res) => {
    const timeRange = parseTimeRange(req.query);
    const channelId = parseOptionalId(req.query.channel_id);

    if (!timeRange || timeRange.startTs === null || timeRange.endTs === null || (req.query.channel_id && channelId === null)) {
        return sendValidationError(res, 'Invalid start_ts, end_ts, or channel_id');
    }

    try {
        let query = `SELECT model_name, ${STATS_TOKEN_SUM_SQL}, SUM(request_count) as requests,
             SUM(quota) as quota, SUM(error_count) as errors,
             SUM(avg_latency * request_count) / SUM(request_count) as avg_latency
             FROM stats WHERE hour >= ? AND hour <= ?`;
        const params = [timeRange.startTs, timeRange.endTs];

        if (channelId !== null) {
            query += ' AND channel_id = ?';
            params.push(channelId);
        }

        query += ' GROUP BY model_name ORDER BY quota DESC';

        const rows = await db.allAsync(query, params);

        const modelNames = rows.map(r => r.model_name);
        let modelMap = {};
        try {
            const models = await prisma.model.findMany({
                where: { modelName: { in: modelNames } }
            });
            modelMap = Object.fromEntries(models.map(m => [m.modelName, m]));
        } catch (e) { }

        const models = rows.map(r => {
            const tokenMetrics = withTokenMetrics(r);
            return {
                model_name: r.model_name,
                requests: r.requests,
                ...tokenMetrics,
                quota: r.quota,
                cost: r.quota / QUOTA_PER_UNIT,
                errors: r.errors,
                errorRate: r.requests > 0 ? (r.errors / r.requests * 100).toFixed(2) : 0,
                avgLatency: Math.round(r.avg_latency || 0),
                modelRatio: modelMap[r.model_name]?.modelRatio,
                completionRatio: modelMap[r.model_name]?.completionRatio
            };
        });

        const summaryTokens = models.reduce((acc, model) => ({
            prompt_tokens: acc.prompt_tokens + model.prompt_tokens,
            completion_tokens: acc.completion_tokens + model.completion_tokens,
            cache_hit_tokens: acc.cache_hit_tokens + model.cache_hit_tokens,
            tokens: acc.tokens + model.tokens,
            net_input_tokens: acc.net_input_tokens + model.net_input_tokens,
            throughput_total: acc.throughput_total + model.throughput_total
        }), {
            prompt_tokens: 0,
            completion_tokens: 0,
            cache_hit_tokens: 0,
            tokens: 0,
            net_input_tokens: 0,
            throughput_total: 0
        });

        const summary = {
            totalModels: models.length,
            totalRequests: models.reduce((sum, m) => sum + m.requests, 0),
            totalTokens: summaryTokens.tokens,
            totalPromptTokens: summaryTokens.prompt_tokens,
            totalCompletionTokens: summaryTokens.completion_tokens,
            totalCacheHitTokens: summaryTokens.cache_hit_tokens,
            netInputTokens: summaryTokens.net_input_tokens,
            throughputTotal: summaryTokens.throughput_total,
            totalCost: models.reduce((sum, m) => sum + m.cost, 0)
        };

        res.json({ models, summary });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/models/latency-compare', async (req, res) => {
    const timeRange = parseTimeRange(req.query);
    const modelList = parseModelList(req.query.models);

    if (!timeRange || timeRange.startTs === null || timeRange.endTs === null) {
        return sendValidationError(res, 'start_ts and end_ts are required');
    }

    try {
        let query = `SELECT model_name, hour, avg_latency, request_count FROM stats WHERE hour >= ? AND hour <= ?`;
        const params = [timeRange.startTs, timeRange.endTs];

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

router.get('/analysis/latency', async (req, res) => {
    const timeRange = parseTimeRange(req.query);
    if (!timeRange || timeRange.startTs === null || timeRange.endTs === null) {
        return sendValidationError(res, 'start_ts and end_ts are required');
    }

    try {
        const slowRequests = await prisma.log.findMany({
            where: {
                createdAt: { gte: timeRange.startTs, lte: timeRange.endTs },
                type: 2
            },
            orderBy: { useTime: 'desc' },
            take: 20,
            select: { id: true, useTime: true, modelName: true, channelId: true, createdAt: true }
        });

        const rows = await db.allAsync(
            `SELECT hour, SUM(request_count) as requests, ${STATS_TOKEN_SUM_SQL},
             SUM(avg_latency * request_count) / SUM(request_count) as avg_latency
             FROM stats WHERE hour >= ? AND hour <= ?
             GROUP BY hour ORDER BY hour ASC`,
            [timeRange.startTs, timeRange.endTs]
        );

        res.json({
            slow_requests: slowRequests.map(r => ({ ...r, createdAt: r.createdAt.toString() })),
            latency_trend: rows.map(r => {
                const tokenMetrics = withTokenMetrics(r);
                return {
                    hour: r.hour,
                    time: new Date(r.hour * 1000).toLocaleString(),
                    rpm: r.requests,
                    tpm: tokenMetrics.tokens,
                    ...tokenMetrics,
                    avg_latency: Math.round(r.avg_latency || 0)
                };
            })
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/dashboard/hourly-trend', async (req, res) => {
    const hours = parseHours(req.query.hours, 24, 168);
    if (hours === null) {
        return sendValidationError(res);
    }

    try {
        const now = Math.floor(Date.now() / 1000);
        const startTime = now - (hours * 3600);

        const rows = await db.allAsync(
            `SELECT hour, SUM(request_count) as requests, ${STATS_TOKEN_SUM_SQL},
             SUM(quota) as quota, SUM(error_count) as errors,
             SUM(avg_latency * request_count) / NULLIF(SUM(request_count), 0) as avg_latency
             FROM stats WHERE hour >= ?
             GROUP BY hour ORDER BY hour ASC`,
            [startTime]
        );

        const hourMap = new Map(rows.map(r => [r.hour, r]));
        const result = [];

        for (let h = Math.floor(startTime / 3600) * 3600; h <= now; h += 3600) {
            const data = hourMap.get(h);
            const tokenMetrics = withTokenMetrics(data || {});
            result.push({
                hour: h,
                time: new Date(h * 1000).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
                requests: data?.requests || 0,
                tokens: tokenMetrics.tokens,
                ...tokenMetrics,
                quota: data?.quota || 0,
                cost: (data?.quota || 0) / QUOTA_PER_UNIT,
                errors: data?.errors || 0,
                avg_latency: Math.round(data?.avg_latency || 0)
            });
        }

        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/dashboard/model-distribution', async (req, res) => {
    const timeRange = parseTimeRange(req.query);
    if (!timeRange || timeRange.startTs === null || timeRange.endTs === null) {
        return sendValidationError(res, 'start_ts and end_ts are required');
    }

    try {
        const rows = await db.allAsync(
            `SELECT model_name, SUM(request_count) as requests, ${STATS_TOKEN_SUM_SQL}, SUM(quota) as quota
             FROM stats WHERE hour >= ? AND hour <= ?
             GROUP BY model_name ORDER BY requests DESC LIMIT 10`,
            [timeRange.startTs, timeRange.endTs]
        );

        const total = rows.reduce((sum, r) => sum + r.requests, 0);
        const result = rows.map(r => {
            const tokenMetrics = withTokenMetrics(r);
            return {
                name: r.model_name,
                requests: r.requests,
                ...tokenMetrics,
                quota: r.quota,
                cost: r.quota / QUOTA_PER_UNIT,
                percentage: total > 0 ? parseFloat((r.requests / total * 100).toFixed(2)) : 0
            };
        });

        res.json({ success: true, data: result, total });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;