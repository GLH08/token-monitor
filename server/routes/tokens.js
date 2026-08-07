const express = require('express');
const router = express.Router();
const db = require('../db');
const { prisma } = require('../syncer');
const { metricsFromLog } = require('../tokenMetrics');
const { parseTimeRange, parseOptionalId, sendValidationError } = require('../request');

const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;

function mapTokenUsageTotals(row = {}) {
    const promptTokens = Number(row.prompt_tokens) || 0;
    const completionTokens = Number(row.completion_tokens) || 0;
    const cacheReadTokens = Number(row.cache_read_tokens ?? row.cache_hit_tokens) || 0;
    const cacheCreationTokens = Number(row.cache_creation_tokens) || 0;
    const totalInputTokens = Number(row.total_input_tokens) > 0
        ? Number(row.total_input_tokens)
        : promptTokens;
    const throughputTotal = totalInputTokens + completionTokens;

    return {
        quota: Number(row.quota) || 0,
        requests: Number(row.requests) || 0,
        tokens: Number(row.tokens) || promptTokens + completionTokens,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cache_read_tokens: cacheReadTokens,
        cache_creation_tokens: cacheCreationTokens,
        total_input_tokens: totalInputTokens,
        net_input_tokens: Math.max(0, totalInputTokens - cacheReadTokens - cacheCreationTokens),
        throughput_total: throughputTotal,
        throughput_tokens: throughputTotal,
        image_tokens: Number(row.image_tokens) || 0,
        audio_tokens: Number(row.audio_tokens) || 0
    };
}

function aggregateTokenUsage(logs) {
    const hourlyUsage = {};
    logs.forEach((log) => {
        const hour = Math.floor(Number(log.createdAt) / 3600) * 3600;
        if (!hourlyUsage[hour]) {
            hourlyUsage[hour] = {
                quota: 0,
                requests: 0,
                tokens: 0,
                prompt_tokens: 0,
                completion_tokens: 0,
                cache_read_tokens: 0,
                cache_creation_tokens: 0,
                total_input_tokens: 0,
                image_tokens: 0,
                audio_tokens: 0
            };
        }

        const bucket = hourlyUsage[hour];
        const metrics = metricsFromLog(log);
        bucket.quota += Number(log.quota) || 0;
        bucket.requests += 1;
        bucket.tokens += metrics.tokens;
        bucket.prompt_tokens += metrics.promptTokens;
        bucket.completion_tokens += metrics.completionTokens;
        bucket.cache_read_tokens += metrics.cacheReadTokens;
        bucket.cache_creation_tokens += metrics.cacheCreationTokens;
        bucket.total_input_tokens += metrics.totalInputTokens;
        bucket.image_tokens += metrics.imageTokens;
        bucket.audio_tokens += metrics.audioInputTokens + metrics.audioOutputTokens;
    });

    return Object.entries(hourlyUsage)
        .map(([hour, row]) => ({ hour: Number(hour), ...mapTokenUsageTotals(row) }))
        .sort((a, b) => a.hour - b.hour);
}

router.get('/overview', async (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const timeRange = parseTimeRange(req.query, { startTs: now - 24 * 3600, endTs: now });
    if (!timeRange) {
        return sendValidationError(res);
    }

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

        const usageRows = await db.allAsync(
            `SELECT token_id, SUM(request_count) as requests, SUM(tokens) as tokens,
                    SUM(prompt_tokens) as prompt_tokens, SUM(completion_tokens) as completion_tokens,
                    SUM(cache_hit_tokens) as cache_read_tokens,
                    SUM(cache_creation_tokens) as cache_creation_tokens,
                    SUM(total_input_tokens) as total_input_tokens,
                    SUM(image_tokens) as image_tokens, SUM(audio_tokens) as audio_tokens,
                    SUM(quota) as quota
             FROM usage_stats
             WHERE hour >= ? AND hour <= ?
             GROUP BY token_id`,
            [timeRange.startTs, timeRange.endTs]
        );
        const usageMap = Object.fromEntries(usageRows.map((row) => [row.token_id, row]));

        const result = tokens.map(t => {
            const usedQuota = Number(t.usedQuota) || 0;
            const remainQuota = Number(t.remainQuota) || 0;
            const usage = mapTokenUsageTotals(usageMap[t.id]);
            const recentQuota = usage.quota;
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
                usedCount: usage.requests || 0,
                requests: usage.requests || 0,
                tokens: usage.tokens || 0,
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                cache_read_tokens: usage.cache_read_tokens,
                cache_creation_tokens: usage.cache_creation_tokens,
                total_input_tokens: usage.total_input_tokens,
                net_input_tokens: usage.net_input_tokens,
                throughput_total: usage.throughput_total,
                throughput_tokens: usage.throughput_tokens,
                image_tokens: usage.image_tokens,
                audio_tokens: usage.audio_tokens,
                quota: recentQuota,
                cost: recentQuota / QUOTA_PER_UNIT,
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

        res.json({ tokens: result, statusCount, total: result.length, timeRange });
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
            select: {
                createdAt: true,
                quota: true,
                modelName: true,
                promptTokens: true,
                completionTokens: true,
                other: true,
                useTime: true
            }
        });

        res.json(aggregateTokenUsage(logs).map((data) => ({
            ...data,
            time: new Date(data.hour * 1000).toLocaleString(),
            cost: data.quota / QUOTA_PER_UNIT
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
module.exports.aggregateTokenUsage = aggregateTokenUsage;
module.exports.mapTokenUsageTotals = mapTokenUsageTotals;
