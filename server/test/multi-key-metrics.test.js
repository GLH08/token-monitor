const assert = require('node:assert/strict');
const test = require('node:test');

const { parseMultiKeyIndex, parseIsMultiKey, metricsFromLog } = require('../tokenMetrics');

test('parseIsMultiKey reads admin_info.is_multi_key', () => {
    assert.equal(parseIsMultiKey({ admin_info: { is_multi_key: true } }), true);
    assert.equal(parseIsMultiKey({ admin_info: { is_multi_key: false } }), false);
    assert.equal(parseIsMultiKey({ admin_info: {} }), false);
    assert.equal(parseIsMultiKey({}), false);
    assert.equal(parseIsMultiKey(null), false);
});

test('parseMultiKeyIndex reads admin_info.multi_key_index', () => {
    assert.equal(parseMultiKeyIndex({ admin_info: { is_multi_key: true, multi_key_index: 3 } }), 3);
    assert.equal(parseMultiKeyIndex({ admin_info: { is_multi_key: true, multi_key_index: 0 } }), 0);
    assert.equal(parseMultiKeyIndex({ admin_info: { is_multi_key: false } }), -1);
    assert.equal(parseMultiKeyIndex({ admin_info: {} }), -1);
    assert.equal(parseMultiKeyIndex({}), -1);
    assert.equal(parseMultiKeyIndex(null), -1);
    assert.equal(parseMultiKeyIndex('{"admin_info":{"is_multi_key":true,"multi_key_index":2}}'), 2);
});

test('metricsFromLog includes multiKeyIndex and isMultiKey', () => {
    const metrics = metricsFromLog({
        promptTokens: 100,
        completionTokens: 50,
        useTime: 2,
        other: JSON.stringify({
            model_ratio: 1.0, group_ratio: 1.0, completion_ratio: 1.0,
            admin_info: { is_multi_key: true, multi_key_index: 5 }
        })
    });
    assert.equal(metrics.isMultiKey, true);
    assert.equal(metrics.multiKeyIndex, 5);
});

test('metricsFromLog returns isMultiKey=false, multiKeyIndex=-1 for non-multi-key logs', () => {
    const metrics = metricsFromLog({
        promptTokens: 100,
        completionTokens: 50,
        useTime: 2,
        other: JSON.stringify({ model_ratio: 1.0, group_ratio: 1.0 })
    });
    assert.equal(metrics.isMultiKey, false);
    assert.equal(metrics.multiKeyIndex, -1);
});

test('metricsFromLog returns defaults when other is null', () => {
    const metrics = metricsFromLog({ promptTokens: 10, completionTokens: 5 });
    assert.equal(metrics.isMultiKey, false);
    assert.equal(metrics.multiKeyIndex, -1);
});
