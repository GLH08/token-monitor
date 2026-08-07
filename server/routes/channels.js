const express = require('express');
const router = express.Router();
const db = require('../db');
const { prisma } = require('../syncer');
const { parseTimeRange, sendValidationError } = require('../request');
const { parseChannelInfo } = require('../channelInfo');

const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;

// Mask an API key for display: show first 4 and last 4 chars.
function maskKey(key) {
    if (!key || typeof key !== 'string') return '****';
    const trimmed = key.trim();
    if (trimmed.length <= 8) return '****';
    return trimmed.slice(0, 4) + '...' + trimmed.slice(-4);
}

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
                responseTime: true, usedQuota: true, autoBan: true,
                channelInfo: true
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
            const info = parseChannelInfo(ch.channelInfo);
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
                avg_latency_ms: requests > 0 ? Math.round(((s.use_time_sum_sec || 0) / requests) * 1000) : 0,
                is_multi_key: !!(info && info.is_multi_key),
                multi_key_size: info ? (info.multi_key_size || 0) : 0,
                multi_key_mode: info && info.multi_key_mode ? info.multi_key_mode : null
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

// Multi-key per-key detail for a single channel.
// Returns the channel's multi-key config (mode, size, polling index) and a
// per-key breakdown of status + usage stats aggregated from key_stats.
router.get('/:id/keys', async (req, res) => {
    const channelId = parseInt(req.params.id, 10);
    if (!Number.isFinite(channelId) || channelId <= 0) {
        return sendValidationError(res, 'Invalid channel id');
    }

    const now = Math.floor(Date.now() / 1000);
    const timeRange = parseTimeRange(req.query, { startTs: now - 24 * 3600, endTs: now });
    if (!timeRange) {
        return sendValidationError(res);
    }

    try {
        const channel = await prisma.channel.findUnique({
            where: { id: channelId },
            select: { id: true, name: true, key: true, channelInfo: true }
        });

        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        const info = parseChannelInfo(channel.channelInfo);
        if (!info || !info.is_multi_key) {
            return res.json({
                channel_id: channelId,
                channel_name: channel.name,
                is_multi_key: false,
                keys: []
            });
        }

        // Split the key field by newline to get individual keys (new-api convention)
        const rawKeys = (channel.key || '').split('\n').map(k => k.trim()).filter(Boolean);
        const multiKeySize = info.multi_key_size || rawKeys.length;

        // Build per-key status maps from channel_info
        const statusList = info.multi_key_status_list || {};
        const disabledReason = info.multi_key_disabled_reason || {};
        const disabledTime = info.multi_key_disabled_time || {};

        // Query key_stats for this channel in the time range
        const statsRows = await db.allAsync(
            `SELECT key_index,
                    SUM(request_count) as requests,
                    SUM(error_count) as errors,
                    SUM(prompt_tokens) as prompt_tokens,
                    SUM(completion_tokens) as completion_tokens,
                    SUM(tokens) as tokens,
                    SUM(quota) as quota,
                    SUM(use_time_sum_sec) as use_time_sum_sec,
                    SUM(success_count) as success_count,
                    SUM(total_input_tokens) as total_input_tokens,
                    SUM(cache_hit_tokens) as cache_hit_tokens
             FROM key_stats
             WHERE channel_id = ? AND hour >= ? AND hour <= ?
             GROUP BY key_index`,
            [channelId, timeRange.startTs, timeRange.endTs]
        );
        const statsMap = Object.fromEntries(statsRows.map(r => [r.key_index, r]));

        // Build the keys array, covering ALL keys (even those with no stats)
        const keys = [];
        for (let idx = 0; idx < multiKeySize; idx++) {
            const s = statsMap[idx] || {};
            const requests = s.requests || 0;
            const errors = s.errors || 0;
            const quota = s.quota || 0;
            const useTimeSumSec = s.use_time_sum_sec || 0;
            keys.push({
                key_index: idx,
                key_label: maskKey(rawKeys[idx] || ''),
                status: statusList[idx] !== undefined ? statusList[idx] : 1, // 1=enabled by default
                disabled_reason: disabledReason[idx] || null,
                disabled_time: disabledTime[idx] || null,
                requests,
                errors,
                error_rate: requests > 0 ? Number((errors / requests).toFixed(4)) : 0,
                prompt_tokens: s.prompt_tokens || 0,
                completion_tokens: s.completion_tokens || 0,
                tokens: s.tokens || 0,
                quota,
                cost_usd: quota / QUOTA_PER_UNIT,
                avg_latency_ms: requests > 0 ? Math.round((useTimeSumSec / requests) * 1000) : 0,
                success_count: s.success_count || 0,
                total_input_tokens: s.total_input_tokens || 0,
                cache_hit_tokens: s.cache_hit_tokens || 0
            });
        }

        res.json({
            channel_id: channelId,
            channel_name: channel.name,
            is_multi_key: true,
            multi_key_mode: info.multi_key_mode || 'polling',
            multi_key_size: multiKeySize,
            multi_key_polling_index: info.multi_key_polling_index || 0,
            time_range: { start_ts: timeRange.startTs, end_ts: timeRange.endTs },
            keys
        });
    } catch (error) {
        console.error('[API] /channels/:id/keys error:', error.message);
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
