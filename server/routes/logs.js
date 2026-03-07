const express = require('express');
const router = express.Router();
const db = require('../db');
const { prisma } = require('../syncer');
const {
    parseTimeRange,
    parseOptionalId,
    parsePagination,
    sendValidationError
} = require('../request');

const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;

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
        if (req.query.model_name) where.modelName = { contains: req.query.model_name };
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
                    id: true, createdAt: true, channelId: true, modelName: true,
                    useTime: true, promptTokens: true, completionTokens: true, quota: true, content: true,
                    ip: true, requestId: true
                }
            }),
            prisma.log.aggregate({
                where,
                _sum: { promptTokens: true, completionTokens: true, quota: true }
            })
        ]);

        res.json({
            data: logs.map(l => ({ ...l, createdAt: l.createdAt.toString() })),
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
        if (req.query.model_name) where.modelName = { contains: req.query.model_name };
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
