# C1 — 数据层对齐 rc.20 (PostgreSQL)

> Child of `07-08-monitor-v2`. See parent `prd.md` (F1, F5) and `design.md` (§6, §7)
> for shared context. This child owns the **read layer correctness** only; the latency/
> success **metric rework** belongs to C2 (to avoid overlap).

## Goal & user value

token-monitor's Prisma schema is a hand-copied snapshot of new-api's tables and has
drifted from **v1.0.0-rc.20**, and the deployment is **PostgreSQL** while the checked-in
schema is MySQL-annotated. This child makes the read layer **correct and PG-valid** so
every downstream stat is computed on accurate fields. Independently shippable as a bugfix.

## Requirements

- **R1.1** Realign `server/prisma/schema.prisma` to rc.20 for the tables token-monitor
  reads (`logs`, `channels`, `tokens`, `models`, `vendors`, `users`):
  - add `logs.upstream_request_id` (`varchar(128)`, indexed) — `model/log.go:79`.
  - `vendors`: add `status`, `created_time`, `updated_time`, `deleted_at` — `model/vendor_meta.go:15-24`.
  - add `users.deleted_at` and `vendors.deleted_at` (soft-delete) if absent.
  - document `logs.use_time` as **seconds** in the schema comment (was "ms") — `model/log.go:71`.
  - confirm `logs.type` comment covers `0=unknown, 7=login` — `model/log.go:84-93`.
- **R1.2** Validate/adjust for **PostgreSQL**: `npx prisma validate` + `generate` succeed
  with `provider=postgresql`; native-type attributes (`@db.Text/@db.VarChar/@db.Char`) and
  `BigInt`/`Boolean`/`other`(text) read correctly. Verify `docker-entrypoint.sh` provider switch.
- **R1.3** Soft-delete filtering follows a **current-vs-historical** rule:
  - **Current-state views** (entity lists, status/overview endpoints, quota alerts)
    filter `deleted_at IS NULL` so deleted entities don't leak into live names/status/counts.
    Today: `routes/tokens.js` `/overview` and `alerter.js` `checkQuotaLow` (token reads).
  - **Historical enrichment** (usage breakdown, per-model/per-token analysis, log rows)
    deliberately **retains names** for soft-deleted entities so past spend keeps a
    human-readable label. Today: `routes/usage.js` (breakdown + filter-options) and
    `routes/stats.js` `/models/analysis` do **not** filter `deleted_at` — adding it there
    would blank historically-active-but-deleted tokens/models to id/unknown (a regression).
  - No `vendors`/`users` reads exist yet; the schema adds are alignment for future reads.
- **R1.4** Log-type handling: existing filters/aggregations treat `type` correctly with
  the new `0/7` values (no misclassification of consume=2 / error=5).

## Out of scope

- Latency/TTFT/success-rate metric rework (→ C2), new metric columns (→ C2), any UI (→ C3).
- Writing to the new-api DB.

## Acceptance criteria

- [ ] `npx prisma validate` and `npx prisma generate` pass with a PostgreSQL `DATABASE_URL`.
- [ ] A written **schema diff** (rc.20 vs previous) exists under this task's `research/`.
- [ ] Schema includes `logs.upstream_request_id`, `vendors.{status,created_time,updated_time,deleted_at}`,
      `users.deleted_at`; `use_time` documented as seconds.
- [ ] Current-state reads (token overview, quota alert) exclude soft-deleted rows;
      historical enrichment retains names (verified by reading the changed queries).
- [ ] `node --test` passes (existing suites still green; no regression).
