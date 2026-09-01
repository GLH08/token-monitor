const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

// Use a temp MONITOR_DB_PATH so requiring the auth route (which transitively
// imports db) doesn't trip over a stale lock or schema.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-auth-'));
process.env.MONITOR_DB_PATH = path.join(tempDir, 'monitor.db');

test('routes/auth imports without ReferenceError', () => {
    // The regression this guards against: a previous refactor collapsed two
    // require('../auth') lines but accidentally dropped the separate
    // require('../request') that supplies requirePasswordLogin and
    // sendValidationError. Loading the router itself does not throw — the
    // ReferenceError surfaces only when /login is hit — so we additionally
    // pull the helpers off the request module and assert they are callable.
    assert.doesNotThrow(() => {
        require('../routes/auth');
        const requestModule = require('../request');
        assert.equal(typeof requestModule.requirePasswordLogin, 'function');
        assert.equal(typeof requestModule.sendValidationError, 'function');
    });
});

test('routes/auth still references the helpers it needs at runtime', () => {
    // Static check: if anyone removes these symbols again, this assertion
    // catches it before the route handler runs.
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'routes', 'auth.js'),
        'utf8'
    );
    assert.match(source, /require\(\s*['"]\.\.\/request['"]\s*\)/,
        'routes/auth.js must import helpers from ../request');
    assert.match(source, /requirePasswordLogin\s*\(/,
        'routes/auth.js must call requirePasswordLogin');
    assert.match(source, /sendValidationError\s*\(/,
        'routes/auth.js must call sendValidationError');
});
