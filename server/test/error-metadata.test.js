const test = require('node:test');
const assert = require('node:assert/strict');

const { parseErrorMetadata, metricsFromLog } = require('../tokenMetrics');

test('parseErrorMetadata reads new-api type-5 log fields', () => {
    const other = { error_type: 'channel_error', error_code: 'channel_http_code_401', status_code: 401 };
    assert.deepEqual(parseErrorMetadata(other), {
        error_type: 'channel_error',
        error_code: 'channel_http_code_401',
        status_code: 401
    });
});

test('parseErrorMetadata returns nulls for absent fields', () => {
    assert.deepEqual(parseErrorMetadata({}), {
        error_type: null,
        error_code: null,
        status_code: null
    });
    assert.equal(parseErrorMetadata(null), null);
});

test('metricsFromLog carries errorMetadata on error logs', () => {
    const metrics = metricsFromLog({
        promptTokens: 0,
        completionTokens: 0,
        useTime: 3,
        other: JSON.stringify({ error_type: 'api_error', error_code: 'timeout', status_code: 504 })
    });
    assert.deepEqual(metrics.errorMetadata, {
        error_type: 'api_error',
        error_code: 'timeout',
        status_code: 504
    });
});

test('/logs/errors response maps error fields after metricsFromLog', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'logs.js'), 'utf8');
    assert.match(src, /error_type: errorMetadata\.error_type/);
    assert.match(src, /error_code: errorMetadata\.error_code/);
    assert.match(src, /status_code: errorMetadata\.status_code/);
});
