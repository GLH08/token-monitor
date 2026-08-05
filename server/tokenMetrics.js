const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;

function getNestedNumber(source, path) {
    const value = path.reduce((current, key) => current && current[key], source);
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function parseOther(other) {
    if (!other) {
        return null;
    }

    try {
        const parsed = typeof other === 'string' ? JSON.parse(other) : other;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        return parsed;
    } catch (error) {
        return null;
    }
}

function parseCacheHitTokens(other) {
    const parsed = typeof other === 'string' ? parseOther(other) : other;
    if (!parsed) {
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
}

// cache_creation_tokens represents Anthropic cache-write (creation) tokens.
// The 5m/1h variants are a SPLIT of the total, not additional - summing them
// onto the base would double-count. new-api also writes a normalized
// `cache_write_tokens` total; prefer that when present, otherwise apply the
// same max(base, 5m+1h) rule new-api uses (service/text_quota.go:60-69).
function parseCacheCreationTokens(parsed) {
    if (!parsed) {
        return 0;
    }

    // New-api normally normalizes these into top-level cache_write_tokens.
    // Older logs and pass-through responses can retain the provider-native
    // nested locations, so inspect all equivalent paths and take the largest
    // value rather than summing duplicated representations.
    const normalized = [
        ['cache_write_tokens'],
        ['cacheWriteTokens'],
        ['usage', 'cache_write_tokens'],
        ['usage', 'cacheWriteTokens'],
        ['prompt_tokens_details', 'cache_write_tokens'],
        ['input_tokens_details', 'cache_write_tokens'],
        ['usage', 'prompt_tokens_details', 'cache_write_tokens'],
        ['usage', 'input_tokens_details', 'cache_write_tokens']
    ].reduce((max, path) => Math.max(max, getNestedNumber(parsed, path)), 0);
    if (normalized > 0) {
        return normalized;
    }

    const base = [
        ['cache_creation_tokens'],
        ['cacheCreationTokens'],
        ['cache_creation_input_tokens'],
        ['cached_creation_tokens'],
        ['usage', 'cache_creation_tokens'],
        ['usage', 'cacheCreationTokens'],
        ['usage', 'cache_creation_input_tokens'],
        ['usage', 'cached_creation_tokens']
    ].reduce((max, path) => Math.max(max, getNestedNumber(parsed, path)), 0);
    const t5m = [
        ['cache_creation_tokens_5m'],
        ['cache_creation_input_tokens_5m'],
        ['usage', 'cache_creation_tokens_5m'],
        ['usage', 'cache_creation_input_tokens_5m'],
        ['cache_creation', 'ephemeral_5m_input_tokens'],
        ['usage', 'cache_creation', 'ephemeral_5m_input_tokens']
    ].reduce((max, path) => Math.max(max, getNestedNumber(parsed, path)), 0);
    const t1h = [
        ['cache_creation_tokens_1h'],
        ['cache_creation_input_tokens_1h'],
        ['usage', 'cache_creation_tokens_1h'],
        ['usage', 'cache_creation_input_tokens_1h'],
        ['cache_creation', 'ephemeral_1h_input_tokens'],
        ['usage', 'cache_creation', 'ephemeral_1h_input_tokens']
    ].reduce((max, path) => Math.max(max, getNestedNumber(parsed, path)), 0);

    if (t5m > 0 || t1h > 0) {
        return Math.max(base, t5m + t1h);
    }
    return base;
}

function parseImageTokens(parsed) {
    if (!parsed) {
        return 0;
    }
    return getNestedNumber(parsed, ['image_output'])
        || getNestedNumber(parsed, ['usage', 'image_output']);
}

// Audio tokens come from two shapes: the dedicated audio/wss paths write
// `audio_input`/`audio_output`, while the text path with separate audio
// pricing writes `audio_input_token_count` (input only, no output).
function parseAudioTokens(parsed) {
    if (!parsed) {
        return { input: 0, output: 0 };
    }
    const input = getNestedNumber(parsed, ['audio_input'])
        || getNestedNumber(parsed, ['usage', 'audio_input'])
        || getNestedNumber(parsed, ['audio_input_token_count']);
    const output = getNestedNumber(parsed, ['audio_output'])
        || getNestedNumber(parsed, ['usage', 'audio_output']);
    return { input, output };
}

// Re-derive the tool-call surcharge quota from the price+count written to
// `other`. Prices are per-1000-calls for web/file search and per-call for
// image generation (service/text_quota.go:423-445, tool_billing.go). The
// surcharge is already included in logs.quota; this is a breakdown metric.
function parseToolCalls(parsed) {
    if (!parsed) {
        return { toolCalls: 0, toolQuota: 0 };
    }

    let toolCalls = 0;
    let toolQuota = 0;
    const groupRatio = getNestedNumber(parsed, ['group_ratio'])
        || getNestedNumber(parsed, ['usage', 'group_ratio'])
        || 1;

    const webSearchCount = getNestedNumber(parsed, ['web_search_call_count']);
    if (webSearchCount > 0) {
        const pricePer1k = getNestedNumber(parsed, ['web_search_price']);
        toolCalls += webSearchCount;
        toolQuota += Math.round(pricePer1k * webSearchCount / 1000 * groupRatio * QUOTA_PER_UNIT);
    }

    const fileSearchCount = getNestedNumber(parsed, ['file_search_call_count']);
    if (fileSearchCount > 0) {
        const pricePer1k = getNestedNumber(parsed, ['file_search_price']);
        toolCalls += fileSearchCount;
        toolQuota += Math.round(pricePer1k * fileSearchCount / 1000 * groupRatio * QUOTA_PER_UNIT);
    }

    if (parsed.image_generation_call === true) {
        const pricePerCall = getNestedNumber(parsed, ['image_generation_call_price']);
        toolCalls += 1;
        toolQuota += Math.round(pricePerCall * groupRatio * QUOTA_PER_UNIT);
    }

    return { toolCalls, toolQuota };
}

function parseReasoning(parsed) {
    if (!parsed) {
        return false;
    }
    const effort = parsed.reasoning_effort;
    return typeof effort === 'string' && effort.length > 0;
}

// First-response time (TTFT) in ms. new-api writes other.frt as a float64 of
// milliseconds (FirstResponseTime - StartTime). 0 means non-streaming / unset.
function parseFrtMs(parsed) {
    if (!parsed) {
        return 0;
    }
    const frt = getNestedNumber(parsed, ['frt'])
        || getNestedNumber(parsed, ['usage', 'frt']);
    return Math.round(frt);
}

// Multi-key tracking: new-api writes other.admin_info.is_multi_key and
// other.admin_info.multi_key_index for channels in multi-key (random/polling)
// mode. See new-api/service/log_info_generate.go:97-100 and
// controller/relay.go:387-390. Returns -1 when the log is not from a
// multi-key channel.
function parseIsMultiKey(parsed) {
    if (!parsed || !parsed.admin_info) {
        return false;
    }
    return parsed.admin_info.is_multi_key === true;
}

function parseMultiKeyIndex(parsed) {
    const obj = typeof parsed === 'string' ? parseOther(parsed) : parsed;
    if (!parseIsMultiKey(obj)) {
        return -1;
    }
    const idx = obj.admin_info.multi_key_index;
    return Number.isFinite(Number(idx)) ? Number(idx) : -1;
}

function parseBillingSource(parsed) {
    if (!parsed) {
        return null;
    }
    const raw = parsed.billing_source !== undefined
        ? parsed.billing_source
        : (parsed.usage && parsed.usage.billing_source);
    return typeof raw === 'string' && raw ? raw : null;
}

function parseRatios(parsed) {
    if (!parsed) {
        return { model: 0, completion: 0, group: 0, cache: 0, userGroup: 0, modelPrice: 0 };
    }
    return {
        model: getNestedNumber(parsed, ['model_ratio']) || getNestedNumber(parsed, ['usage', 'model_ratio']),
        completion: getNestedNumber(parsed, ['completion_ratio']) || getNestedNumber(parsed, ['usage', 'completion_ratio']),
        group: getNestedNumber(parsed, ['group_ratio']) || getNestedNumber(parsed, ['usage', 'group_ratio']),
        cache: getNestedNumber(parsed, ['cache_ratio']) || getNestedNumber(parsed, ['usage', 'cache_ratio']),
        userGroup: getNestedNumber(parsed, ['user_group_ratio']) || getNestedNumber(parsed, ['usage', 'user_group_ratio']),
        modelPrice: getNestedNumber(parsed, ['model_price']) || getNestedNumber(parsed, ['usage', 'model_price'])
    };
}

function metricsFromLog(log) {
    const promptTokens = log.promptTokens || 0;
    const completionTokens = log.completionTokens || 0;
    const parsed = parseOther(log.other);
    const cacheHitTokens = parseCacheHitTokens(parsed);
    const tokens = promptTokens + completionTokens;

    const cacheCreationTokens = parseCacheCreationTokens(parsed);
    const imageTokens = parseImageTokens(parsed);
    const audio = parseAudioTokens(parsed);
    const { toolCalls, toolQuota } = parseToolCalls(parsed);
    const reasoning = parseReasoning(parsed);
    const frtMs = parseFrtMs(parsed);
    const billingSource = parseBillingSource(parsed);
    const ratios = parseRatios(parsed);
    const isMultiKey = parseIsMultiKey(parsed);
    const multiKeyIndex = parseMultiKeyIndex(parsed);

    // Total input tokens (incl. cache). new-api's prompt_tokens EXCLUDES cache for
    // Anthropic/Claude semantics but INCLUDES it for OpenAI (relay-claude.go:731,910;
    // text_quota.go:204,256-258). Prefer the normalized other.input_tokens_total when
    // present; else reconstruct per semantic so cache-hit ratio stays <= 100%.
    const inputTokensTotalRaw = parsed
        ? (getNestedNumber(parsed, ['input_tokens_total']) || getNestedNumber(parsed, ['usage', 'input_tokens_total']))
        : 0;
    const isClaudeSemantic = !!(parsed && (parsed.usage_semantic === 'anthropic' || parsed.claude === true));
    const totalInputTokens = inputTokensTotalRaw > 0
        ? inputTokensTotalRaw
        : (isClaudeSemantic ? promptTokens + cacheHitTokens + cacheCreationTokens : promptTokens);

    // net input = non-cached input; throughput = total input + completion.
    const netInputTokens = Math.max(0, totalInputTokens - cacheHitTokens - cacheCreationTokens);
    const throughputTotal = totalInputTokens + completionTokens;

    return {
        promptTokens,
        completionTokens,
        cacheHitTokens,
        tokens,
        netInputTokens,
        throughputTotal,
        cacheCreationTokens,
        imageTokens,
        audioInputTokens: audio.input,
        audioOutputTokens: audio.output,
        toolCalls,
        toolQuota,
        reasoning,
        frtMs,
        useTimeSec: log.useTime || 0,
        billingSource,
        ratios,
        totalInputTokens,
        isMultiKey,
        multiKeyIndex
    };
}

function mapStatsTotals(row = {}) {
    const promptTokens = row.prompt_tokens || 0;
    const completionTokens = row.completion_tokens || 0;
    const cacheHitTokens = row.cache_hit_tokens || 0;
    const cacheCreationTokens = row.cache_creation_tokens || 0;
    const tokens = row.tokens ?? (promptTokens + completionTokens);
    // total_input_tokens is backfilled separately; fall back to prompt_tokens for
    // rows that haven't been backfilled yet (OpenAI semantics, where prompt
    // already includes cache, so the fallback is still correct for OpenAI).
    const totalInputTokens = Number(row.total_input_tokens) > 0
        ? Number(row.total_input_tokens)
        : promptTokens;
    const netInputTokens = Math.max(0, totalInputTokens - cacheHitTokens - cacheCreationTokens);
    const throughputTotal = totalInputTokens + completionTokens;

    return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cache_hit_tokens: cacheHitTokens,
        tokens,
        total_input_tokens: totalInputTokens,
        net_input_tokens: netInputTokens,
        throughput_total: throughputTotal
    };
}

// Derived averages/rates from the C2 sum columns (see db.js). Averages are
// derived at query time so they stay correct for any selected range; the sums
// are accumulated per hourly bucket by the syncer.
// - avg_latency_ms: whole-request latency from use_time (sec) -> ms.
// - avg_ttft_ms: streaming first-token time from other.frt (only when frt>0).
// - success_rate: 1 - error/req (== success_count/req once backfilled); 0 when
//   no requests, consistent with the other derived metrics (0 = no data).
// - cache_hit_ratio / tps: 0 when the denominator is 0.
function mapExtendedMetrics(row = {}) {
    const cacheHitTokens = row.cache_hit_tokens || 0;
    const requests = row.requests ?? row.request_count ?? 0;
    const errors = row.errors ?? row.error_count ?? 0;
    const tokens = row.tokens || 0;
    const useTimeSumSec = row.use_time_sum_sec || 0;
    const firstTokenMsSum = row.first_token_ms_sum || 0;
    const firstTokenCount = row.first_token_count || 0;
    // Cache-hit denominator = total input tokens (incl. cache). Falls back to
    // prompt_tokens for un-backfilled rows; see mapStatsTotals for the rationale.
    const totalInputTokens = Number(row.total_input_tokens) > 0
        ? Number(row.total_input_tokens)
        : (row.prompt_tokens || 0);

    return {
        cache_creation_tokens: row.cache_creation_tokens || 0,
        image_tokens: row.image_tokens || 0,
        audio_tokens: row.audio_tokens || 0,
        total_input_tokens: totalInputTokens,
        cache_hit_ratio: totalInputTokens > 0 ? Number((cacheHitTokens / totalInputTokens).toFixed(4)) : 0,
        success_rate: requests > 0 ? Number((1 - errors / requests).toFixed(4)) : 0,
        avg_latency_ms: requests > 0 ? Math.round((useTimeSumSec / requests) * 1000) : 0,
        avg_ttft_ms: firstTokenCount > 0 ? Math.round(firstTokenMsSum / firstTokenCount) : 0,
        tps: useTimeSumSec > 0 ? Number((tokens / useTimeSumSec).toFixed(2)) : 0
    };
}

const STATS_TOKEN_SUM_SQL = `
    SUM(prompt_tokens) as prompt_tokens,
    SUM(completion_tokens) as completion_tokens,
    SUM(cache_hit_tokens) as cache_hit_tokens,
    SUM(tokens) as tokens
`;

module.exports = {
    parseIsMultiKey,
    parseMultiKeyIndex,
    parseCacheHitTokens,
    parseCacheCreationTokens,
    parseImageTokens,
    parseAudioTokens,
    parseToolCalls,
    parseReasoning,
    parseFrtMs,
    parseBillingSource,
    parseRatios,
    metricsFromLog,
    mapStatsTotals,
    mapExtendedMetrics,
    STATS_TOKEN_SUM_SQL
};
