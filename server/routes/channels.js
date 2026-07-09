const express = require('express');
const router = express.Router();
const db = require('../db');
const { prisma } = require('../syncer');
const { parseTimeRange, sendValidationError } = require('../request');

const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;

// Per-channel overview enriched with health + usage metrics. Channel-table
// fields (status, response_time, auto_ban, used_quota) come from Prisma;
// error_rate + avg_latency_ms are derived from the stats aggregate (last 24h
// by default). avg_latency_ms uses use_time_sum_sec (sec -> ms); response_time
// is the channel's own test latency (ms), a different signal.
router.get('/overview', async (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const timeRange = parseTimeRange(req.query, { startTs: now - 24 * 3600, endTs: now });
    if (!timeRange) {
        return sendValidationError(res);
    }

    try {
        const channels = await prisma.channel.findMany({
            select: {
                id: true, name: true, type: true, status: true,
                responseTime: true, usedQuota: true, autoBan: true
            }
        });

        const statsRows = await db.allAsync(
            `SELECT channel_id, SUM(request_count) as requests, SUM(error_count) as errors,
                    SUM(use_time_sum_sec) as use_time_sum_sec
             FROM stats WHERE hour >= ? AND hour <= ?
             GROUP BY channel_id`,
            [timeRange.startTs, timeRange.endTs]
        );
        const statsMap = Object.fromEntries(statsRows.map(r => [r.channel_id, r]));

        const result = channels.map(ch => {
            const s = statsMap[ch.id] || {};
            const requests = s.requests || 0;
            const errors = s.errors || 0;
            const usedQuota = Number(ch.usedQuota) || 0;
            return {
                id: ch.id,
                name: ch.name,
                type: ch.type,
                status: ch.status,
                response_time: ch.responseTime || 0,
                auto_ban: ch.autoBan,
                used_quota: usedQuota,
                cost_usd: usedQuota / QUOTA_PER_UNIT,
                requests,
                errors,
                error_rate: requests > 0 ? Number((errors / requests).toFixed(4)) : 0,
                avg_latency_ms: requests > 0 ? Math.round(((s.use_time_sum_sec || 0) / requests) * 1000) : 0
            };
        });

        const statusCount = { enabled: 0, disabled: 0, autoDisabled: 0 };
        result.forEach(ch => {
            if (ch.status === 1) statusCount.enabled++;
            else if (ch.status === 2) statusCount.disabled++;
            else if (ch.status === 3) statusCount.autoDisabled++;
        });

        res.json({ channels: result, statusCount, total: result.length, timeRange });
    } catch (error) {
        console.error('[API] /channels/overview error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const channels = await prisma.channel.findMany({ select: { id: true, name: true } });
        res.json(channels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
