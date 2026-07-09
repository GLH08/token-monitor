const express = require('express');
const router = express.Router();
const db = require('../db');
const { prisma } = require('../syncer');
const { metricsFromLog } = require('../tokenMetrics');
const {
    parseTimeRange,
    parseOptionalId,
    parsePagination,
    sendValidationError
} = require('../request');

const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;

const REQUEST_ID_KEYS = ['requestId', 'request_id', 'requestID', 'request-id', 'x-request-id'];

function extractRequestIdFromJson(value) {
    if (!value || typeof value !== 'object') return '';

    for (const key of REQUEST_ID_KEYS) {
        const direct = value[key];
        if (direct !== undefined && direct !== null && String(direct).trim()) {
            return String(direct).trim();
        }
    }

    for (const nested of Object.values(value)) {
        const found = extractRequestIdFromJson(nested);
        if (found) return found;
    }

    return '';
}

function extractRequestId(requestId, ...jsonCandidates) {
    if (requestId !== undefined && requestId !== null && String(requestId).trim()) {
        return String(requestId).trim();
    }

    for (const value of jsonCandidates) {
        if (typeof value !== 'string' || !value.trim()) continue;
        try {
            const found = extractRequestIdFromJson(JSON.parse(value));
            if (found) return found;
        } catch {
            // Non-JSON content is still searched by the SQL filter.
        }
    }

    return '';
}

function applyRequestIdFilter(where, rawRequestId) {
    const requestId = typeof rawRequestId === 'string' ? rawRequestId.trim() : '';
    if (!requestId) return;

    where.OR = [
        { requestId: { contains: requestId } },
        { content: { contains: requestId } },
        { other: { contains: requestId } }
    ];
}

router.get('/logs', async (req, res) => {
    const pagination = parsePagination(req.query, { pageSize: 20, maxPageSize: 200 });
    const timeRange = parseTimeRange(req.query);
    const channelId = parseOptionalId(req.query.channel_id);

    if (!pagination || !timeRange || (req.query.channel_id && channelId === null)) {
        return sendValidationError(res);
    }

    try {
        const where = { type: 2 };
        if (channelId !== null) where.channelId = channelId;
        if (req.query.model_name) where.modelName = req.query.model_name;
        applyRequestIdFilter(where, req.query.request_id);
        if (req.query.upstream_request_id) {
            where.upstreamRequestId = { contains: String(req.query.upstream_request_id).trim() };
        }
        if (timeRange.startTs !== null || timeRange.endTs !== null) {
            where.createdAt = {};
            if (timeRange.startTs !== null) where.createdAt.gte = timeRange.startTs;
            if (timeRange.endTs !== null) where.createdAt.lte = timeRange.endTs;
        }

        const [total, logs, stats] = await prisma.$transaction([
            prisma.log.count({ where }),
            prisma.log.findMany({
                where,
                skip: pagination.skip,
                take: pagination.take,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, createdAt: true, type: true, username: true,
                    channelId: true, modelName: true,
                    tokenId: true, tokenName: true, group: true,
                    useTime: true, promptTokens: true, completionTokens: true, quota: true, content: true, other: true,
                    ip: true, requestId: true, upstreamRequestId: true, isStream: true
                }
            }),
            prisma.log.aggregate({
                where,
                _sum: { promptTokens: true, completionTokens: true, quota: true }
            })
        ]);

        res.json({
            data: logs.map(l => {
                const inputTokens = l.promptTokens || 0;
                const outputTokens = l.completionTokens || 0;
                const billingQuota = l.quota || 0;
                const m = metricsFromLog(l);
                const requestId = extractRequestId(l.requestId, l.content, l.other);
                const useTimeSec = m.useTimeSec || 0;
                return {
                    ...l,
                    createdAt: l.createdAt.toString(),
                    requestId,
                    request_id: requestId,
                    upstream_request_id: l.upstreamRequestId || '',
                    inputTokens,
                    outputTokens,
                    cacheHitTokens: m.cacheHitTokens,
                    cache_read_tokens: m.cacheHitTokens,
                    cache_write_tokens: m.cacheCreationTokens,
                    image_tokens: m.imageTokens,
                    audio_tokens: m.audioInputTokens + m.audioOutputTokens,
                    audio_input_tokens: m.audioInputTokens,
                    audio_output_tokens: m.audioOutputTokens,
                    totalTokens: inputTokens + outputTokens,
                    billingQuota,
                    cost: billingQuota / QUOTA_PER_UNIT,
                    cost_usd: billingQuota / QUOTA_PER_UNIT,
                    frt_ms: m.frtMs,
                    use_time_sec: useTimeSec,
                    tps: useTimeSec > 0 ? Number((m.tokens / useTimeSec).toFixed(2)) : 0,
                    ratios: m.ratios,
                    billing_source: m.billingSource,
                    is_stream: l.isStream
                };
            }),
            total, page: pagination.page, pageSize: pagination.pageSize,
            stats: {
                total_tokens: (stats._sum.promptTokens || 0) + (stats._sum.completionTokens || 0),
                total_cost: (stats._sum.quota || 0) / QUOTA_PER_UNIT
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/errors', async (req, res) => {
    const pagination = parsePagination(req.query, { pageSize: 50, maxPageSize: 200 });
    const timeRange = parseTimeRange(req.query);
    const channelId = parseOptionalId(req.query.channel_id);

    if (!pagination || !timeRange || (req.query.channel_id && channelId === null)) {
        return sendValidationError(res);
    }

    try {
        const where = { type: 5 };
        if (channelId !== null) where.channelId = channelId;
        if (req.query.model_name) where.modelName = req.query.model_name;
        applyRequestIdFilter(where, req.query.request_id);
        if (timeRange.startTs !== null || timeRange.endTs !== null) {
            where.createdAt = {};
            if (timeRange.startTs !== null) where.createdAt.gte = timeRange.startTs;
            if (timeRange.endTs !== null) where.createdAt.lte = timeRange.endTs;
        }

        const [total, logs] = await prisma.$transaction([
            prisma.log.count({ where }),
            prisma.log.findMany({
                where,
                skip: pagination.skip,
                take: pagination.take,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, createdAt: true, channelId: true,
                    modelName: true, tokenId: true, tokenName: true, group: true,
                    content: true, other: true, useTime: true, requestId: true
                }
            })
        ]);

        res.json({
            logs: logs.map(l => {
                const requestId = extractRequestId(l.requestId, l.content, l.other);
                return {
                    id: l.id,
                    created_at: Number(l.createdAt),
                    channel_id: l.channelId,
                    model_name: l.modelName,
                    token_id: l.tokenId,
                    token_name: l.tokenName,
                    group: l.group,
                    request_id: requestId,
                    requestId,
                    content: l.content,
                    other: l.other,
                    use_time: l.useTime
                };
            }),
            total, page: pagination.page, pageSize: pagination.pageSize
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/errors/summary', async (req, res) => {
    const timeRange = parseTimeRange(req.query);
    if (!timeRange || timeRange.startTs === null || timeRange.endTs === null) {
        return sendValidationError(res, 'start_ts and end_ts are required');
    }

    try {
        const rows = await db.allAsync(
            `SELECT channel_id, model_name, SUM(error_count) as errors, SUM(request_count) as total
             FROM stats WHERE hour >= ? AND hour <= ? AND error_count > 0
             GROUP BY channel_id, model_name ORDER BY errors DESC LIMIT 50`,
            [timeRange.startTs, timeRange.endTs]
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

module.exports = router;
module.exports.extractRequestId = extractRequestId;
module.exports.applyRequestIdFilter = applyRequestIdFilter;
