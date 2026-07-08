# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Quality here is about **consistency with existing idioms**, not tooling — there is
no linter or formatter configured for `server/`. The load-bearing conventions are:
validate through `request.js`, parameterize all SQL, use `async/await`, and keep
route/response shapes consistent with the file you're editing.

---

## Required Patterns

**1. Validate request input through `server/request.js`.** Helpers return `null` on
invalid input (or a supplied default when the param is absent); routes null-check
and early-return `sendValidationError`. Note the "*error only if provided AND
invalid*" idiom:

```js
// server/routes/logs.js:64-70
const pagination = parsePagination(req.query, { pageSize: 20, maxPageSize: 200 });
const timeRange  = parseTimeRange(req.query);
const channelId  = parseOptionalId(req.query.channel_id);
if (!pagination || !timeRange || (req.query.channel_id && channelId === null)) {
    return sendValidationError(res);
}
```

Available helpers: `parsePositiveInt`, `parseOptionalId`, `parsePagination`,
`parseTimeRange`, `parseHours`, `parseModelList`, `parseBoolean`, `parseWindow`,
`parseUsageFilters`, `parseAlertBody`, `sendValidationError`. **Prefer these over
ad-hoc `parseInt`/`req.query` parsing.**

**2. `async/await` everywhere.** Raw `sqlite3` callbacks appear *only* at the DB
boundary, always wrapped in a Promise (`db.js` `*Async` helpers or an inline
`new Promise` in `syncer.js`, e.g. `getMeta` at `syncer.js:39-46`).

**3. Parameterize SQL with `?`; whitelist dynamic columns.** See
[database-guidelines](./database-guidelines.md). Dynamic `IN (...)` is built from a
placeholder array: `` `AND model_name IN (${list.map(() => '?').join(',')})` ``
(`stats.js:266`).

**4. Standard route skeleton.** `const router = express.Router();` → handlers with
`try/catch` → `module.exports = router;` (`server/routes/channels.js`).

---

## Forbidden / Avoid

- **String-interpolating values into SQL.** Injection risk; use `?` params.
- **Importing `@prisma/client` directly.** Use `{ prisma }` from `../syncer`.
- **Inventing new response envelopes.** Reuse the shape already in the file (see
  below). Response shapes are *not* globally uniform, so consistency is per-file.
- **Swallowing background-job errors silently.** Log with a `[TAG]` and record state.

---

## Response Conventions (document the reality)

There is **no single response envelope**. Observed shapes, all valid — match the
neighbouring endpoints:

- Bare array — `res.json(rows)` (`alerts.js:10`, `stats.js:41`).
- Bare object — `res.json({ tokens, statusCount, total, timeRange })` (`tokens.js:70`).
- `{ success: true, data }` — auth routes, `admin.js`, dashboard endpoints, system endpoints.

Repeated boilerplate to be aware of: `const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;`
is copy-pasted into every module that computes cost (`cost = quota / QUOTA_PER_UNIT`).

---

## Testing Requirements

Tests use the **built-in `node:test`** runner (no Jest/Mocha). Suites live in
`server/test/*.test.js`; run with `npm test` (`node --test`).

```js
// server/test/usage-stats.test.js (shape)
const { test } = require('node:test');
const assert = require('node:assert');
test('...', () => { assert.strictEqual(actual, expected); });
```

Existing coverage is focused on pure aggregation/token math (`tokenMetrics`, usage
and stats rollups) rather than HTTP handlers. **When you add or change token/stat
math, add or update a `node:test` case.** There is no coverage gate.

---

## Code Review Checklist

- [ ] Request input validated via `request.js`; invalid input returns 400 before the `try`.
- [ ] All SQL uses `?` params; any dynamic column goes through a whitelist map.
- [ ] Prisma accessed via `{ prisma }` from `../syncer`; `BigInt` converted at boundaries.
- [ ] New monitor columns have both `CREATE TABLE` and an `ALTER TABLE` guard.
- [ ] Errors returned as `{ error }` (or the file's existing envelope); background errors logged with a `[TAG]`.
- [ ] Token/stat math changes covered by a `node:test` case.
