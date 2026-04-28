const express = require('express');
const router = express.Router();
const db = require('../db');
const { prisma } = require('../syncer');
const { parseUsageFilters, sendValidationError } = require('../request');

const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;
const MAX_TIMESERIES_RANGE_SECONDS = 31 * 24 * 3600;

const DIMENSION_COLUMNS = {
    group: 'user_group',
    channel: 'channel_id',
    model: 'model_name',
    token: 'token_id'
};

const METRIC_COLUMNS = {
    cost: 'quota',
    quota: 'quota',
    tokens: 'tokens',
    requests: 'request_count'
};

function buildUsageWhere(filters) {
    let where = 'WHERE hour >= ? AND hour <= ?';
    const params = [filters.startTs, filters.endTs];

    if (filters.userGroup) {
        where += ' AND user_group = ?';
        params.push(filters.userGroup);
    }
    if (filters.channelId !== null) {
        where += ' AND channel_id = ?';
        params.push(filters.channelId);
    }
    if (filters.modelName) {
        where += ' AND model_name = ?';
        params.push(filters.modelName);
    }
    if (filters.tokenId !== null) {
        where += ' AND token_id = ?';
        params.push(filters.tokenId);
    }

    return { where, params };
}

function mapTotals(row = {}) {
    const quota = row.quota || 0;
    return {
        tokens: row.tokens || 0,
        prompt_tokens: row.prompt_tokens || 0,
        completion_tokens: row.completion_tokens || 0,
        requests: row.requests || 0,
        quota,
        cost: quota / QUOTA_PER_UNIT,
        errors: row.errors || 0
    };
}

function zeroTotals() {
    return {
        tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        requests: 0,
        quota: 0,
        cost: 0,
        errors: 0
    };
}

async function enrichBreakdownRows(dimension, rows) {
    if (dimension === 'channel') {
        const ids = rows.map((row) => Number(row.key)).filter((id) => id > 0);
        const channels = ids.length ? await prisma.channel.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, type: true }
        }) : [];
        const channelMap = Object.fromEntries(channels.map((channel) => [channel.id, channel]));
        return rows.map((row) => {
            const id = Number(row.key);
            const channel = channelMap[id];
            return {
                ...row,
                label: channel?.name || `Channel ${row.key}`,
                channelType: channel?.type
            };
        });
    }

    if (dimension === 'token') {
        const ids = rows.map((row) => Number(row.key)).filter((id) => id > 0);
        const tokens = ids.length ? await prisma.token.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, status: true, group: true }
        }) : [];
        const tokenMap = Object.fromEntries(tokens.map((token) => [token.id, token]));
        return rows.map((row) => {
            const id = Number(row.key);
            const token = tokenMap[id];
            return {
                ...row,
                label: token?.name || `Token ${row.key}`,
                status: token?.status,
                group: token?.group
            };
        });
    }

    return rows.map((row) => ({
        ...row,
        label: row.key || (dimension === 'group' ? '默认分组' : '未命名')
    }));
}

function mapBreakdownRows(rows) {
    return rows.map((row) => {
        const totals = mapTotals(row);
        return {
            key: String(row.key ?? ''),
            label: String(row.key ?? ''),
            ...totals
        };
    });
}

function buildHourlyBuckets(startTs, endTs) {
    const startHour = Math.floor(startTs / 3600) * 3600;
    const endHour = Math.floor(endTs / 3600) * 3600;
    const buckets = [];
    for (let hour = startHour; hour <= endHour; hour += 3600) {
        buckets.push(hour);
    }
    return buckets;
}

router.get('/summary', async (req, res) => {
    const filters = parseUsageFilters(req.query);
    if (!filters) {
        return sendValidationError(res);
    }

    const { where, params } = buildUsageWhere(filters);

    try {
        const row = await db.getAsync(
            `SELECT
                SUM(prompt_tokens) as prompt_tokens,
                SUM(completion_tokens) as completion_tokens,
                SUM(tokens) as tokens,
                SUM(request_count) as requests,
                SUM(quota) as quota,
                SUM(error_count) as errors,
                COUNT(DISTINCT user_group) as active_groups,
                COUNT(DISTINCT channel_id) as active_channels,
                COUNT(DISTINCT model_name) as active_models,
                COUNT(DISTINCT token_id) as active_tokens
             FROM usage_stats ${where}`,
            params
        );

        res.json({
            ...mapTotals(row),
            active_groups: row?.active_groups || 0,
            active_channels: row?.active_channels || 0,
            active_models: row?.active_models || 0,
            active_tokens: row?.active_tokens || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/breakdown', async (req, res) => {
    const filters = parseUsageFilters(req.query);
    if (!filters) {
        return sendValidationError(res);
    }

    const dimensionColumn = DIMENSION_COLUMNS[filters.dimension];
    const metricColumn = METRIC_COLUMNS[filters.metric];
    const { where, params } = buildUsageWhere(filters);

    try {
        const rows = await db.allAsync(
            `SELECT
                ${dimensionColumn} as key,
                SUM(prompt_tokens) as prompt_tokens,
                SUM(completion_tokens) as completion_tokens,
                SUM(tokens) as tokens,
                SUM(request_count) as requests,
                SUM(quota) as quota,
                SUM(error_count) as errors
             FROM usage_stats ${where}
             GROUP BY ${dimensionColumn}
             ORDER BY SUM(${metricColumn}) DESC
             LIMIT ?`,
            [...params, filters.limit]
        );

        const mappedRows = mapBreakdownRows(rows);
        res.json(await enrichBreakdownRows(filters.dimension, mappedRows));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/timeseries', async (req, res) => {
    const filters = parseUsageFilters(req.query);
    if (!filters) {
        return sendValidationError(res);
    }

    if (filters.endTs - filters.startTs > MAX_TIMESERIES_RANGE_SECONDS) {
        return sendValidationError(res, 'Time range is too large');
    }

    const splitColumn = filters.split === 'none' ? null : DIMENSION_COLUMNS[filters.split];
    const { where, params } = buildUsageWhere(filters);

    try {
        const splitKeys = splitColumn ? (await db.allAsync(
            `SELECT ${splitColumn} as split_key
             FROM usage_stats ${where}
             GROUP BY ${splitColumn}
             ORDER BY SUM(${METRIC_COLUMNS[filters.metric]}) DESC
             LIMIT ?`,
            [...params, filters.limit]
        )).map((row) => String(row.split_key ?? '')) : [''];

        if (splitColumn && splitKeys.length === 0) {
            return res.json({ split: filters.split, series: [] });
        }

        const rows = await db.allAsync(
            `SELECT
                hour,
                ${splitColumn ? `${splitColumn} as split_key,` : "'' as split_key,"}
                SUM(prompt_tokens) as prompt_tokens,
                SUM(completion_tokens) as completion_tokens,
                SUM(tokens) as tokens,
                SUM(request_count) as requests,
                SUM(quota) as quota,
                SUM(error_count) as errors
             FROM usage_stats ${where}${splitColumn ? ` AND ${splitColumn} IN (${splitKeys.map(() => '?').join(',')})` : ''}
             GROUP BY hour${splitColumn ? `, ${splitColumn}` : ''}
             ORDER BY hour ASC`,
            splitColumn ? [...params, ...splitKeys] : params
        );

        const rowMap = new Map(rows.map((row) => [`${row.hour}:${row.split_key ?? ''}`, mapTotals(row)]));
        const hours = buildHourlyBuckets(filters.startTs, filters.endTs);
        const series = hours.flatMap((hour) => splitKeys.map((splitKey) => ({
            hour,
            split: splitKey,
            ...(rowMap.get(`${hour}:${splitKey}`) || zeroTotals())
        })));

        res.json({ split: filters.split, series });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
