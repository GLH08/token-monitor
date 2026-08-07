const express = require('express');
const router = express.Router();
const db = require('../db');
const { prisma } = require('../syncer');
const { mapExtendedMetrics } = require('../tokenMetrics');
const { parseUsageFilters, parseTimeRange, parsePositiveInt, sendValidationError } = require('../request');

const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;
const MAX_TIMESERIES_RANGE_SECONDS = 31 * 24 * 3600;

const DIMENSION_COLUMNS = {
    group: 'user_group',
    channel: 'channel_id',
    model: 'model_name',
    token: 'token_id'
};
// 'user' is a derived dimension: usage_stats has no user_id column, so per-user
// breakdown aggregates by token_id then regroups by user in JS (token->user is
// many-to-one). No usage_stats schema change (keeps C2 additive).

const METRIC_COLUMNS = {
    cost: 'quota',
    quota: 'quota',
    tokens: 'tokens',
    requests: 'request_count',
    image_tokens: 'image_tokens',
    audio_tokens: 'audio_tokens',
    // Derived (ratio/average) metrics map to a proxy sum column for SQL ORDER BY;
    // exact ranking is applied in JS after computing the derived value.
    cache_hit_ratio: 'cache_hit_tokens',
    success_rate: 'success_count',
    avg_latency_ms: 'use_time_sum_sec',
    avg_ttft_ms: 'first_token_ms_sum',
    tps: 'use_time_sum_sec'
};

const DERIVED_METRICS = new Set(['cache_hit_ratio', 'success_rate', 'avg_latency_ms', 'avg_ttft_ms', 'tps']);

function buildMetricOrder(metric) {
    if (metric === 'tokens') {
        return 'SUM(CASE WHEN total_input_tokens > 0 THEN total_input_tokens ELSE prompt_tokens END + completion_tokens)';
    }
    return `SUM(${METRIC_COLUMNS[metric] || METRIC_COLUMNS.tokens})`;
}

// Shared SUM projection for usage_stats aggregate rows (base + C2 extended sums).
// Averages/rates are derived at query time from these sums (see mapExtendedMetrics).
const METRIC_SUM_SQL = `
    SUM(prompt_tokens) as prompt_tokens,
    SUM(completion_tokens) as completion_tokens,
    SUM(cache_hit_tokens) as cache_hit_tokens,
    SUM(tokens) as tokens,
    SUM(request_count) as requests,
    SUM(quota) as quota,
    SUM(error_count) as errors,
    SUM(cache_creation_tokens) as cache_creation_tokens,
    SUM(image_tokens) as image_tokens,
    SUM(audio_tokens) as audio_tokens,
    SUM(success_count) as success_count,
    SUM(first_token_ms_sum) as first_token_ms_sum,
    SUM(first_token_count) as first_token_count,
    SUM(use_time_sum_sec) as use_time_sum_sec,
    SUM(total_input_tokens) as total_input_tokens,
    SUM(CASE WHEN total_input_tokens > 0 THEN total_input_tokens ELSE prompt_tokens END + completion_tokens) as throughput_total
`;

// Columns summed when regrouping token_id rows into a user (per-user dimension).
const SUM_COLUMNS = [
    'prompt_tokens', 'completion_tokens', 'cache_hit_tokens', 'tokens',
    'requests', 'quota', 'errors',
    'cache_creation_tokens', 'image_tokens', 'audio_tokens', 'success_count',
    'first_token_ms_sum', 'first_token_count', 'use_time_sum_sec', 'total_input_tokens', 'throughput_total'
];

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

function buildHourlyBuckets(startTs, endTs) {
    const startHour = Math.floor(startTs / 3600) * 3600;
    const endHour = Math.floor(endTs / 3600) * 3600;
    const buckets = [];
    for (let hour = startHour; hour <= endHour; hour += 3600) {
        buckets.push(hour);
    }
    return buckets;
}

function mapTotals(row = {}) {
    const quota = row.quota || 0;
    const promptTokens = row.prompt_tokens || 0;
    const completionTokens = row.completion_tokens || 0;
    const totalInputTokens = Number(row.total_input_tokens) > 0
        ? Number(row.total_input_tokens)
        : promptTokens;
    const cacheHitTokens = row.cache_hit_tokens || 0;
    const cacheCreationTokens = row.cache_creation_tokens || 0;
    const netInputTokens = Math.max(0, totalInputTokens - cacheHitTokens - cacheCreationTokens);
    const throughputTotal = row.throughput_total !== undefined && row.throughput_total !== null
        ? Number(row.throughput_total) || 0
        : totalInputTokens + completionTokens;
    return {
        tokens: row.tokens || 0,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_input_tokens: totalInputTokens,
        net_input_tokens: netInputTokens,
        throughput_total: throughputTotal,
        throughput_tokens: throughputTotal,
        cache_hit_tokens: cacheHitTokens,
        requests: row.requests || 0,
        quota,
        cost: quota / QUOTA_PER_UNIT,
        cost_usd: quota / QUOTA_PER_UNIT,
        errors: row.errors || 0,
        ...mapExtendedMetrics(row)
    };
}

const COMPARISON_FIELDS = [
    'tokens',
    'prompt_tokens',
    'completion_tokens',
    'total_input_tokens',
    'net_input_tokens',
    'cache_hit_tokens',
    'cache_creation_tokens',
    'throughput_total',
    'requests',
    'errors',
    'image_tokens',
    'audio_tokens'
];

function mapPeriodComparison(currentRow = {}, previousRow = {}) {
    const current = mapTotals(currentRow);
    const previous = mapTotals(previousRow);
    const delta = {};
    const deltaPercent = {};

    COMPARISON_FIELDS.forEach((field) => {
        const currentValue = Number(current[field]) || 0;
        const previousValue = Number(previous[field]) || 0;
        delta[field] = currentValue - previousValue;
        deltaPercent[field] = previousValue === 0
            ? (currentValue === 0 ? 0 : null)
            : Number(((currentValue - previousValue) / previousValue * 100).toFixed(2));
    });

    return {
        previous,
        delta,
        delta_percent: deltaPercent
    };
}

function zeroTotals() {
    return {
        tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        cache_hit_tokens: 0,
        total_input_tokens: 0,
        net_input_tokens: 0,
        throughput_total: 0,
        throughput_tokens: 0,
        requests: 0,
        quota: 0,
        cost: 0,
        cost_usd: 0,
        errors: 0,
        cache_creation_tokens: 0,
        image_tokens: 0,
        audio_tokens: 0,
        cache_hit_ratio: 0,
        success_rate: 0,
        avg_latency_ms: 0,
        avg_ttft_ms: 0,
        tps: 0
    };
}

// Sum a set of aggregate rows (same column shape as METRIC_SUM_SQL output) into
// one merged row. Used to regroup token_id buckets into a per-user row.
function mergeAggRows(rows) {
    const merged = {};
    SUM_COLUMNS.forEach((col) => { merged[col] = 0; });
    rows.forEach((r) => {
        SUM_COLUMNS.forEach((col) => { merged[col] += r[col] || 0; });
    });
    return merged;
}

// Per-user breakdown: aggregate usage_stats by token_id, map token_id ->
// {user_id, username} via Prisma, then regroup by user in JS. No usage_stats
// schema change (user is derived from token_id, which is many-to-one).
async function getUsageBreakdownByUser(filters, where, params) {
    const tokenRows = await db.allAsync(
        `SELECT token_id as key, ${METRIC_SUM_SQL}
         FROM usage_stats ${where} AND token_id > 0
         GROUP BY token_id`,
        params
    );
    if (tokenRows.length === 0) return [];

    const tokenIds = tokenRows.map((r) => Number(r.key)).filter((id) => id > 0);
    const tokens = tokenIds.length ? await prisma.token.findMany({
        where: { id: { in: tokenIds } },
        select: { id: true, name: true, userId: true }
    }) : [];
    const tokenMap = Object.fromEntries(tokens.map((t) => [t.id, t]));

    const userIds = [...new Set(tokens.map((t) => t.userId).filter((id) => id > 0))];
    const users = userIds.length ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, displayName: true }
    }) : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const userBuckets = {};
    tokenRows.forEach((r) => {
        const tokenId = Number(r.key);
        const userId = tokenMap[tokenId]?.userId || 0;
        if (!userBuckets[userId]) userBuckets[userId] = [];
        userBuckets[userId].push(r);
    });

    const rows = Object.entries(userBuckets).map(([userId, groupRows]) => {
        const merged = mergeAggRows(groupRows);
        const user = userMap[Number(userId)];
        return {
            key: String(userId),
            label: user?.username || user?.displayName || `User ${userId}`,
            username: user?.username || '',
            user_id: Number(userId),
            ...mapTotals(merged)
        };
    });

    rows.sort((a, b) => (b[filters.metric] || 0) - (a[filters.metric] || 0));
    return rows.slice(0, filters.limit);
}

async function enrichBreakdownRows(dimension, rows) {
    if (dimension === 'user') {
        // Labels/usernames are already resolved in getUsageBreakdownByUser.
        return rows;
    }

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

function mapOptionRow(row) {
    const totals = mapTotals(row);
    return {
        value: String(row.value ?? ''),
        label: String(row.label ?? row.value ?? ''),
        ...totals
    };
}

async function getUsageFilterOptions(query) {
    const now = Math.floor(Date.now() / 1000);
    const timeRange = parseTimeRange(query, { startTs: now - 30 * 24 * 3600, endTs: now });
    const limit = parsePositiveInt(query.limit, { defaultValue: 200, min: 1, max: 500 });
    if (!timeRange || limit === null) {
        return null;
    }

    const params = [timeRange.startTs, timeRange.endTs, limit];
    const totalsSql = METRIC_SUM_SQL;

    const [groupRows, modelRows, tokenRows] = await Promise.all([
        db.allAsync(
            `SELECT user_group as value, user_group as label, ${totalsSql}
             FROM usage_stats
             WHERE hour >= ? AND hour <= ? AND user_group != ''
             GROUP BY user_group
             ORDER BY SUM(request_count) DESC
             LIMIT ?`,
            params
        ),
        db.allAsync(
            `SELECT model_name as value, model_name as label, ${totalsSql}
             FROM usage_stats
             WHERE hour >= ? AND hour <= ? AND model_name != ''
             GROUP BY model_name
             ORDER BY SUM(request_count) DESC
             LIMIT ?`,
            params
        ),
        db.allAsync(
            `SELECT token_id as value, token_id as label, ${totalsSql}
             FROM usage_stats
             WHERE hour >= ? AND hour <= ? AND token_id > 0
             GROUP BY token_id
             ORDER BY SUM(request_count) DESC
             LIMIT ?`,
            params
        )
    ]);

    const tokenIds = tokenRows.map((row) => Number(row.value)).filter((id) => id > 0);
    const tokens = tokenIds.length ? await prisma.token.findMany({
        where: { id: { in: tokenIds } },
        select: { id: true, name: true, status: true, group: true }
    }) : [];
    const tokenMap = Object.fromEntries(tokens.map((token) => [token.id, token]));

    return {
        groups: groupRows.map(mapOptionRow),
        models: modelRows.map(mapOptionRow),
        tokens: tokenRows.map((row) => {
            const id = Number(row.value);
            const token = tokenMap[id];
            return {
                ...mapOptionRow({ ...row, label: token?.name ? `${token.name} (#${id})` : `Token #${id}` }),
                id,
                name: token?.name || '',
                group: token?.group || '',
                status: token?.status
            };
        })
    };
}

router.get('/filter-options', async (req, res) => {
    try {
        const options = await getUsageFilterOptions(req.query);
        if (!options) {
            return sendValidationError(res);
        }
        res.json(options);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/summary', async (req, res) => {
    const filters = parseUsageFilters(req.query);
    if (!filters) {
        return sendValidationError(res);
    }

    const { where, params } = buildUsageWhere(filters);
    const durationSeconds = Math.max(1, filters.endTs - filters.startTs);
    const previousFilters = {
        ...filters,
        startTs: filters.startTs - durationSeconds - 1,
        endTs: filters.startTs - 1
    };
    const previousQuery = buildUsageWhere(previousFilters);

    try {
        const summarySql = `SELECT
                ${METRIC_SUM_SQL},
                COUNT(DISTINCT user_group) as active_groups,
                COUNT(DISTINCT channel_id) as active_channels,
                COUNT(DISTINCT model_name) as active_models,
                COUNT(DISTINCT token_id) as active_tokens
             FROM usage_stats`;
        const [row, previousRow] = await Promise.all([
            db.getAsync(
                `${summarySql} ${where}`,
                params
            ),
            db.getAsync(
                `${summarySql} ${previousQuery.where}`,
                previousQuery.params
            )
        ]);

        res.json({
            ...mapTotals(row),
            active_groups: row?.active_groups || 0,
            active_channels: row?.active_channels || 0,
            active_models: row?.active_models || 0,
            active_tokens: row?.active_tokens || 0,
            comparison: mapPeriodComparison(row, previousRow)
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

    const { where, params } = buildUsageWhere(filters);

    try {
        let rows;
        if (filters.dimension === 'user') {
            rows = await getUsageBreakdownByUser(filters, where, params);
        } else {
            const dimensionColumn = DIMENSION_COLUMNS[filters.dimension];
            const metricColumn = METRIC_COLUMNS[filters.metric];
            // For derived (ratio/average) metrics the SQL proxy order is not
            // exact, so fetch all rows and rank in JS after computing the value.
            const isDerived = DERIVED_METRICS.has(filters.metric);
            const orderExpression = isDerived ? `SUM(${metricColumn})` : buildMetricOrder(filters.metric);
            const orderClause = isDerived
                ? `ORDER BY ${orderExpression} DESC`
                : `ORDER BY ${orderExpression} DESC LIMIT ?`;
            const queryParams = isDerived ? params : [...params, filters.limit];

            const rawRows = await db.allAsync(
                `SELECT
                    ${dimensionColumn} as key,
                    ${METRIC_SUM_SQL}
                 FROM usage_stats ${where}
                 GROUP BY ${dimensionColumn}
                 ${orderClause}`,
                queryParams
            );

            rows = mapBreakdownRows(rawRows);
            if (isDerived) {
                rows.sort((a, b) => (b[filters.metric] || 0) - (a[filters.metric] || 0));
                rows = rows.slice(0, filters.limit);
            }
            rows = await enrichBreakdownRows(filters.dimension, rows);
        }

        res.json(rows);
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
                ${METRIC_SUM_SQL}
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
module.exports.getUsageBreakdownByUser = getUsageBreakdownByUser;
module.exports.mapTotals = mapTotals;
module.exports.mapPeriodComparison = mapPeriodComparison;
module.exports.buildMetricOrder = buildMetricOrder;
