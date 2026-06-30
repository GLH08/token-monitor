const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-'));
process.env.MONITOR_DB_PATH = path.join(tempDir, 'monitor.db');

const db = require('../db');
const {
    getRebuildHourRange,
    parseCacheHitTokens,
    prisma,
    updateUsageStats
} = require('../syncer');
const {
    applyRequestIdFilter,
    extractRequestId
} = require('../routes/logs');
const {
    getModelStatus
} = require('../modelStatus');

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
    await db.runAsync('DELETE FROM usage_stats');
    await db.runAsync('DELETE FROM stats');
});

async function withFakeNow(nowSeconds, callback) {
    const originalNow = Date.now;
    Date.now = () => nowSeconds * 1000;
    try {
        return await callback();
    } finally {
        Date.now = originalNow;
    }
}

test('parseCacheHitTokens recognizes top-level and nested usage fields', () => {
    assert.equal(parseCacheHitTokens('{"cache_tokens":42}'), 42);
    assert.equal(parseCacheHitTokens({ usage: { prompt_tokens_details: { cached_tokens: 9 } } }), 9);
    assert.equal(parseCacheHitTokens({ usage: { input_tokens_details: { cache_read_input_tokens: 13 } } }), 13);
    assert.equal(parseCacheHitTokens('not-json'), 0);
});

test('extractRequestId prefers the column and falls back to nested JSON payloads', () => {
    assert.equal(extractRequestId(' req-column ', '{"request_id":"from-content"}'), 'req-column');
    assert.equal(extractRequestId('', '{"meta":{"requestId":"req-nested"}}'), 'req-nested');
    assert.equal(extractRequestId(null, 'not-json', '{"headers":{"x-request-id":"req-header"}}'), 'req-header');
    assert.equal(extractRequestId('', 'not-json'), '');
});

test('applyRequestIdFilter searches request column and payload fields', () => {
    const where = { type: 2 };
    applyRequestIdFilter(where, ' req-123 ');

    assert.deepEqual(where, {
        type: 2,
        OR: [
            { requestId: { contains: 'req-123' } },
            { content: { contains: 'req-123' } },
            { other: { contains: 'req-123' } }
        ]
    });

    const untouched = { type: 5 };
    applyRequestIdFilter(untouched, '   ');
    assert.deepEqual(untouched, { type: 5 });
});

test('updateUsageStats aggregates usage dimensions and cache hit tokens', async () => {
    await updateUsageStats([
        {
            createdAt: 1710000100,
            group: 'vip',
            channelId: 7,
            modelName: 'claude-3-5-sonnet',
            tokenId: 101,
            promptTokens: 100,
            completionTokens: 20,
            quota: 1200,
            useTime: 800,
            type: 2,
            other: '{"usage":{"input_tokens_details":{"cached_tokens":30}}}'
        },
        {
            createdAt: 1710000200,
            group: 'vip',
            channelId: 7,
            modelName: 'claude-3-5-sonnet',
            tokenId: 101,
            promptTokens: 50,
            completionTokens: 10,
            quota: 600,
            useTime: 1000,
            type: 5,
            other: '{"cache_read_input_tokens":15}'
        },
        {
            createdAt: 1710000200,
            group: 'default',
            channelId: 7,
            modelName: 'gpt-4o-mini',
            tokenId: 202,
            promptTokens: 12,
            completionTokens: 8,
            quota: 200,
            useTime: 500,
            type: 2,
            other: '{}'
        }
    ]);

    const rows = await db.allAsync(`
        SELECT hour, user_group, channel_id, model_name, token_id,
               prompt_tokens, completion_tokens, cache_hit_tokens, tokens,
               request_count, quota, error_count, avg_latency
        FROM usage_stats
        ORDER BY user_group, model_name
    `);

    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1], {
        hour: 1710000000,
        user_group: 'vip',
        channel_id: 7,
        model_name: 'claude-3-5-sonnet',
        token_id: 101,
        prompt_tokens: 150,
        completion_tokens: 30,
        cache_hit_tokens: 45,
        tokens: 180,
        request_count: 2,
        quota: 1800,
        error_count: 1,
        avg_latency: 900
    });
    assert.deepEqual(rows[0], {
        hour: 1710000000,
        user_group: 'default',
        channel_id: 7,
        model_name: 'gpt-4o-mini',
        token_id: 202,
        prompt_tokens: 12,
        completion_tokens: 8,
        cache_hit_tokens: 0,
        tokens: 20,
        request_count: 1,
        quota: 200,
        error_count: 0,
        avg_latency: 500
    });
});

test('getRebuildHourRange expands partial ranges to complete hours', () => {
    assert.deepEqual(getRebuildHourRange(1710001800, 1710003600), {
        startHour: 1710000000,
        endHour: 1710000000,
        queryStartTs: 1710000000,
        queryEndTs: 1710003599
    });
});

test('getModelStatus uses log data for sub-hour windows', async () => {
    const originalGroupBy = prisma.log.groupBy;
    const now = 1710003600;
    prisma.log.groupBy = async (query) => {
        assert.deepEqual(query.where, {
            modelName: 'claude-sub-hour-test',
            createdAt: { gte: 1710000000, lt: now },
            type: { in: [2, 5] },
            channelId: 7
        });

        return [
            { createdAt: 1710000300, type: 2, _count: { id: 2 } },
            { createdAt: 1710000601, type: 2, _count: { id: 1 } },
            { createdAt: 1710000601, type: 5, _count: { id: 1 } }
        ];
    };

    try {
        const status = await withFakeNow(now, () => getModelStatus('claude-sub-hour-test', '1h', 7));

        assert.equal(status.total_requests, 4);
        assert.equal(status.success_count, 3);
        assert.equal(status.success_rate, 75);
        assert.equal(status.current_status, 'red');
        assert.equal(status.slot_data.length, 12);
        assert.deepEqual(status.slot_data[0], {
            slot: 0,
            start_time: 1710000000,
            end_time: 1710000300,
            total_requests: 0,
            success_count: 0,
            success_rate: null,
            status: 'gray'
        });
        assert.deepEqual(status.slot_data[1], {
            slot: 1,
            start_time: 1710000300,
            end_time: 1710000600,
            total_requests: 2,
            success_count: 2,
            success_rate: 100,
            status: 'green'
        });
        assert.deepEqual(status.slot_data[2], {
            slot: 2,
            start_time: 1710000600,
            end_time: 1710000900,
            total_requests: 2,
            success_count: 1,
            success_rate: 50,
            status: 'red'
        });
    } finally {
        prisma.log.groupBy = originalGroupBy;
    }
});

test('getModelStatus uses hourly stats data for 24h windows', async () => {
    const now = 1710086400;
    await db.runAsync(
        `INSERT INTO stats (channel_id, model_name, hour, prompt_tokens, completion_tokens, cache_hit_tokens, tokens, request_count, quota, error_count, avg_latency)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [7, 'claude-hourly-test', 1710000000, 800, 200, 0, 1000, 4, 2000, 1, 800]
    );
    await db.runAsync(
        `INSERT INTO stats (channel_id, model_name, hour, prompt_tokens, completion_tokens, cache_hit_tokens, tokens, request_count, quota, error_count, avg_latency)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [8, 'claude-hourly-test', 1710000000, 800, 200, 0, 1000, 9, 2000, 9, 800]
    );

    const status = await withFakeNow(now, () => getModelStatus('claude-hourly-test', '24h', 7));

    assert.equal(status.total_requests, 4);
    assert.equal(status.success_count, 3);
    assert.equal(status.success_rate, 75);
    assert.equal(status.current_status, 'red');
    assert.equal(status.slot_data.length, 24);
    assert.deepEqual(status.slot_data[0], {
        slot: 0,
        start_time: 1710000000,
        end_time: 1710003600,
        total_requests: 4,
        success_count: 3,
        success_rate: 75,
        status: 'red'
    });
    assert.equal(status.slot_data[1].status, 'gray');
    assert.equal(status.slot_data[1].total_requests, 0);
});
