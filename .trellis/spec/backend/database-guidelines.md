# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

Two databases, two access styles:

1. **new-api DB via Prisma (read-only)** — provider is **MySQL** by default in the
   checked-in schema; `docker-entrypoint.sh` swaps it to PostgreSQL at startup based
   on `DATABASE_URL`. Source tables: `logs`, `channels`, `tokens`, `models`,
   `vendors`, `users`.
2. **Local monitor DB via `sqlite3` (read + write)** — aggregate/history tables
   (`stats`, `usage_stats`, `alerts`, `alert_history`, `channel_snapshots`, `meta`).

> The SQLite library is **`sqlite3`** (node-sqlite3, callback-based) — **not**
> better-sqlite3 or `node:sqlite`. See `server/package.json` and `server/db.js:1-10`.

---

## Query Patterns

### SQLite — raw SQL with `?` placeholders, via the `db.js` promise helpers

`db.js` wraps `sqlite3`'s callbacks in `getAsync` / `allAsync` / `runAsync`.
**Always use these; never interpolate values into SQL.**

```js
// server/routes/tokens.js:27-33
const usageRows = await db.allAsync(
    `SELECT token_id, SUM(request_count) as requests, SUM(tokens) as tokens
     FROM usage_stats
     WHERE hour >= ? AND hour <= ?
     GROUP BY token_id`,
    [timeRange.startTs, timeRange.endTs]
);
```

**Bulk writes** use `db.prepare()` + a reused statement + `finalize()`, wrapped in
`db.serialize()` / `BEGIN TRANSACTION` … `COMMIT`, with the **UPSERT** idiom
`ON CONFLICT(...) DO UPDATE SET col = col + excluded.col`:

```js
// server/syncer.js:70-83
const statsStmt = db.prepare(`
    INSERT INTO stats (channel_id, model_name, hour, prompt_tokens, ...)
    VALUES (?, ?, ?, ?, ...)
    ON CONFLICT(channel_id, model_name, hour)
    DO UPDATE SET prompt_tokens = prompt_tokens + excluded.prompt_tokens, ...
`);
```

**Column names cannot be parameterized** — dynamic `GROUP BY` / `ORDER BY` columns
must go through a whitelist map, never raw request input:

```js
// server/routes/usage.js:10-22
const DIMENSION_COLUMNS = { group: 'user_group', channel: 'channel_id', model: 'model_name', token: 'token_id' };
const METRIC_COLUMNS   = { cost: 'quota', quota: 'quota', tokens: 'tokens', requests: 'request_count' };
```

### Prisma — `select`/`where`/`orderBy` always explicit; batch with `$transaction`

```js
// server/routes/logs.js:83-101
const [total, logs, stats] = await prisma.$transaction([
    prisma.log.count({ where }),
    prisma.log.findMany({ where, skip: pagination.skip, take: pagination.take,
        orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, /* ... */ } }),
    prisma.log.aggregate({ where, _sum: { promptTokens: true, completionTokens: true, quota: true } }),
]);
```

**`created_at` is a `BigInt` column** (`schema.prisma:15`). Convert at every boundary:
`.toString()` for JSON output, `Number(...)` for arithmetic, `BigInt(...)` for filters.

---

## Migrations

There is **no migration tool for SQLite**. The monitor schema is hand-rolled in
`db.js` `initDB()` and run once at module load:

- Tables via `CREATE TABLE IF NOT EXISTS` inside `db.serialize()`; indexes via
  `CREATE INDEX IF NOT EXISTS`.
- Schema evolution is manual: `PRAGMA table_info(<table>)` then a conditional
  `ALTER TABLE ADD COLUMN`.
  ```js
  // server/db.js:150-158
  db.all("PRAGMA table_info(stats)", (err, columns) => {
      const names = columns.map(c => c.name);
      if (!names.includes('quota')) db.run("ALTER TABLE stats ADD COLUMN quota INTEGER DEFAULT 0");
  });
  ```

When adding a monitor column, follow this pattern: add it to the `CREATE TABLE`
**and** add an idempotent `ALTER TABLE` guard so existing DBs upgrade in place.

Prisma migrations are **not** used here — the new-api DB is owned externally and
treated as read-only; only `npx prisma generate` runs (see `docker-entrypoint.sh`).

---

## Naming Conventions

- **SQLite**: `snake_case` tables and columns (`usage_stats`, `channel_id`,
  `prompt_tokens`, `cache_hit_tokens`). Composite keys, e.g.
  `PRIMARY KEY (channel_id, model_name, hour)` (`server/db.js:21-34`).
- **Prisma**: `PascalCase` models, `camelCase` fields, mapped to the snake_case DB
  via `@map` / `@@map` (plural table names):
  ```prisma
  // server/prisma/schema.prisma:12-24
  model Log {
    createdAt    BigInt @map("created_at")
    promptTokens Int    @map("prompt_tokens")
    channelId    Int    @map("channel_id")
    @@map("logs")
  }
  ```

---

## Common Mistakes

- Importing `PrismaClient` directly instead of `{ prisma }` from `../syncer`
  (creates a second connection pool).
- String-interpolating values into SQL — always use `?` params; for dynamic
  **columns** use a whitelist map.
- Forgetting `BigInt` conversion on `created_at`, causing a `TypeError` on math or
  non-serializable JSON.
- Adding a monitor column to `CREATE TABLE` without the matching `ALTER TABLE`
  guard, so already-deployed SQLite files never get the column.
