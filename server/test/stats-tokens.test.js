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

    assert.deepEqual(metrics, {
        promptTokens: 100,
        completionTokens: 20,
        cacheHitTokens: 30,
        tokens: 120,
        netInputTokens: 70,
        throughputTotal: 120
    });
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
        net_input_tokens: 1660000,
        throughput_total: 5429000
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