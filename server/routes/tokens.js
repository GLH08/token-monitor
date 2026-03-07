const express = require('express');
const router = express.Router();
const { prisma } = require('../syncer');
const { parseTimeRange, parseOptionalId, sendValidationError } = require('../request');

const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;

router.get('/overview', async (req, res) => {
    try {
        const tokens = await prisma.token.findMany({
            where: { deletedAt: null },
            select: {
                id: true, name: true, status: true,
                remainQuota: true, usedQuota: true,
                unlimitedQuota: true, expiredTime: true,
                accessedTime: true, group: true
            }
        });

        const now = Math.floor(Date.now() / 1000);
        const result = tokens.map(t => {
            const usedQuota = Number(t.usedQuota) || 0;
            const remainQuota = Number(t.remainQuota) || 0;
            return {
                id: t.id,
                name: t.name,
                status: t.status,
                remainQuota: remainQuota,
                usedQuota: usedQuota,
                unlimitedQuota: t.unlimitedQuota,
                expiredTime: t.expiredTime ? Number(t.expiredTime) : -1,
                accessedTime: t.accessedTime ? Number(t.accessedTime) : null,
                group: t.group,
                usedCount: 0,
                isExpired: t.expiredTime && t.expiredTime !== BigInt(-1) && Number(t.expiredTime) < now,
                isExhausted: !t.unlimitedQuota && remainQuota <= 0,
                usagePercent: t.unlimitedQuota ? null :
                    (usedQuota + remainQuota > 0 ? (usedQuota / (usedQuota + remainQuota) * 100).toFixed(1) : '0')
            };
        });

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

router.get('/:id/usage', async (req, res) => {
    const timeRange = parseTimeRange(req.query);
    const tokenId = parseOptionalId(req.params.id);

    if (!timeRange || tokenId === null || timeRange.startTs === null || timeRange.endTs === null) {
        return sendValidationError(res);
    }

    try {
        const logs = await prisma.log.findMany({
            where: {
                tokenId,
                createdAt: { gte: timeRange.startTs, lte: timeRange.endTs },
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
            cost: data.quota / QUOTA_PER_UNIT,
            requests: data.requests,
            tokens: data.tokens
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
