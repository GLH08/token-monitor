# Directory Structure

> How backend code is organized in this project (`server/`).

---

## Overview

The backend is a **CommonJS Node.js + Express 5** app. It reads a new-api
**MySQL** database through Prisma (read-only) and writes aggregates to a local
**SQLite** database. The layout is **flat top-level modules + a `routes/`
folder**. There is **no `services/` layer** — shared logic lives in a handful of
top-level modules, and non-trivial business logic is often inline in route
handlers.

---

## Directory Layout

```
server/
├── index.js            # App bootstrap: Express setup, middleware, route mounting,
│                       #   WebSocket server, and all setInterval cron loops
├── db.js               # SQLite data-access layer: opens DB, creates schema,
│                       #   exposes promisified getAsync/allAsync/runAsync helpers
├── syncer.js           # Owns the PrismaClient instance (re-exported) + all
│                       #   sync/aggregation logic (syncLogs, updateAggregates, ...)
├── auth.js             # HMAC token create/verify + password check
├── request.js          # Request-validation helpers (parseTimeRange, parsePagination, ...)
├── tokenMetrics.js     # Pure token-math helpers (metricsFromLog, mapStatsTotals, ...)
├── alerter.js          # Alert evaluation + Telegram notification logic
├── modelStatus.js      # Model availability/status feature logic
├── routes/             # Thin HTTP handlers, one file per resource
│   ├── admin.js  alerts.js  auth.js  channels.js  logs.js
│   ├── modelStatus.js  stats.js  tokens.js  usage.js
├── prisma/schema.prisma
├── scripts/            # One-off ops scripts (rollup-model, sync-until-caught-up, ...)
├── test/               # node:test suites (*.test.js)
└── data/monitor.db     # Local SQLite file (created at runtime)
```

---

## Module Organization

Where things live:

- **HTTP wiring** → `index.js` (app + middleware + route mounting) and `routes/`.
- **SQLite data access** → `db.js` (all reads/writes go through its `*Async` helpers).
- **Prisma data access + sync logic** → `syncer.js`. **Import Prisma from `syncer`, not `@prisma/client`:**
  ```js
  // server/routes/tokens.js:4
  const { prisma } = require('../syncer');
  ```
- **Pure helpers** → `tokenMetrics.js`, `request.js`, `auth.js`.
- **Feature logic** → `alerter.js`, `modelStatus.js`, imported by their route counterparts.

Route handlers are meant to be thin, but in practice **substantial business
logic is inline in some routes** — e.g. `usage.js` defines `buildUsageWhere`,
`buildHourlyBuckets`, `mapTotals`, `enrichBreakdownRows` as module-local
functions (`server/routes/usage.js:24-220`). When adding a new endpoint, follow
the surrounding file's style rather than forcing a new service layer.

---

## Naming Conventions

- **Multi-word modules**: lowerCamelCase — `tokenMetrics.js`, `modelStatus.js`.
- **Route modules**: single lowercase word named after the resource — `tokens.js`, `channels.js`.
- Every route file opens with `const router = express.Router();` and ends with
  `module.exports = router;`. A few also attach helpers for tests:
  ```js
  // server/routes/logs.js:218-220
  module.exports = router;
  module.exports.extractRequestId = extractRequestId;
  module.exports.applyRequestIdFilter = applyRequestIdFilter;
  ```

---

## Examples

- Route mounting order (auth route before the auth middleware): `server/index.js:81-95`.
- Standard route skeleton: `server/routes/channels.js:1-4,36`.
- Shared SQLite helpers consumed everywhere: `server/db.js:181-188`.
