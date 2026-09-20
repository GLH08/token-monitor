const test = require('node:test');
const assert = require('node:assert/strict');

const { splitChannelKeys, parseChannelInfo } = require('../channelInfo');

test('splitChannelKeys parses JSON-array key fields like new-api GetKeys()', () => {
    assert.deepEqual(
        splitChannelKeys('["sk-alpha","","sk-beta "]'),
        ['sk-alpha', 'sk-beta']
    );
    assert.deepEqual(splitChannelKeys('["v1","v2"]'), ['v1', 'v2']);
});

test('splitChannelKeys falls back to newline convention', () => {
    assert.deepEqual(splitChannelKeys('sk-a\nsk-b\n'), ['sk-a', 'sk-b']);
    assert.deepEqual(splitChannelKeys('[not-json]'), ['[not-json]']);
});

test('splitChannelKeys handles empty and non-array inputs', () => {
    assert.deepEqual(splitChannelKeys('[]'), []);
    assert.deepEqual(splitChannelKeys(''), []);
    assert.deepEqual(splitChannelKeys('   '), []);
    assert.deepEqual(splitChannelKeys(null), []);
    assert.deepEqual(splitChannelKeys({}), []);
});

test('splitChannelKeys stringifies Vertex JSON-object entries like new-api GetKeys', () => {
    assert.deepEqual(
        splitChannelKeys('[{"project_id":"p1"},{"private_key":"noset"}]'),
        ['{"project_id":"p1"}', '{"private_key":"noset"}']
    );
    assert.deepEqual(splitChannelKeys('[1, 2]'), ['1', '2']);
    assert.deepEqual(splitChannelKeys('["k1", null, "k2"]'), ['k1', 'null', 'k2']);
});

test('routes/channels.js uses splitChannelKeys for the multi-key key list', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'channels.js'), 'utf8');
    assert.match(src, /splitChannelKeys\(channel\.key/);
    assert.match(src, /const \{ parseChannelInfo, splitChannelKeys \}/);
});

test('parseChannelInfo still rejects JSON arrays (unchanged contract)', () => {
    assert.equal(parseChannelInfo('[1,2]'), null);
});
