# Error Handling

> How errors are handled in this project.

---

## Overview

There is **no central Express error middleware** and **no custom error classes**.
Every route handler owns its own `try/catch` and returns a JSON error with an HTTP
status. Validation is done up-front (before the `try`) using `request.js` helpers
that return `null` on invalid input.

---

## Error Types

No custom error subclasses are defined. Code throws and catches plain `Error`
objects and reports `error.message`. Domain "errors" from validators are signalled
by returning `null`, not by throwing.

---

## Error Handling Patterns

**Route pattern: validate first (guard + early 400), then `try/catch` the work.**

```js
// server/routes/tokens.js:10-14
const timeRange = parseTimeRange(req.query, { startTs: now - 24 * 3600, endTs: now });
if (!timeRange) {
    return sendValidationError(res);   // 400, before entering try
}
try {
    // ... queries ...
} catch (err) {
    res.status(500).json({ error: err.message });
}
```

**Background jobs never throw to a client.** The `setInterval` loops and `syncer`
functions `try/catch`, log, and record state. `syncLogs` stashes the error and
re-throws to its caller, which records it in `syncMetrics.lastError`:

```js
// server/syncer.js:315-321
} catch (error) {
    syncState.consecutiveFailures += 1;
    syncState.lastError = error.message;
    console.error('[SYNC] Error:', error);
    throw error;
}
// server/index.js:187-189 (caller)
} catch (e) { syncMetrics.lastError = e.message; }
```

---

## API Error Responses

**Standard shape: `{ error: <message> }`** with one of three status codes:

| Status | When | Source |
|--------|------|--------|
| `400` | Validation failure | `sendValidationError(res, msg)` — `server/request.js:195-197` |
| `401` | Missing/invalid/expired auth | Auth middleware — `server/index.js:67-75` |
| `500` | Unexpected error in a handler | `catch (err) { res.status(500).json({ error: err.message }) }` |

```js
// server/routes/alerts.js:7-13
router.get('/', async (req, res) => {
    try {
        const rows = await db.allAsync("SELECT * FROM alerts ORDER BY id DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

**Known inconsistency:** the `dashboard/*` endpoints in `stats.js` wrap errors in a
`{ success: false, error }` envelope instead of the bare `{ error }` used
elsewhere (`server/routes/stats.js:361-363`). This is existing tech debt — match
the envelope of the file you are editing rather than "fixing" it as a side effect.

---

## Common Mistakes

- Running validation **inside** the `try` and letting a `null` slip through to a
  query — validate and early-return `sendValidationError` first.
- Returning a raw error object or stack instead of `{ error: err.message }`.
- Letting a background job's rejection go unhandled — always `catch`, `console.error`
  with a `[TAG]`, and record state (`lastError`) so status endpoints reflect it.
- Inventing a new response envelope; reuse `{ error }` (or the file's existing
  `{ success, error }` shape) for consistency.
