# Logging Guidelines

> How logging is done in this project.

---

## Overview

There is **no logging library and no log-level abstraction** — the backend uses
plain `console.log` / `console.warn` / `console.error`. The one convention that is
consistently followed is a **bracketed uppercase tag prefix**: `[TAG] message`.

---

## Log Levels

Only the three `console` methods, used by severity:

| Method | Use for |
|--------|---------|
| `console.log` | Normal lifecycle & progress (startup, sync batches, WS connects) |
| `console.warn` | Recoverable / degraded conditions |
| `console.error` | Caught errors in background jobs and a few routes |

There is no `debug` level and no runtime log-level filtering.

---

## Structured Logging

Not structured — human-readable strings with a **`[TAG]` prefix** and template-literal
interpolation. Tags currently in use: `[SERVER]`, `[SYNC]`, `[REBUILD]`, `[WS]`,
`[REALTIME]`, `[ALERT]`, `[ALERT CHECK]`, `[CIRCUIT BREAKER]`, `[NOTIFY]`,
`[ModelStatus]`, `[API]`. Reuse an existing tag when your code belongs to that
subsystem; otherwise add a new uppercase tag in the same style.

```js
// server/index.js:164
console.log(`[SERVER] Running on port ${PORT}`);
// server/syncer.js:291
console.log(`[SYNC] Batch ${processedBatches}: fetched ${logs.length} logs from id>${lastId}`);
// server/index.js:56
console.error('[REALTIME] Update error:', error.message);
```

Alert logs decorate with emoji (🚨 / ✅ / ⚠️ / ❌) — e.g. `server/alerter.js:340`.
Match the surrounding file if it already uses them; don't add emoji elsewhere.

---

## What to Log

- **Startup**: port / ready message (`index.js:164`).
- **Sync progress**: per-batch fetch counts and per-run summaries
  (`syncer.js:291`, `index.js:185`).
- **Background-job errors**: `console.error('[TAG] ...:', error)` in the `syncer`,
  realtime, alert, and snapshot loops.
- **WebSocket lifecycle**: client connect/disconnect (`index.js:146,149`).

---

## What NOT to Log

- **Secrets / auth material**: never log `ACCESS_PASSWORD`, `AUTH_SECRET`, bearer
  tokens, or `DATABASE_URL` credentials.
- **Route 500s are generally not logged** — handlers just return `{ error }`. Two
  exceptions log to `[API]` (`channels.js:22`). Don't add noisy per-request logging
  to routes; keep logging in the background/lifecycle paths.
- Avoid dumping full log-row payloads (they can be large and contain user content).
