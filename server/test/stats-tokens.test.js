const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-stats-'));
process.env.MONITOR_DB_PATH = path.join(tempDir, 'monitor.db');

const db = require('../db');
const { metricsFromLog, mapStatsTotals, parseCacheHitTokens } = require('../tokenMetrics');
const { prisma, updateStats } = require('../syncer');

function closeDb() {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

test.after(async () => {
    await prisma.$disconnect();
    await closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test.beforeEach(async () => {
    await db.runAsync('DELETE FROM stats');
    await db.runAsync('DELETE FROM usage_stats');
});

test('metricsFromLog computes net input and throughput totals', () => {
    const metrics = metricsFromLog({
        promptTokens: 100,
        completionTokens: 20,
        other: '{"cache_tokens":30}'
    });

    // OpenAI-semantic: prompt includes cache -> total input = prompt = 100.
    // net input = 100 - 30 - 0 = 70; throughput = 100 + 20 = 120.
    assert.deepEqual(metrics, {
        promptTokens: 100,
        completionTokens: 20,
        cacheHitTokens: 30,
        tokens: 120,
        netInputTokens: 70,
        throughputTotal: 120,
        cacheCreationTokens: 0,
        imageTokens: 0,
        audioInputTokens: 0,
        audioOutputTokens: 0,
        toolCalls: 0,
        toolQuota: 0,
        reasoning: false,
        frtMs: 0,
        useTimeSec: 0,
        billingSource: null,
        ratios: { model: 0, completion: 0, group: 0, cache: 0, userGroup: 0, modelPrice: 0 },
        totalInputTokens: 100,
        isMultiKey: false,
        multiKeyIndex: -1
    });
});

test('metricsFromLog totalInputTokens adds cache for Claude-semantic logs', () => {
    // new-api stores prompt_tokens EXCLUDING cache for Anthropic/Claude. The
    // total input (denominator for cache-hit ratio) must add cache read + write.
    const claude = metricsFromLog({
        promptTokens: 20,
        completionTokens: 10,
        other: JSON.stringify({ claude: true, cache_tokens: 80, cache_creation_tokens: 40 })
    });
    assert.equal(claude.totalInputTokens, 140); // 20 + 80 + 40

    // OpenAI-semantic: prompt_tokens already includes cache -> total = prompt.
    const openai = metricsFromLog({
        promptTokens: 100,
        completionTokens: 10,
        other: JSON.stringify({ cache_tokens: 80 })
    });
    assert.equal(openai.totalInputTokens, 100);
});

test('mapStatsTotals mirrors aggregate row semantics', () => {
    assert.deepEqual(mapStatsTotals({
        prompt_tokens: 5400000,
        completion_tokens: 29000,
        cache_hit_tokens: 3740000,
        tokens: 5429000
    }), {
        prompt_tokens: 5400000,
        completion_tokens: 29000,
        cache_hit_tokens: 3740000,
        tokens: 5429000,
        total_input_tokens: 5400000,
        net_input_tokens: 1660000,
        throughput_total: 5429000
    });
});

test('mapStatsTotals derives net input from total_input_tokens when backfilled', () => {
    // Claude-semantic bucket: total_input includes cache; net = total - cache_hit - cache_creation.
    assert.deepEqual(mapStatsTotals({
        prompt_tokens: 200,        // non-cached input (Claude)
        completion_tokens: 50,
        cache_hit_tokens: 800,     // cache read
        cache_creation_tokens: 100,
        total_input_tokens: 1100,  // 200 + 800 + 100
        tokens: 250
    }), {
        prompt_tokens: 200,
        completion_tokens: 50,
        cache_hit_tokens: 800,
        tokens: 250,
        total_input_tokens: 1100,
        net_input_tokens: 200,      // 1100 - 800 - 100
        throughput_total: 1150      // 1100 + 50
    });
});

test('updateStats aggregates token dimensions into stats', async () => {
    await updateStats([
        {
            createdAt: 1710000100,
            channelId: 3,
            modelName: 'minimax',
            tokenId: 1,
            group: 'default',
            promptTokens: 100,
            completionTokens: 20,
            quota: 500,
            useTime: 2,
            type: 2,
            other: '{"cache_tokens":30}'
        },
        {
            createdAt: 1710000200,
            channelId: 3,
            modelName: 'minimax',
            tokenId: 1,
            group: 'default',
            promptTokens: 50,
            completionTokens: 10,
            quota: 200,
            useTime: 3,
            type: 2,
            other: '{"cache_tokens":15}'
        }
    ]);

    const row = await db.getAsync(`
        SELECT prompt_tokens, completion_tokens, cache_hit_tokens, tokens,
               request_count, quota, error_count, avg_latency
        FROM stats
        WHERE channel_id = 3 AND model_name = 'minimax'
    `);

    assert.deepEqual(row, {
        prompt_tokens: 150,
        completion_tokens: 30,
        cache_hit_tokens: 45,
        tokens: 180,
        request_count: 2,
        quota: 700,
        error_count: 0,
        avg_latency: 3
    });
});

test('parseCacheHitTokens is exported from tokenMetrics for shared usage', () => {
    assert.equal(parseCacheHitTokens('{"cache_tokens":42}'), 42);
});

test('updateStats aggregates extended metrics from logs.other into stats', async () => {
    const other = JSON.stringify({
        model_ratio: 2.0, group_ratio: 1.0, completion_ratio: 3.0,
        cache_tokens: 0, cache_ratio: 0.0, model_price: 0.0, user_group_ratio: 1.0,
        frt: 1800.0, reasoning_effort: 'medium',
        web_search: true, web_search_call_count: 3, web_search_price: 10.0,
        file_search: true, file_search_call_count: 2, file_search_price: 2.5,
        image_generation_call: true, image_generation_call_price: 0.04,
        billing_source: 'subscription',
        cache_creation_tokens: 800, cache_creation_tokens_5m: 300,
        cache_creation_tokens_1h: 500, cache_write_tokens: 800,
        audio_input: 1500, audio_output: 320, image_output: 4096
    });

    await updateStats([
        {
            createdAt: 1710000100, channelId: 3, modelName: 'claude', tokenId: 1, group: 'default',
            promptTokens: 1000, completionTokens: 500, quota: 999, useTime: 12, type: 2, other
        },
        // error log with no other-derived metrics: frt/useTime still counted, no success.
        {
            createdAt: 1710000200, channelId: 3, modelName: 'claude', tokenId: 1, group: 'default',
            promptTokens: 100, completionTokens: 50, quota: 0, useTime: 4, type: 5, other: '{}'
        }
    ]);

    const row = await db.getAsync(`
        SELECT request_count, error_count, success_count, cache_creation_tokens,
               image_tokens, audio_tokens, reasoning_requests, tool_calls, tool_quota,
               first_token_ms_sum, first_token_count, use_time_sum_sec, total_input_tokens
        FROM stats
        WHERE channel_id = 3 AND model_name = 'claude'
    `);

    assert.deepEqual(row, {
        request_count: 2,
        error_count: 1,
        success_count: 1,
        cache_creation_tokens: 800,
        image_tokens: 4096,
        audio_tokens: 1820,
        reasoning_requests: 1,
        tool_calls: 6,
        tool_quota: 37500,
        first_token_ms_sum: 1800,
        first_token_count: 1,
        use_time_sum_sec: 16,
        total_input_tokens: 1100
    });
});