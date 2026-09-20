const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-keyerr-'));
process.env.MONITOR_DB_PATH = path.join(tempDir, 'monitor.db');

const db = require('../db');
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
    await db.runAsync('DELETE FROM key_stats');
});

test('key_stats aggregates ERROR logs carrying admin_info multi_key_index', async () => {
    await updateStats([
        {
            createdAt: 1710000000,
            channelId: 7,
            modelName: 'gpt-4o',
            tokenId: 9,
            group: 'default',
            promptTokens: 0,
            completionTokens: 0,
            quota: 0,
            useTime: 1,
            type: 5,
            other: JSON.stringify({
                error_type: 'channel_error',
                error_code: 'channel_http_code_401',
                status_code: 401,
                admin_info: { is_multi_key: true, multi_key_index: 2 }
            })
        }
    ]);

    const row = await db.getAsync(
        `SELECT prompt_tokens, completion_tokens, tokens, request_count,
                quota, error_count, avg_latency
         FROM key_stats
         WHERE channel_id = 7 AND key_index = 2 AND model_name = 'gpt-4o'`
    );

    assert.ok(row, 'expected a key_stats row for the multi-key error log');
    assert.equal(row.prompt_tokens, 0);
    assert.equal(row.quota, 0);
    assert.equal(row.error_count, 1);
    assert.equal(row.request_count, 1);
});
