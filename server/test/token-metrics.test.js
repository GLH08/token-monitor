const assert = require('node:assert/strict');
const test = require('node:test');

const {
    metricsFromLog,
    parseCacheHitTokens,
    parseCacheCreationTokens,
    parseImageTokens,
    parseAudioTokens,
    parseToolCalls,
    parseReasoning,
    parseFrtMs,
    parseBillingSource,
    parseRatios
} = require('../tokenMetrics');

// tool_quota is derived from QUOTA_PER_UNIT; mirror the module default so the
// assertion holds regardless of the operator env.
const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;

// --- Real logs.other samples (see research/other-samples.md) ---

const S1_OPENAI = {
    model_ratio: 2.5, group_ratio: 1.0, completion_ratio: 4.0,
    cache_tokens: 120, cache_ratio: 0.5, model_price: 0.0,
    user_group_ratio: 1.0, frt: 845.0, billing_source: 'wallet',
    request_path: '/v1/chat/completions'
};

const S2_CLAUDE = {
    claude: true,
    model_ratio: 3.0, group_ratio: 1.0, completion_ratio: 5.0,
    cache_tokens: 500, cache_ratio: 0.1, model_price: 0.0,
    user_group_ratio: 1.0, frt: 1230.0,
    cache_creation_tokens: 800, cache_creation_ratio: 1.25,
    cache_creation_tokens_5m: 300, cache_creation_ratio_5m: 1.1,
    cache_creation_tokens_1h: 500, cache_creation_ratio_1h: 1.2,
    cache_write_tokens: 800, usage_semantic: 'anthropic',
    billing_source: 'wallet'
};

const S3_AUDIO = {
    audio: true,
    model_ratio: 1.0, group_ratio: 1.0, completion_ratio: 1.0,
    cache_tokens: 0, cache_ratio: 0.0, model_price: 0.0,
    user_group_ratio: 1.0, frt: 0.0,
    audio_input: 1500, audio_output: 320,
    text_input: 80, text_output: 120,
    audio_ratio: 2.0, audio_completion_ratio: 3.0
};

const S4_WSS = {
    ws: true,
    model_ratio: 1.5, group_ratio: 1.0, completion_ratio: 1.5,
    cache_tokens: 0, cache_ratio: 0.0, model_price: 0.0,
    user_group_ratio: 1.0, frt: 210.0,
    audio_input: 900, audio_output: 480,
    text_input: 40, text_output: 60,
    audio_ratio: 2.0, audio_completion_ratio: 3.0
};

const S5_IMAGE = {
    image: true,
    model_ratio: 0.0, group_ratio: 1.0, completion_ratio: 1.0,
    cache_tokens: 0, cache_ratio: 0.0, model_price: 0.04,
    user_group_ratio: 1.0, frt: 3200.0,
    image_ratio: 2.0, image_output: 4096,
    billing_source: 'wallet'
};

const S6_TOOLS = {
    model_ratio: 2.0, group_ratio: 1.0, completion_ratio: 3.0,
    cache_tokens: 0, cache_ratio: 0.0, model_price: 0.0,
    user_group_ratio: 1.0, frt: 1800.0, reasoning_effort: 'medium',
    web_search: true, web_search_call_count: 3, web_search_price: 10.0,
    file_search: true, file_search_call_count: 2, file_search_price: 2.5,
    image_generation_call: true, image_generation_call_price: 0.04,
    billing_source: 'subscription'
};

const S7_AUDIO_TEXT = {
    model_ratio: 1.0, group_ratio: 1.0, completion_ratio: 1.0,
    cache_tokens: 0, cache_ratio: 0.0, model_price: 0.0,
    user_group_ratio: 1.0, frt: 540.0,
    audio_input_seperate_price: true, audio_input_token_count: 750,
    audio_input_price: 0.003
};

// --- cache hit (read) tokens ---

test('parseCacheHitTokens reads cache_tokens across samples', () => {
    assert.equal(parseCacheHitTokens(S1_OPENAI), 120);
    assert.equal(parseCacheHitTokens(S2_CLAUDE), 500);
    assert.equal(parseCacheHitTokens(S3_AUDIO), 0);
});

// --- cache creation (write) tokens ---

test('parseCacheCreationTokens prefers the normalized cache_write_tokens field', () => {
    assert.equal(parseCacheCreationTokens(S2_CLAUDE), 800);
});

test('parseCacheCreationTokens applies max(base, 5m+1h) when cache_write_tokens absent', () => {
    // 5m + 1h exceeds base -> take the split sum.
    assert.equal(parseCacheCreationTokens({
        cache_creation_tokens: 700,
        cache_creation_tokens_5m: 300,
        cache_creation_tokens_1h: 500
    }), 800);
    // base exceeds the split -> take base.
    assert.equal(parseCacheCreationTokens({
        cache_creation_tokens: 900,
        cache_creation_tokens_5m: 300,
        cache_creation_tokens_1h: 500
    }), 900);
    // only 5m split present.
    assert.equal(parseCacheCreationTokens({
        cache_creation_tokens: 200,
        cache_creation_tokens_5m: 300
    }), 300);
});

test('parseCacheCreationTokens falls back to base when no split present', () => {
    assert.equal(parseCacheCreationTokens({ cache_creation_tokens: 650 }), 650);
    assert.equal(parseCacheCreationTokens({}), 0);
});

test('parseCacheCreationTokens recognizes provider-native nested cache-write fields', () => {
    assert.equal(parseCacheCreationTokens({
        input_tokens_details: { cache_write_tokens: 123 }
    }), 123);
    assert.equal(parseCacheCreationTokens({
        usage: { prompt_tokens_details: { cache_write_tokens: 456 } }
    }), 456);
    assert.equal(parseCacheCreationTokens({
        usage: {
            cache_creation_input_tokens: 40,
            cache_creation: {
                ephemeral_5m_input_tokens: 30,
                ephemeral_1h_input_tokens: 25
            }
        }
    }), 55);
});

// --- image tokens ---

test('parseImageTokens reads image_output', () => {
    assert.equal(parseImageTokens(S5_IMAGE), 4096);
    assert.equal(parseImageTokens(S1_OPENAI), 0);
});

// --- audio tokens ---

test('parseAudioTokens reads audio_input/audio_output from audio + wss paths', () => {
    assert.deepEqual(parseAudioTokens(S3_AUDIO), { input: 1500, output: 320 });
    assert.deepEqual(parseAudioTokens(S4_WSS), { input: 900, output: 480 });
});

test('parseAudioTokens falls back to audio_input_token_count on the text path', () => {
    assert.deepEqual(parseAudioTokens(S7_AUDIO_TEXT), { input: 750, output: 0 });
});

// --- tool calls + tool quota ---

test('parseToolCalls sums web/file/image-generation counts and derives surcharge quota', () => {
    const { toolCalls, toolQuota } = parseToolCalls(S6_TOOLS);
    assert.equal(toolCalls, 6); // 3 web + 2 file + 1 image-gen

    const expected =
        Math.round(10.0 * 3 / 1000 * 1.0 * QUOTA_PER_UNIT) + // web_search
        Math.round(2.5 * 2 / 1000 * 1.0 * QUOTA_PER_UNIT) +  // file_search
        Math.round(0.04 * 1.0 * QUOTA_PER_UNIT);              // image_generation
    assert.equal(toolQuota, expected);
    // Sanity check at the default unit.
    if (QUOTA_PER_UNIT === 500000) {
        assert.equal(toolQuota, 37500);
    }
});

test('parseToolCalls returns zeros when no tool fields are present', () => {
    assert.deepEqual(parseToolCalls(S1_OPENAI), { toolCalls: 0, toolQuota: 0 });
});

// --- reasoning ---

test('parseReasoning is true only when reasoning_effort is a non-empty string', () => {
    assert.equal(parseReasoning(S6_TOOLS), true);
    assert.equal(parseReasoning(S1_OPENAI), false);
    assert.equal(parseReasoning({ reasoning_effort: '' }), false);
});

// --- frt (TTFT ms) ---

test('parseFrtMs reads other.frt and rounds to integer milliseconds', () => {
    assert.equal(parseFrtMs(S1_OPENAI), 845);
    assert.equal(parseFrtMs({ frt: 1234.6 }), 1235);
    assert.equal(parseFrtMs(S3_AUDIO), 0);
});

// --- billing source ---

test('parseBillingSource returns wallet/subscription or null', () => {
    assert.equal(parseBillingSource(S1_OPENAI), 'wallet');
    assert.equal(parseBillingSource(S6_TOOLS), 'subscription');
    assert.equal(parseBillingSource(S3_AUDIO), null);
    assert.equal(parseBillingSource({ billing_source: '' }), null);
});

// --- ratios ---

test('parseRatios extracts the full ratio set', () => {
    assert.deepEqual(parseRatios(S1_OPENAI), {
        model: 2.5, completion: 4.0, group: 1.0,
        cache: 0.5, userGroup: 1.0, modelPrice: 0.0
    });
    assert.deepEqual(parseRatios(S6_TOOLS), {
        model: 2.0, completion: 3.0, group: 1.0,
        cache: 0.0, userGroup: 1.0, modelPrice: 0.0
    });
});

// --- end-to-end metricsFromLog over a tool-call sample ---

test('metricsFromLog returns the full normalized struct with useTimeSec from log.useTime', () => {
    const metrics = metricsFromLog({
        promptTokens: 1000,
        completionTokens: 500,
        useTime: 12,
        other: JSON.stringify(S6_TOOLS)
    });

    assert.equal(metrics.promptTokens, 1000);
    assert.equal(metrics.completionTokens, 500);
    assert.equal(metrics.tokens, 1500);
    assert.equal(metrics.cacheHitTokens, 0);
    assert.equal(metrics.cacheCreationTokens, 0);
    assert.equal(metrics.imageTokens, 0);
    assert.equal(metrics.audioInputTokens, 0);
    assert.equal(metrics.audioOutputTokens, 0);
    assert.equal(metrics.toolCalls, 6);
    assert.equal(metrics.reasoning, true);
    assert.equal(metrics.frtMs, 1800);
    assert.equal(metrics.useTimeSec, 12);
    assert.equal(metrics.billingSource, 'subscription');
    assert.deepEqual(metrics.ratios, {
        model: 2.0, completion: 3.0, group: 1.0,
        cache: 0.0, userGroup: 1.0, modelPrice: 0.0
    });
});

test('metricsFromLog handles claude cache sample end-to-end', () => {
    const metrics = metricsFromLog({
        promptTokens: 2000,
        completionTokens: 800,
        useTime: 4,
        other: JSON.stringify(S2_CLAUDE)
    });

    assert.equal(metrics.cacheHitTokens, 500);
    assert.equal(metrics.cacheCreationTokens, 800);
    assert.equal(metrics.frtMs, 1230);
    assert.equal(metrics.useTimeSec, 4);
    assert.equal(metrics.billingSource, 'wallet');
    // Claude-semantic: total input = prompt + cache_hit + cache_creation = 3300;
    // net input (non-cached) = 3300 - 500 - 800 = 2000.
    assert.equal(metrics.totalInputTokens, 3300);
    assert.equal(metrics.netInputTokens, 2000);
});

test('metricsFromLog exposes canonical token aliases without changing legacy fields', () => {
    const metrics = metricsFromLog({
        promptTokens: 80,
        completionTokens: 20,
        other: JSON.stringify({
            input_tokens_total: 100,
            cache_tokens: 30,
            cache_write_tokens: 10
        })
    });

    assert.equal(metrics.totalInputTokens, 100);
    assert.equal(metrics.cacheReadTokens, 30);
    assert.equal(metrics.cacheCreationTokens, 10);
    assert.equal(metrics.uncachedInputTokens, 60);
    assert.equal(metrics.outputTokens, 20);
    assert.equal(metrics.throughputTokens, 120);
    assert.equal(metrics.netInputTokens, 60);
    assert.equal(metrics.throughputTotal, 120);
});

// --- tolerance ---

test('metricsFromLog is tolerant of null / invalid other and missing useTime', () => {
    const metrics = metricsFromLog({ promptTokens: 10, completionTokens: 5 });
    assert.equal(metrics.cacheHitTokens, 0);
    assert.equal(metrics.cacheCreationTokens, 0);
    assert.equal(metrics.frtMs, 0);
    assert.equal(metrics.useTimeSec, 0);
    assert.equal(metrics.billingSource, null);
    assert.equal(metrics.reasoning, false);
    assert.equal(metrics.toolCalls, 0);
    assert.equal(metrics.toolQuota, 0);

    const fromBadJson = metricsFromLog({ other: 'not-json' });
    assert.equal(fromBadJson.cacheHitTokens, 0);
    assert.equal(fromBadJson.cacheCreationTokens, 0);
});

test('parseCacheHitTokens accepts object or JSON string and tolerates bad input', () => {
    assert.equal(parseCacheHitTokens('{"cache_tokens":42}'), 42);
    assert.equal(parseCacheHitTokens({ cache_tokens: 42 }), 42);
    assert.equal(parseCacheHitTokens('not-json'), 0);
    assert.equal(parseCacheHitTokens(null), 0);
});
