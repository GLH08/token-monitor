const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-api-'));
process.env.MONITOR_DB_PATH = path.join(tempDir, 'monitor.db');

const db = require('../db');
const { prisma } = require('../syncer');
const { mapExtendedMetrics } = require('../tokenMetrics');
const { getUsageBreakdownByUser, mapTotals } = require('../routes/usage');
const { aggregateTokenUsage } = require('../routes/tokens');
const { parseUsageFilters } = require('../request');

const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;

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
});

const USAGE_INSERT_SQL = `INSERT INTO usage_stats (hour, user_group, channel_id, model_name, token_id,
    prompt_tokens, completion_tokens, cache_hit_tokens, tokens, request_count, quota, error_count,
    cache_creation_tokens, image_tokens, audio_tokens, success_count,
    first_token_ms_sum, first_token_count, use_time_sum_sec)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

// --- derived metric math (mapExtendedMetrics) ---

test('mapExtendedMetrics derives rates and averages from sum columns', () => {
    const m = mapExtendedMetrics({
        prompt_tokens: 1000, cache_hit_tokens: 300, tokens: 1500,
        requests: 10, errors: 2,
        use_time_sum_sec: 50, first_token_ms_sum: 8000, first_token_count: 8,
        cache_creation_tokens: 400, image_tokens: 16, audio_tokens: 100
    });
    assert.equal(m.cache_hit_ratio, 0.3);     // 300/1000
    assert.equal(m.success_rate, 0.8);        // 1 - 2/10
    assert.equal(m.avg_latency_ms, 5000);     // 50/10*1000
    assert.equal(m.avg_ttft_ms, 1000);        // 8000/8
    assert.equal(m.tps, 30);                  // 1500/50
    assert.equal(m.cache_creation_tokens, 400);
    assert.equal(m.image_tokens, 16);
    assert.equal(m.audio_tokens, 100);
});

test('mapExtendedMetrics returns zeros when there is no data', () => {
    const m = mapExtendedMetrics({});
    assert.equal(m.cache_hit_ratio, 0);
    assert.equal(m.success_rate, 0);
    assert.equal(m.avg_latency_ms, 0);
    assert.equal(m.avg_ttft_ms, 0);
    assert.equal(m.tps, 0);
});

test('mapExtendedMetrics accepts request_count/error_count aliases', () => {
    const m = mapExtendedMetrics({
        prompt_tokens: 100, request_count: 4, error_count: 1,
        use_time_sum_sec: 8, tokens: 40
    });
    assert.equal(m.success_rate, 0.75);   // 1 - 1/4
    assert.equal(m.avg_latency_ms, 2000); // 8/4*1000
    assert.equal(m.tps, 5);               // 40/8
});

// --- mapTotals exposes cost_usd + derived metrics ---

test('mapTotals includes cost_usd and derived metrics', () => {
    const t = mapTotals({
        quota: 500000, tokens: 100, prompt_tokens: 60, cache_hit_tokens: 20,
        requests: 5, errors: 1, use_time_sum_sec: 10
    });
    assert.equal(t.cost_usd, 1);             // 500000/QUOTA_PER_UNIT
    assert.equal(t.cost, 1);
    assert.equal(t.cache_hit_ratio, 0.3333); // 20/60 rounded to 4dp
    assert.equal(t.success_rate, 0.8);       // 1 - 1/5
    assert.equal(t.avg_latency_ms, 2000);    // 10/5*1000
});

test('usage filters default to tokens', () => {
    const filters = parseUsageFilters({
        start_ts: '1710000000',
        end_ts: '1710003600'
    });

    assert.equal(filters.metric, 'tokens');
});

test('aggregateTokenUsage returns canonical token fields from logs', () => {
    const rows = aggregateTokenUsage([
        {
            createdAt: 1710000100,
            promptTokens: 80,
            completionTokens: 20,
            quota: 100,
            other: JSON.stringify({
                input_tokens_total: 100,
                cache_tokens: 30,
                cache_write_tokens: 10
            })
        }
    ]);

    assert.deepEqual(rows, [{
        hour: 1710000000,
        quota: 100,
        requests: 1,
        tokens: 100,
        prompt_tokens: 80,
        completion_tokens: 20,
        cache_read_tokens: 30,
        cache_creation_tokens: 10,
        total_input_tokens: 100,
        net_input_tokens: 60,
        throughput_total: 120,
        throughput_tokens: 120,
        image_tokens: 0,
        audio_tokens: 0
    }]);
});

// --- per-user breakdown: token_id -> user regroup (no usage_stats schema change) ---

test('per-user breakdown regroups token_id rows by user and ranks by metric', async () => {
    const hour = 1710000000;
    // token 101 -> user 1, token 102 -> user 1, token 201 -> user 2
    await db.runAsync(USAGE_INSERT_SQL,
        [hour, 'default', 1, 'gpt-4o', 101, 100, 20, 10, 120, 2, 1000, 0, 0, 0, 0, 2, 400, 2, 4]);
    await db.runAsync(USAGE_INSERT_SQL,
        [hour, 'default', 1, 'gpt-4o', 102, 200, 40, 20, 240, 3, 2000, 1, 0, 0, 0, 3, 600, 3, 6]);
    await db.runAsync(USAGE_INSERT_SQL,
        [hour, 'default', 1, 'gpt-4o', 201, 50, 10, 0, 60, 1, 500, 0, 0, 0, 0, 1, 0, 0, 2]);

    const originalTokenFindMany = prisma.token.findMany;
    const originalUserFindMany = prisma.user.findMany;
    prisma.token.findMany = async ({ where, select }) => {
        assert.deepEqual(select, { id: true, name: true, userId: true });
        return [
            { id: 101, name: 'tok-a', userId: 1 },
            { id: 102, name: 'tok-b', userId: 1 },
            { id: 201, name: 'tok-c', userId: 2 }
        ].filter((t) => where.id.in.includes(t.id));
    };
    prisma.user.findMany = async ({ where, select }) => {
        assert.deepEqual(select, { id: true, username: true, displayName: true });
        return [
            { id: 1, username: 'alice', displayName: 'Alice' },
            { id: 2, username: 'bob', displayName: 'Bob' }
        ].filter((u) => where.id.in.includes(u.id));
    };

    try {
        const filters = { metric: 'cost', limit: 20 };
        const where = 'WHERE hour >= ? AND hour <= ?';
        const params = [hour, hour + 3599];
        const rows = await getUsageBreakdownByUser(filters, where, params);

        // user 1 = tokens 101+102: quota 3000, requests 5, tokens 360, errors 1
        // user 2 = token 201:       quota 500,  requests 1, tokens 60,  errors 0
        assert.equal(rows.length, 2);
        assert.equal(rows[0].key, '1');            // ranked by cost desc -> user 1 first
        assert.equal(rows[0].label, 'alice');
        assert.equal(rows[0].username, 'alice');
        assert.equal(rows[0].user_id, 1);
        assert.equal(rows[0].requests, 5);
        assert.equal(rows[0].quota, 3000);
        assert.equal(rows[0].cost_usd, 3000 / QUOTA_PER_UNIT);
        assert.equal(rows[0].tokens, 360);
        assert.equal(rows[0].success_rate, 0.8);   // 1 - 1/5
        assert.equal(rows[0].avg_latency_ms, 2000);// (4+6)/5*1000
        assert.equal(rows[0].avg_ttft_ms, 200);    // (400+600)/(2+3)
        assert.equal(rows[0].tps, 36);             // 360/10

        assert.equal(rows[1].key, '2');
        assert.equal(rows[1].label, 'bob');
        assert.equal(rows[1].requests, 1);
        assert.equal(rows[1].quota, 500);
    } finally {
        prisma.token.findMany = originalTokenFindMany;
        prisma.user.findMany = originalUserFindMany;
    }
});

test('per-user breakdown respects the limit after ranking', async () => {
    const hour = 1710000000;
    await db.runAsync(USAGE_INSERT_SQL,
        [hour, 'default', 1, 'm', 1, 10, 0, 0, 10, 1, 100, 0, 0, 0, 0, 1, 0, 0, 1]);
    await db.runAsync(USAGE_INSERT_SQL,
        [hour, 'default', 1, 'm', 2, 10, 0, 0, 10, 1, 500, 0, 0, 0, 0, 1, 0, 0, 1]);

    const originalTokenFindMany = prisma.token.findMany;
    const originalUserFindMany = prisma.user.findMany;
    prisma.token.findMany = async () => [
        { id: 1, name: 't1', userId: 11 },
        { id: 2, name: 't2', userId: 22 }
    ];
    prisma.user.findMany = async () => [
        { id: 11, username: 'alice', displayName: 'A' },
        { id: 22, username: 'bob', displayName: 'B' }
    ];

    try {
        const rows = await getUsageBreakdownByUser(
            { metric: 'cost', limit: 1 },
            'WHERE hour >= ? AND hour <= ?',
            [hour, hour + 3599]
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].key, '22'); // bob has higher quota (500 > 100)
    } finally {
        prisma.token.findMany = originalTokenFindMany;
        prisma.user.findMany = originalUserFindMany;
    }
});
