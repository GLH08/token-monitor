function toInteger(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function parsePositiveInt(value, { defaultValue = null, min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    const parsed = toInteger(value);
    if (parsed === null) {
        return defaultValue;
    }
    if (parsed < min || parsed > max) {
        return null;
    }
    return parsed;
}

function parseOptionalId(value) {
    return parsePositiveInt(value, { defaultValue: null });
}

function parseWindow(value, allowedValues, defaultValue) {
    if (!value) {
        return defaultValue;
    }
    return allowedValues.includes(value) ? value : null;
}

function parsePagination(query, defaults = {}) {
    const page = parsePositiveInt(query.page, { defaultValue: defaults.page || 1, min: 1, max: 100000 });
    const pageSize = parsePositiveInt(query.pageSize, { defaultValue: defaults.pageSize || 20, min: 1, max: defaults.maxPageSize || 200 });

    if (page === null || pageSize === null) {
        return null;
    }

    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function parseTimeRange(query, defaults = {}) {
    const startTs = parsePositiveInt(query.start_ts, { defaultValue: defaults.startTs ?? null, min: 0 });
    const endTs = parsePositiveInt(query.end_ts, { defaultValue: defaults.endTs ?? null, min: 0 });

    if ((query.start_ts && startTs === null) || (query.end_ts && endTs === null)) {
        return null;
    }

    if (startTs !== null && endTs !== null && startTs > endTs) {
        return null;
    }

    return { startTs, endTs };
}

function parseHours(value, defaultValue = 24, max = 168) {
    return parsePositiveInt(value, { defaultValue, min: 1, max });
}

function parseModelList(value) {
    if (!value) {
        return [];
    }
    return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 50);
}

function parseBoolean(value, defaultValue = false) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    if (value === 'true' || value === '1' || value === 1) {
        return true;
    }
    if (value === 'false' || value === '0' || value === 0) {
        return false;
    }
    return null;
}

function parseAlertBody(body) {
    if (!body || typeof body !== 'object') {
        return null;
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const triggerAction = typeof body.trigger_action === 'string' && body.trigger_action.trim()
        ? body.trigger_action.trim()
        : 'notify';
    const notifyTelegram = parseBoolean(body.notify_telegram, false);
    const enabled = parseBoolean(body.enabled, true);
    const startTime = body.start_time ?? null;
    const endTime = body.end_time ?? null;
    const rule = body.rule;

    if (!name || name.length > 100 || !rule || typeof rule !== 'object' || Array.isArray(rule)) {
        return null;
    }

    if (notifyTelegram === null || enabled === null) {
        return null;
    }

    if (startTime !== null && typeof startTime !== 'string') {
        return null;
    }

    if (endTime !== null && typeof endTime !== 'string') {
        return null;
    }

    return {
        name,
        rule,
        enabled,
        start_time: startTime,
        end_time: endTime,
        notify_telegram: notifyTelegram,
        trigger_action: triggerAction
    };
}

function requirePasswordLogin(body) {
    if (!body || typeof body !== 'object') {
        return null;
    }

    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || password.length > 256) {
        return null;
    }

    return { password };
}

function parseUsageDimension(value, defaultValue = 'model') {
    return parseWindow(value, ['group', 'channel', 'model', 'token', 'user'], defaultValue);
}

function parseUsageMetric(value, defaultValue = 'tokens') {
    return parseWindow(value, ['cost', 'tokens', 'requests', 'quota', 'cache_hit_ratio', 'image_tokens', 'audio_tokens', 'success_rate', 'avg_latency_ms', 'avg_ttft_ms', 'tps'], defaultValue);
}

function parseUsageSplit(value, defaultValue = 'none') {
    return parseWindow(value, ['none', 'group', 'channel', 'model', 'token'], defaultValue);
}

function parseUsageFilters(query) {
    const now = Math.floor(Date.now() / 1000);
    const timeRange = parseTimeRange(query, { startTs: now - 24 * 3600, endTs: now });
    const channelId = parseOptionalId(query.channel_id);
    const tokenId = parseOptionalId(query.token_id);
    const limit = parsePositiveInt(query.limit, { defaultValue: 20, min: 1, max: 100 });
    const dimension = parseUsageDimension(query.dimension);
    const metric = parseUsageMetric(query.metric);
    const split = parseUsageSplit(query.split);

    if (
        !timeRange
        || (query.channel_id && channelId === null)
        || (query.token_id && tokenId === null)
        || limit === null
        || dimension === null
        || metric === null
        || split === null
    ) {
        return null;
    }

    const userGroup = typeof query.group === 'string' ? query.group.trim() : '';
    const modelName = typeof query.model_name === 'string' ? query.model_name.trim() : '';

    return {
        startTs: timeRange.startTs,
        endTs: timeRange.endTs,
        userGroup,
        channelId,
        tokenId,
        modelName,
        limit,
        dimension,
        metric,
        split
    };
}

function sendValidationError(res, message = 'Invalid request') {
    return res.status(400).json({ error: message });
}

module.exports = {
    parseAlertBody,
    parseBoolean,
    parseHours,
    parseModelList,
    parseOptionalId,
    parsePagination,
    parsePositiveInt,
    parseTimeRange,
    parseUsageFilters,
    parseWindow,
    requirePasswordLogin,
    sendValidationError
};
