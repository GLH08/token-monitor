# Design — Token-Monitor 全栈重构 v2 (Parent)

> Technical design for the parent. Establishes architecture, cross-child contracts,
> the target IA/metric set (resolves OQ2 on review), and migration/compat notes.
> Fine-grained implementation detail lives in each child's `implement.md`.

## 1. Architecture & boundaries (unchanged deployment)

```
 new-api PostgreSQL (read-only)                 token-monitor (this repo)
 ┌───────────────────────────┐   Prisma read   ┌──────────────────────────────┐
 │ logs (+ other JSON)        │◀───────────────│ syncer.js  (batch + parse)    │
 │ channels/tokens/models/…   │   enrich        │   ▼ aggregate hourly          │
 └───────────────────────────┘◀───────────────│ SQLite monitor.db (stats,     │
                                                │   usage_stats, +new metrics)  │
                                                │   ▲ query                     │
                                                │ routes/*  →  /api/*  (JSON)   │
                                                └───────────────┬──────────────┘
                                                   static assets │ /api
                                                ┌───────────────▼──────────────┐
                                                │ web/ (Vite+TS build) → Express│
                                                │ served public/  (single port)│
                                                └──────────────────────────────┘
```

- **No change** to: single-port Docker, Express static serving of `web/dist`,
  Prisma-as-reader, `sqlite3` monitor store, auth flow, the scheduled-job model.
- **Changes** are additive: extend the sync/parse, add SQLite metric columns, add/adjust
  `/api` endpoints, and replace `web/` with a TypeScript app.

## 2. Data-access & sync strategy

**Single source of truth = `logs`.** Keep `syncer.js`'s incremental batch read
(`last_synced_id` in `meta`) and hourly UPSERT aggregation. Extend it to:

1. **Parse `logs.other` once per row** into a normalized metric struct (build on the
   existing `tokenMetrics.parseCacheHitTokens`, which already handles many cache-key
   variants — `server/tokenMetrics.js:6-45`). Add extraction for: `cache_creation_tokens`
   (+`_5m`/`_1h`), `image_output`, `audio_input`/`audio_output`, tool call counts/prices
   (`web_search`/`file_search`/`image_generation`), the ratio/price set (`model_ratio`,
   `completion_ratio`, `group_ratio`, `cache_ratio`, `user_group_ratio`, `model_price`),
   `frt` (ms), `reasoning_effort`, `billing_source`.
2. **Fix latency semantics**: `use_time` is **seconds** — treat as such; derive
   response-latency (ms) primarily from `other.frt`, fall back to `use_time*1000`.
   Replace the current `avg_latency` (seconds-derived) accordingly.
3. **Success/error**: count `type=5` (error) rows per bucket → `error_count` (exists);
   add `success_count` (or derive success = requests − errors) for success-rate.
4. **Soft-delete & new types**: enrichment joins must filter `deleted_at IS NULL`
   (vendors/models/tokens/users); handle `type` `0/7`.

**Rollups (`quota_data`/`perf_metrics`) are optional.** We do NOT depend on them
(they may be disabled, and lack sub-type detail). If present later, they can validate/
seed backfill — tracked as OQ3, not in the critical path.

**Backfill**: the repo already has a `meta`-flag backfill pattern
(`USAGE_STATS_CACHE_HIT_BACKFILL_KEY`, `server/syncer.js:12,489`). Reuse it: on upgrade,
re-parse historical `logs.other` to populate the new metric columns (bounded, resumable).

## 3. Backend data model (SQLite evolution)

Additive columns on `stats` and `usage_stats` (via the established `PRAGMA table_info`
+ `ALTER TABLE ADD COLUMN` guards in `server/db.js`). Proposed new columns (per hourly bucket):

| Column | Meaning |
|--------|---------|
| `cache_creation_tokens` | Anthropic cache-write tokens (sum of 5m/1h) |
| `image_tokens`, `audio_tokens` | multimodal token counts |
| `reasoning_requests` | count of rows with `reasoning_effort` set |
| `tool_calls`, `tool_quota` | web/file-search + image-gen call count and their surcharge quota |
| `success_count` | requests with no error (for success-rate) |
| `latency_ms_sum` | Σ response-ms (from `frt`), for avg latency in ms |
| `first_token_ms_sum`, `first_token_count` | Σ TTFT + denominator (streaming) |
| `use_time_sum_sec` | Σ whole-request seconds (throughput/TPS) |

Notes:
- **Cost is derived, not stored redundantly**: `cost = quota / QUOTA_PER_UNIT`
  (`QUOTA_PER_UNIT=500000=$1`); currency/token display handled at the API/UI layer.
- **New dimension `user_id`**: `usage_stats` currently keys on `user_group` but has no
  `user_id`. Add `user_id` (and carry `username` via enrichment) to enable per-user
  breakdown. This changes the `usage_stats` PRIMARY KEY → requires a table rebuild/backfill
  (documented in C2 implement.md; the rebuild-stats admin path already exists —
  `routes/admin.js` `/rebuild-stats`).
- `node_name` (multi-instance) is **out of scope v2** (single-node deployment) — revisit if needed.

## 4. API surface (contracts)

Extend existing endpoints rather than inventing a parallel API. Principles: keep the
`request.js` validation helpers; keep response shapes consistent per file; add metric
fields to existing payloads; add dimensions to `usage` breakdown/timeseries.

- **`/api/usage/*`** (already multi-dim): add `user` to the dimension whitelist
  (`DIMENSION_COLUMNS`, `usage.js:10`); add metrics (`cost`, `cache_hit_ratio`,
  `image_tokens`, `audio_tokens`, `success_rate`, `avg_latency_ms`, `avg_ttft_ms`, `tps`)
  to `METRIC_COLUMNS` / summary. This becomes the backbone of the "Usage Analytics" page.
- **`/api/summary`, `/api/dashboard/*`**: add the headline metrics (cost$, cache-hit
  ratio, RPM/TPM live, success rate) for the Overview KPI strip.
- **`/api/models/analysis` + `/api/analysis/latency`**: add success rate, TTFT, TPS,
  cache-hit ratio per model; fix latency to ms.
- **`/api/channels/*`**: add error-rate, avg latency (ms), used_quota→cost, health
  (status/response_time/auto-ban) — `channels` already read from Prisma.
- **`/api/logs`**: add `other`-derived fields to each row (cache read/write, image/audio,
  frt, tokens/s, ratios, billing_source, upstream_request_id) for the rich logs table +
  details dialog; add `upstream_request_id` filter.
- **Live RPM/TPM**: keep the realtime refresh loop; expose trailing-60s RPM/TPM like new-api.

Exact request/response schemas are specified in **C2 implement.md** and mirrored as
TypeScript types consumed by the frontend (shared shape, hand-authored `types.ts`).

## 5. Frontend architecture

**Stack**: Vite + **TypeScript** + Tailwind + **shadcn/ui** + **TanStack Query**
(server state/polling) + **TanStack Table** (logs) + **ECharts** (`echarts-for-react`)
+ lightweight **Zustand** for global UI state (time-range, currency/token mode, mask,
theme). Routing stays **react-router v6** (search-params as state). i18n: zh default,
en optional (OQ2). Build output → `web/dist` → copied to backend `public/` (unchanged).

**Information architecture** (sidebar + top bar, dark-first):

| Page | Content (metrics) |
|------|-------------------|
| **Overview** | KPI strip (Cost$, Tokens, Requests, RPM/TPM, Success%, Cache-hit%); cost/token trend (ECharts area, stacked-by-model, top-N + "Other"); Top models & channels; recent errors/alerts |
| **Usage Analytics** | Multi-dim breakdown by model/channel/token(key)/group/user; trend + distribution(pie) + ranking(bar); currency↔token toggle; filters as URL state |
| **Models** | Per-model cost, tokens, requests, success%, avg latency + TTFT + TPS, cache-hit% |
| **Channels** | Health (status/response_time/auto-ban), error-rate, latency, usage/cost per channel |
| **Performance** | Latency (avg + TTFT), TPS, success-rate over time (from logs-derived metrics) |
| **Logs** | TanStack table: dense cells (cache↓/↑, FRT, tokens/s), URL-state filters, draft-then-apply, details dialog with **Token Breakdown + Billing Breakdown** |
| **Alerts** | Existing alert rules/history, restyled |

**Shared building blocks** (borrowed from new-api `web/default`, re-implemented):
`StatCard` (value + sparkline + loading/error), divided KPI strip, ECharts trend/pie/bar
with top-N capping + Total-row tooltip, `DataTable` wrapper (desktop table + mobile
cards), centralized formatters (`formatQuota`/currency/tokens/latency), sensitive-data
mask toggle. Design tokens: OKLCH semantic palette + dark default.

## 6. Compatibility, migration, rollback

- **PostgreSQL correctness (C1)**: validate the Prisma schema's native types against PG
  (`@db.Text`/`@db.VarChar`/`@db.Char` are PG-valid; verify no MySQL-only types slip in),
  and that `BigInt`/`Boolean`/`other`(text) read correctly. `docker-entrypoint.sh` already
  switches provider by `DATABASE_URL`.
- **SQLite migrations**: additive `ALTER TABLE ADD COLUMN` guards only (no destructive
  change) except the `usage_stats` PK change for `user_id`, which is done via
  table-rebuild + backfill behind a `meta` flag.
- **Backfill**: reuse the resumable `meta`-flag pattern to repopulate new metric columns
  from historical `logs.other`; bounded per run (respect `SYNC_MAX_BATCHES_PER_RUN`).
- **Rollback**: v2 backend is additive → old columns/endpoints remain; frontend is a
  full replace, so keep the old `web/` reachable via git until C3 is verified. New SQLite
  columns default 0/NULL so a downgrade keeps working.

## 7. Child breakdown, contracts & ordering

- **C1 `data-layer`** (R1) — Prisma schema ↔ rc.20 realignment + PG validation + `use_time`
  seconds + soft-delete + `type 0/7` + `upstream_request_id`/`vendors`. Deliverable:
  correct read layer + a documented schema diff. **Contract out**: accurate field
  semantics the syncer relies on. Independently shippable (fixes current bugs).
- **C2 `backend-metrics`** (R2) — extend `tokenMetrics`/`syncer` `other`-parsing, SQLite
  metric columns + `user_id` dim + backfill, and the `/api` additions in §4. **Contract
  in**: C1 semantics. **Contract out**: the JSON API + `types.ts` the frontend consumes.
  Depends on C1.
- **C3 `frontend-rebuild`** (R3) — the TS app in §5 against C2's API. **Contract in**:
  C2 endpoints/types. Depends on C2.

Parent owns final **integration review** (R4: non-regression of auth/alerts/deploy).

## 8. Key trade-offs & risks

- **Extend vs rewrite backend**: extend (chosen) — backend already has a solid multi-dim
  aggregation + backfill foundation; rewriting risks regressions for little gain.
- **Derive latency/success from `logs` vs ingest `perf_metrics`**: derive (chosen) —
  one data source, no dependency on optional rollups; slightly more compute at sync time.
- **`usage_stats` PK change (add `user_id`)**: enables per-user cost but forces a
  table rebuild/backfill — the one non-additive migration; gated + resumable.
- **`other` JSON variance**: keys differ by provider/path (Anthropic vs OpenAI vs audio/ws).
  Mitigation: tolerant multi-key extraction (as `parseCacheHitTokens` already does) + unit
  tests over real `other` samples (node:test, per backend spec).
- **ECharts bundle size**: import per-chart modules (tree-shaken) to keep `web/dist` lean.
