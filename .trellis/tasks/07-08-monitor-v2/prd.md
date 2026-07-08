# PRD — Token-Monitor 全栈重构 v2 (Parent)

> Parent task. Owns the source requirements, child-task map, and cross-child
> acceptance. Implementation happens in the child tasks (see Task Map).

## Goal & user value

Rebuild token-monitor to align with **new-api v1.0.0-rc.20** and deliver a modern,
information-rich monitoring dashboard. Today's pain: stats are partly **incorrect**
(schema drift) and **shallow** (only prompt/completion tokens + quota), and the UI is
dated. After v2:

- **Correct data** — Prisma schema and derived stats match rc.20 reality.
- **Rich metrics** — cost in currency, cache-hit ratio & cache spend, reasoning /
  multimodal (image·audio) tokens, tool-call surcharges, latency / TTFT / TPS /
  success-rate, and per-user / per-key / per-group / per-node breakdowns.
- **Modern UX** — Vite + TypeScript + Tailwind/shadcn-ui + TanStack Query/Table +
  ECharts, dark-first, consistent with new-api's current design language.

## Confirmed decisions

- **Scope**: full-stack — data layer + backend sync/API + frontend.
- **Stack**: Vite + **TypeScript** + Tailwind/shadcn-ui + TanStack Query/Table +
  **ECharts**. **Deployment unchanged**: frontend still builds to static assets
  served by Express on a single port (root `Dockerfile` / `docker-compose.yml`).
- **Reference source**: new-api v1.0.0-rc.20 at `D:\Files\Code\new-api`
  (`github.com/QuantumNous/new-api`, Go). token-monitor stays **read-only** on the
  new-api DB.
- **Data source**: single source of truth = the **`logs`** table (extend the current
  self-aggregation in `syncer.js` + parse `logs.other`). `quota_data`/`perf_metrics`
  rollups are treated as **optional / graceful-fallback**, never a hard dependency
  (they may be disabled, and lack the sub-type/ratio detail we need anyway).
- **UX defaults** (confirmed): **Chinese-only UI** (no i18n/bilingual), **dark-first**
  theme; expose the **full metric set** (no metric dropped).

## Confirmed facts (from code analysis)

### F1. Schema drift — `server/prisma/schema.prisma` vs new-api `model/*.go`
- **`logs.use_time` is SECONDS** (total request time), not ms. Real response latency
  (ms) is `other.frt`. (`model/log.go:71`, `service/log_info_generate.go:81`) →
  current schema comment + any latency stat treating it as ms is **wrong**.
- **Soft-delete**: `vendors/models/tokens/users` have `deleted_at`; name/status
  enrichment must filter `deleted_at IS NULL`. (`model/vendor_meta.go`, `token.go`, `user.go`)
- **`logs.type`** adds `7=login`, `0=unknown`. (`model/log.go:84-93`)
- **`logs.upstream_request_id`** NEW `varchar(128)`, indexed. (`model/log.go:79`)
- **`vendors`** NEW columns `status/created_time/updated_time/deleted_at`. (`model/vendor_meta.go:15-24`)
- `logs.channel_name` is transient (`gorm:"->"`), never persisted with data.
- **`QuotaPerUnit = 500000 = $1`** — matches token-monitor's current default. (`common/constants.go:62`)

### F2. Rich metrics live in `logs.other` JSON (NOT columns)
Only `prompt_tokens`/`completion_tokens` are real token columns. `other` holds
(builders `service/log_info_generate.go`, `service/text_quota.go:402-476`):
- **Cache**: `cache_tokens`, `cache_creation_tokens` (+ `_5m`/`_1h`) & ratios, `cache_write_tokens`.
- **Multimodal**: `image`/`image_ratio`/`image_output`; `audio_input`/`audio_output`/`text_input`/`text_output` & ratios.
- **Tools**: `web_search`/`file_search`/`image_generation_call` counts & prices.
- **Ratios/price** (per-log, auditable): `model_ratio`, `completion_ratio`, `group_ratio`, `cache_ratio`, `user_group_ratio`, `model_price`.
- **Perf**: `frt` (first-response ms), `reasoning_effort`.
- **Billing source**: `billing_source` (wallet/subscription) + `subscription_*`.

### F3. new-api rollup tables (optional; may be disabled)
- **`quota_data`** (hourly): dims `user/username/model/channel/token_id/use_group/node_name`;
  measures `token_used`(prompt+comp), `count`, `quota`. (`model/usedata.go:13-26`) —
  ~duplicate of what token-monitor already builds; only populated when `DataExportEnabled`.
- **`perf_metrics`** (model×group×hour): `request/success count`, `total_latency_ms`,
  `ttft_sum/count`, `output_tokens`, `generation_ms` → success rate, avg latency,
  TTFT, TPS. (`model/perf_metric.go:11-27`)
- **Note**: rich sub-type/ratio metrics (F2) are NOT in these rollups — they require
  parsing `logs.other`. Latency/success can also be derived from `logs` alone
  (`use_time`, `other.frt`, `type=5` errors), so the rollups are a convenience, not a hard dependency.

### F5. Deployment (confirmed from the user's server config)
- **PostgreSQL 15**, single database `new-api` (`SQL_DSN=postgresql://…@postgres:5432/new-api`;
  MySQL commented out). **No `LOG_SQL_DSN`/ClickHouse** → `logs` is in the same PG DB,
  Prisma-reachable (current tool already reads it). Image `calciumion/new-api:latest` (rc.20). Redis present (not needed for reads).
- **Implication**: the checked-in Prisma schema is MySQL-annotated (`@db.Text/@db.VarChar/@db.Char`);
  C1 must validate/adjust native types + queries against **PostgreSQL** (docker-entrypoint
  switches provider, but native-type attributes and any raw SQL/BigInt/boolean/JSON `other`
  handling must be PG-correct).

### F4. Baseline (current token-monitor)
- Backend: Express 5 + Prisma (read new-api) + `sqlite3`; `syncer.js` self-aggregates
  `logs` hourly by channel+model into SQLite `stats`/`usage_stats`.
- Frontend: Vite + React 19 (**plain JS**) + Tailwind 3 + recharts + react-router.
  Pages: Dashboard, Channels, Models, ModelStatus, Alerts, Errors, Performance,
  Tokens, CostTokenAnalysis, Logs.

## Requirements (parent-level; detailed per child)

- **R1 — Data layer correct & current**: Prisma schema matches rc.20; `use_time`
  treated as seconds; soft-delete filtering; `type` 0/7 handled; `upstream_request_id`
  and `vendors` columns added. Existing latency/response stats corrected.
- **R2 — Backend metric expansion**: parse `logs.other`; extend SQLite schema + sync
  to persist cache/multimodal/tool/ratio metrics; compute cost($), cache-hit ratio,
  success rate, latency/TTFT/TPS; add dimensions (user/key/group/node); new/updated
  `/api` endpoints for the rebuilt frontend.
- **R3 — Frontend rebuild**: Vite+TS+shadcn+TanStack+ECharts; new IA (sidebar+topbar,
  dark-first, global time-range + currency/token toggle + sensitive-data mask); pages
  Overview / Usage Analytics / Models / Channels / Performance / Logs / Alerts; render
  the new metrics; logs details dialog with token + billing breakdown.
- **R4 — Non-regression & deployment**: single-port static serving + Docker unchanged;
  auth flow preserved; alerts feature preserved (may be restyled).

## Cross-child acceptance criteria (draft — to finalize in convergence pass)

- [ ] Prisma schema has no drift vs rc.20 for tables token-monitor reads; a documented
      diff exists. Latency shown to users is correct (seconds vs ms not conflated).
- [ ] Backend persists & exposes: cost in currency, cache-hit ratio, image/audio/reasoning
      token counts, tool-call surcharges, success/error rate, avg latency + TTFT + TPS,
      and breakdowns by model/channel/token/group/user(/node when present).
- [ ] Rebuilt frontend (TS) renders all of the above; `npm run build` + `lint` pass;
      served correctly as static assets by Express in the Docker image.
- [ ] Auth and alerting behave as before. No data written to the new-api DB.

## Task map (children — to be created)

- **C1 `data-layer`** — Prisma schema realignment + correctness fixes (R1). Independently
  shippable as a bugfix. Verifiable via schema diff + corrected queries/tests.
- **C2 `backend-metrics`** — sync/`other`-parsing + SQLite schema + APIs (R2). Depends on C1.
- **C3 `frontend-rebuild`** — Vite+TS+shadcn+TanStack+ECharts UI (R3). Depends on C2 APIs.

Ordering (C1 → C2 → C3) is a data/contract dependency, documented in each child's PRD.
Parent owns integration review (R4) once children land.

## Out of scope

- Modifying new-api itself; any write to the new-api DB.
- Non-monitoring product features (chat/playground/user-billing management).
- Backend framework change (stays Express + sqlite3); only sync/schema/APIs evolve.

## Open questions

- OQ3 (verify in C2, non-blocking) — whether `quota_data`/`perf_metrics` are populated
  in this deployment. Design assumes NOT and self-derives from `logs`; if present they
  become an optional optimization.
