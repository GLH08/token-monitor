const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const schema = fs.readFileSync(
    path.join(__dirname, '..', 'prisma', 'schema.prisma'),
    'utf8'
);

test('prisma schema matches reference channel and token columns', () => {
    assert.match(schema, /openaiOrganization\s+String\?\s+@map\("open_ai_organization"\)/);
    assert.match(schema, /name\s+String\?/);
    assert.match(schema, /channelInfo\s+Json\?\s+@map\("channel_info"\)/);
    assert.match(schema, /key\s+String\s+@unique\s+@db\.VarChar\(128\)/);
});

test('channel info parser accepts PostgreSQL JSON objects and serialized JSON', () => {
    const { parseChannelInfo } = require('../channelInfo');
    const source = {
        is_multi_key: true,
        multi_key_size: 2,
        multi_key_status_list: { '0': 1, '1': 3 }
    };

    assert.deepEqual(parseChannelInfo(source), source);
    assert.deepEqual(parseChannelInfo(JSON.stringify(source)), source);
    assert.equal(parseChannelInfo(null), null);
    assert.equal(parseChannelInfo('{bad-json'), null);
});
