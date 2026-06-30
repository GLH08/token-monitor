function getNestedNumber(source, path) {
    const value = path.reduce((current, key) => current && current[key], source);
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function parseCacheHitTokens(other) {
    if (!other) {
        return 0;
    }

    try {
        const parsed = typeof other === 'string' ? JSON.parse(other) : other;
        if (!parsed || typeof parsed !== 'object') {
            return 0;
        }

        const candidates = [
            ['cache_tokens'],
            ['cacheTokens'],
            ['cached_tokens'],
            ['cache_hit_tokens'],
            ['cacheHitTokens'],
            ['cache_read_input_tokens'],
            ['cache_read_input_tokens_total'],
            ['cacheReadInputTokens'],
            ['prompt_tokens_details', 'cached_tokens'],
            ['prompt_tokens_details', 'cache_read_input_tokens'],
            ['usage', 'cache_tokens'],
            ['usage', 'cached_tokens'],
            ['usage', 'cache_hit_tokens'],
            ['usage', 'cache_read_input_tokens'],
            ['usage', 'input_tokens_details', 'cached_tokens'],
            ['usage', 'input_tokens_details', 'cache_read_input_tokens'],
            ['usage', 'prompt_tokens_details', 'cached_tokens'],
            ['usage', 'prompt_tokens_details', 'cache_read_input_tokens'],
            ['input_token_details', 'cache_read'],
            ['input_tokens_details', 'cache_read'],
            ['input_tokens_details', 'cached_tokens']
        ];

        return candidates.reduce((max, path) => Math.max(max, getNestedNumber(parsed, path)), 0);
    } catch (error) {
        return 0;
    }
}

function metricsFromLog(log) {
    const promptTokens = log.promptTokens || 0;
    const completionTokens = log.completionTokens || 0;
    const cacheHitTokens = parseCacheHitTokens(log.other);
    const tokens = promptTokens + completionTokens;
    const netInputTokens = Math.max(0, promptTokens - cacheHitTokens);
    const throughputTotal = netInputTokens + completionTokens + cacheHitTokens;

    return {
        promptTokens,
        completionTokens,
        cacheHitTokens,
        tokens,
        netInputTokens,
        throughputTotal
    };
}

function mapStatsTotals(row = {}) {
    const promptTokens = row.prompt_tokens || 0;
    const completionTokens = row.completion_tokens || 0;
    const cacheHitTokens = row.cache_hit_tokens || 0;
    const tokens = row.tokens ?? (promptTokens + completionTokens);
    const netInputTokens = Math.max(0, promptTokens - cacheHitTokens);
    const throughputTotal = netInputTokens + completionTokens + cacheHitTokens;

    return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cache_hit_tokens: cacheHitTokens,
        tokens,
        net_input_tokens: netInputTokens,
        throughput_total: throughputTotal
    };
}

const STATS_TOKEN_SUM_SQL = `
    SUM(prompt_tokens) as prompt_tokens,
    SUM(completion_tokens) as completion_tokens,
    SUM(cache_hit_tokens) as cache_hit_tokens,
    SUM(tokens) as tokens
`;

module.exports = {
    parseCacheHitTokens,
    metricsFromLog,
    mapStatsTotals,
    STATS_TOKEN_SUM_SQL
};