const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-'));
process.env.MONITOR_DB_PATH = path.join(tempDir, 'monitor.db');

const db = require('../db');
const {
    captureExtendedBackfillBoundary,
    stepExtendedMetricsBackfill,
    stepKeyStatsBackfill,
    captureBillingTypeBackfillBoundary,
    stepBillingTypeBackfill,
    writeBillingTypeBatch,
    prisma
} = require('../syncer');

const DONE_KEY = 'extended_backfill_done_v1';
const END_KEY = 'extended_backfill_end_id_v1';
const PROGRESS_KEY = 'extended_backfill_progress_id_v1';
const KEY_STATS_DONE_KEY = 'key_stats_backfill_done_v1';
const KEY_STATS_PROGRESS_KEY = 'key_stats_backfill_progress_id_v1';
const BILLING_TYPE_DONE_KEY = 'billing_type_backfill_done_v1';
const BILLING_TYPE_END_KEY = 'billing_type_backfill_end_id_v1';
const BILLING_TYPE_PROGRESS_KEY = 'billing_type_backfill_progress_id_v1';

async function resetBackfillMeta() {
    await db.runAsync(
        `DELETE FROM meta WHERE key IN (?, ?, ?, ?, ?, ?, ?, ?, 'last_synced_id')`,
        [DONE_KEY, END_KEY, PROGRESS_KEY, KEY_STATS_DONE_KEY, KEY_STATS_PROGRESS_KEY,
            BILLING_TYPE_DONE_KEY, BILLING_TYPE_END_KEY, BILLING_TYPE_PROGRESS_KEY],
    );
}

async function getMetaValue(key) {
    const row = await db.getAsync('SELECT value FROM meta WHERE key = ?', [key]);
    return row ? row.value : undefined;
}

test('captureExtendedBackfillBoundary marks done when nothing is synced yet', async () => {
    await resetBackfillMeta(); // no last_synced_id
    const result = await captureExtendedBackfillBoundary();
    assert.strictEqual(result.skipped, true);
    assert.ok(await getMetaValue(DONE_KEY), 'should mark the backfill done');
});

test('captureExtendedBackfillBoundary persists end_id from last_synced_id', async () => {
    await resetBackfillMeta();
    await db.runAsync("INSERT INTO meta(key, value) VALUES('last_synced_id', '500')");
    const result = await captureExtendedBackfillBoundary();
    assert.strictEqual(result.captured, true);
    assert.strictEqual(result.endId, 500);
    assert.strictEqual(await getMetaValue(END_KEY), '500');
    assert.strictEqual(await getMetaValue(PROGRESS_KEY), '0');
});

test('captureExtendedBackfillBoundary is idempotent on repeat calls', async () => {
    const result = await captureExtendedBackfillBoundary();
    assert.strictEqual(result.skipped, true);
    // end_id unchanged, not re-captured
    assert.strictEqual(await getMetaValue(END_KEY), '500');
});

test('stepExtendedMetricsBackfill skips (no re-capture) when the boundary was never captured', async () => {
    // Simulate a failed boundary capture: last_synced_id exists, but end_id was
    // never persisted. syncLogs could now be advancing last_synced_id past 500.
    // The backfill MUST skip and MUST NOT read last_synced_id as a new end_id,
    // otherwise freshly-synced logs would be double-counted.
    await resetBackfillMeta();
    await db.runAsync("INSERT INTO meta(key, value) VALUES('last_synced_id', '1000')");
    const result = await stepExtendedMetricsBackfill();
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(await getMetaValue(END_KEY), undefined, 'must not re-capture end_id');
});

test('stepExtendedMetricsBackfill skips once the backfill is marked done', async () => {
    await resetBackfillMeta();
    await db.runAsync("INSERT INTO meta(key, value) VALUES(?, 'now')", [DONE_KEY]);
    const result = await stepExtendedMetricsBackfill();
    assert.strictEqual(result.skipped, true);
});

test('captureBillingTypeBackfillBoundary persists a stable watermark', async () => {
    await resetBackfillMeta();
    await db.runAsync("INSERT INTO meta(key, value) VALUES('last_synced_id', '700')");
    const result = await captureBillingTypeBackfillBoundary();
    assert.strictEqual(result.captured, true);
    assert.strictEqual(result.endId, 700);
    assert.strictEqual(await getMetaValue(BILLING_TYPE_END_KEY), '700');
    assert.strictEqual(await getMetaValue(BILLING_TYPE_PROGRESS_KEY), '0');
});

test('stepBillingTypeBackfill updates existing aggregate rows and completes', async () => {
    await resetBackfillMeta();
    await db.runAsync("INSERT INTO meta(key, value) VALUES('last_synced_id', '700')");
    await captureBillingTypeBackfillBoundary();

    const log = {
        id: 700, createdAt: 1710000100, channelId: 11, modelName: 'tiered',
        tokenId: 4, group: 'default', promptTokens: 20, completionTokens: 5,
        quota: 800, useTime: 1, type: 2,
        other: JSON.stringify({ billing_mode: 'tiered_expr', billing_unit: 'request' })
    };
    const { updateStats } = require('../syncer');
    await updateStats([log]);
    await db.runAsync(
        'UPDATE stats SET fixed_price_requests = 0, fixed_price_quota = 0 ' +
        "WHERE channel_id = 11 AND model_name = 'tiered'"
    );
    await db.runAsync(
        'UPDATE usage_stats SET fixed_price_requests = 0, fixed_price_quota = 0 ' +
        "WHERE channel_id = 11 AND model_name = 'tiered' AND token_id = 4"
    );

    const originalFindMany = prisma.log.findMany;
    let calls = 0;
    prisma.log.findMany = async (args) => {
        calls += 1;
        assert.strictEqual(args.where.id.lte, 700);
        return calls === 1 ? [log] : [];
    };

    try {
        const result = await stepBillingTypeBackfill();
        assert.strictEqual(result.completed, true);
        assert.ok(calls >= 1);
        assert.ok(await getMetaValue(BILLING_TYPE_DONE_KEY));
    } finally {
        prisma.log.findMany = originalFindMany;
    }

    const statsRow = await db.getAsync("SELECT fixed_price_requests, fixed_price_quota FROM stats WHERE channel_id = 11 AND model_name = 'tiered'");
    const usageRow = await db.getAsync("SELECT fixed_price_requests, fixed_price_quota FROM usage_stats WHERE channel_id = 11 AND model_name = 'tiered' AND token_id = 4");
    assert.deepEqual(statsRow, { fixed_price_requests: 1, fixed_price_quota: 800 });
    assert.deepEqual(usageRow, { fixed_price_requests: 1, fixed_price_quota: 800 });
});

test('writeBillingTypeBatch commits progress and done flags atomically', async () => {
    await resetBackfillMeta();
    await db.runAsync("INSERT INTO meta(key, value) VALUES('last_synced_id', '700')");
    await captureBillingTypeBackfillBoundary();

    const log = {
        id: 700, createdAt: 1710000100, channelId: 11, modelName: 'tiered',
        tokenId: 4, group: 'default', promptTokens: 20, completionTokens: 5,
        quota: 800, useTime: 1, type: 2,
        other: JSON.stringify({ billing_mode: 'tiered_expr', billing_unit: 'request' })
    };
    const { updateStats } = require('../syncer');
    await updateStats([log]);
    await db.runAsync(
        'UPDATE stats SET fixed_price_requests = 0, fixed_price_quota = 0 ' +
        "WHERE channel_id = 11 AND model_name = 'tiered'"
    );

    // A completed batch must persist BOTH the progress checkpoint and the
    // done flag in the same transaction as the aggregate updates.
    const result = await writeBillingTypeBatch(
        [log],
        { progressId: 700, endId: 700, completed: true }
    );
    assert.strictEqual(await getMetaValue(BILLING_TYPE_PROGRESS_KEY), '700');
    assert.ok(await getMetaValue(BILLING_TYPE_DONE_KEY));

    const statsRow = await db.getAsync(
        "SELECT fixed_price_requests, fixed_price_quota FROM stats WHERE channel_id = 11 AND model_name = 'tiered'"
    );
    assert.deepEqual(statsRow, { fixed_price_requests: 1, fixed_price_quota: 800 });
    assert.strictEqual(result, undefined);
});

test('stepKeyStatsBackfill uses current last_synced_id instead of the stale extended boundary', async () => {
    await resetBackfillMeta();
    await db.runAsync("INSERT INTO meta(key, value) VALUES(?, ?)", [END_KEY, '37356']);
    await db.runAsync("INSERT INTO meta(key, value) VALUES(?, ?)", ['last_synced_id', '58505']);

    const originalFindMany = prisma.log.findMany;
    let query;
    prisma.log.findMany = async (args) => {
        query = args;
        return [];
    };

    try {
        const result = await stepKeyStatsBackfill();
        assert.strictEqual(result.endId, 58505);
        assert.strictEqual(query.where.id.lte, 58505);
        assert.notStrictEqual(query.where.id.lte, 37356);
    } finally {
        prisma.log.findMany = originalFindMany;
    }
});
