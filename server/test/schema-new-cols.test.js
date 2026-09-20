const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const schema = fs.readFileSync(
    path.join(__dirname, '..', 'prisma', 'schema.prisma'),
    'utf8'
);

test('prisma schema maps tokens.auto_groups like latest new-api', () => {
    assert.match(schema, /autoGroups\s+String\?\s+@map\("auto_groups"\)\s+@db\.Text/);
});

test('prisma schema maps users.request_count like latest new-api', () => {
    assert.match(schema, /requestCount\s+Int\s+@map\("request_count"\)\s+@default\(0\)/);
});
