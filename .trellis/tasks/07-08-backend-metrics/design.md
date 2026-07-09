# C2 — Design (API contract + migration)

> Depends on C1. Parent `design.md` covers the overall architecture; this narrows to the
> **metric model, the `usage_stats` migration, and the API/`types.ts` contract** C3 consumes.

## 1. Normalized metric struct (from `logs.other`)

`tokenMetrics.metricsFromLog(log)` returns a flat struct (extend the current one). All
extractors are **tolerant multi-key** (see existing `parseCacheHitTokens`) and default 0/null:

```
{ promptTokens, completionTokens, cacheHitTokens,        // (existing)
  cacheCreationTokens,                                    // cache_creation_tokens (+_5m/_1h summed)
  imageTokens, audioInputTokens, audioOutputTokens,
  toolCalls, toolQuota,                                   // web/file-search + image-gen counts & price→quota
  reasoning: boolean,                                     // reasoning_effort present
  frtMs, useTimeSec,                                      // latency: other.frt (ms), use_time (sec)
  billingSource,                                          // 'wallet' | 'subscription'
  ratios: { model, completion, group, cache, userGroup, modelPrice } }
```

## 2. SQLite schema evolution

Additive columns on **`stats`** and **`usage_stats`** (ALTER-guard pattern in `db.js`):
`cache_creation_tokens, image_tokens, audio_tokens, reasoning_requests, tool_calls,
tool_quota, success_count, first_token_ms_sum, first_token_count, use_time_sum_sec`
(all `INTEGER DEFAULT 0`). Averages are derived at query time
(`first_token_ms_sum/first_token_count` = avg TTFT, `tps = tokens / use_time_sum_sec`,
`success_rate = success_count / request_count`).

> **Revised vs original draft:** `latency_ms_sum` was dropped. `other.frt` is a
> first-response / TTFT signal, not whole-request latency, so it feeds
> `first_token_ms_sum` only; whole-request latency is recoverable from
> `use_time_sum_sec` (seconds). The pre-existing `avg_latency` column is left
> untouched (do not rely on it). `audio_tokens` stores the **sum** of audio input
> + output tokens (the per-log struct keeps `audioInputTokens`/`audioOutputTokens`
> separate for the logs detail view). `cache_creation_tokens` is extracted by
> preferring new-api's normalized `cache_write_tokens` field, else
> `max(cache_creation_tokens, _5m + _1h)` - the 5m/1h variants are a **split** of
> the total, not additive (see `research/other-samples.md`).

**Per-user dimension — derived, NO migration (revised).** `usage_stats` already keys on
`token_id`, and every token belongs to exactly one user, so per-user breakdown is derived
at query time: aggregate `usage_stats` by `token_id`, map `token_id → {user_id, username}`
via a Prisma lookup on `tokens` (same pattern as the existing name enrichment), then
re-group by `user_id` in JS. This keeps **all of C2 additive** (no `usage_stats` PK change,
no table rebuild). Deleted tokens retain their mapping (historical enrichment retains names, per C1).

## 3. Cost / currency

`QUOTA_PER_UNIT = parseInt(env.QUOTA_PER_UNIT) || 500000` → `cost_usd = quota / QUOTA_PER_UNIT`.
Currency/token display is a **presentation choice** returned as raw `quota` + `cost_usd`;
the UI (C3) applies USD/CNY/token mode. Do not store cost redundantly.

## 4. API contract (shapes C3 depends on)

Keep existing routes; add fields/dims. Representative shapes (JSON):

```
GET /api/summary?start_ts&end_ts
→ { requests, tokens, quota, cost_usd, cache_hit_ratio, success_rate,
    rpm, tpm, prompt_tokens, completion_tokens, cache_hit_tokens }

GET /api/usage/breakdown?dimension=user|model|channel|token|group&metric=cost|tokens|requests|...&start_ts&end_ts
→ { dimension, rows: [{ key, label, requests, tokens, quota, cost_usd,
      cache_hit_ratio, image_tokens, audio_tokens, success_rate,
      avg_latency_ms, avg_ttft_ms, tps }], totals: {...} }

GET /api/usage/timeseries?dimension&metric&interval=hour|day&start_ts&end_ts
→ { buckets: [ts...], series: [{ key, label, values: [...] }], totals: {...} }

GET /api/logs?...&upstream_request_id=
→ { total, logs: [{ id, created_at, type, username, token_name, model_name,
      channel_id, quota, cost_usd, prompt_tokens, completion_tokens,
      cache_read_tokens, cache_write_tokens, image_tokens, audio_tokens,
      frt_ms, tps, use_time_sec, ratios:{...}, billing_source,
      request_id, upstream_request_id, is_stream }] }

GET /api/models/analysis        → per-model + success_rate, avg_latency_ms, avg_ttft_ms, tps, cache_hit_ratio
GET /api/channels/overview      → per-channel + error_rate, avg_latency_ms, used_quota, cost_usd, status, response_time, auto_ban
```

### 4.1 Implementation notes (C2b, API layer)

The §4 shapes are the target contract for C3. The implementation keeps each
route file's **existing response envelope** (non-breaking) and adds fields;
these deliberate deviations from the literal §4 sketch are reflected in
`web/src/api/types.ts`:

- **`/api/usage/breakdown`** keeps its **bare-array** envelope (`UsageRow[]`),
  not `{ dimension, rows, totals }`. Totals are served by `/api/usage/summary`.
  Each row gains `cost_usd`, `cache_creation_tokens`, `image_tokens`,
  `audio_tokens`, `cache_hit_ratio`, `success_rate`, `avg_latency_ms`,
  `avg_ttft_ms`, `tps`.
- **`/api/usage/timeseries`** keeps the existing `{ split, series }` envelope
  (`split`, not `dimension`) and the `interval=hour` granularity. `user` is a
  **breakdown-only** dimension (per-hour per-user regroup is out of scope); the
  `split` whitelist stays `none|group|channel|model|token`.
- **Derived-metric ranking**: `metric` accepts the new ratio/average metrics
  (`cache_hit_ratio`, `success_rate`, `avg_latency_ms`, `avg_ttft_ms`, `tps`).
  For these the breakdown fetches all grouped rows and ranks in JS (a ratio of
  sums can't be `ORDER BY`-ed in SQL); sum metrics keep SQL `ORDER BY ... LIMIT`.
- **`success_rate`** = `1 - errors/requests` (PRD R2.4), which equals
  `success_count/request_count` post-backfill but stays correct pre-backfill.
  Returns `0` when there are no requests (consistent with the other derived
  metrics, all `0` when there is no data). Ratios are `0..1` fractions.
- **`/api/models/analysis`**: dropped `modelRatio`/`completionRatio` (read off
  the `Model` table which has no such columns, always `undefined`) and the dead
  `prisma.model.findMany` lookup. Ratios are per-log (`logs.other`) and are
  exposed via `/api/logs`, not aggregated per model. Added `cost_usd`,
  `error_rate`, and the extended-metric block to each model + `cache_hit_ratio`/
  `success_rate`/`total_cost_usd` to the summary.
- **`/api/channels/overview`** now takes a time range (defaults last 24h) to
  derive `error_rate`/`avg_latency_ms` from `stats`; channel objects are enriched
  additively (`id,name,type,status` preserved) and the response gains `timeRange`.
  `response_time` is the channel's own test latency (ms); `avg_latency_ms` is the
  request latency from `use_time` (sec->ms) - two distinct signals.
- **`/api/summary`** adds `cost_usd`, `cache_hit_ratio`, `success_rate`,
  `avg_latency_ms`, `avg_ttft_ms`, `tps`, and live trailing-60s `rpm`/`tpm`
  (Prisma aggregate over `logs`, isolated so a Prisma hiccup can't fail the
  summary). Existing `total_*` fields are kept.
- **`/api/logs`** keeps the existing `{ data, total, page, pageSize, stats }`
  envelope and camelCase fields; adds snake_case `other`-derived fields
  (`cache_read_tokens`, `cache_write_tokens`, `image_tokens`, `audio_tokens`,
  `frt_ms`, `use_time_sec`, `tps`, `ratios`, `billing_source`,
  `upstream_request_id`, `is_stream`, `cost_usd`) via `metricsFromLog`, plus the
  `upstream_request_id` query filter.

## 5. `types.ts`

Hand-authored, mirrors §4. One interface per response + shared sub-types (`UsageRow`,
`LogRow`, `Summary`, `TimeSeries`). Lives where C3 imports it (new app `src/api/types.ts`).
It is the **single source of truth for the FE↔BE shape**; update it whenever an endpoint changes.

## 6. Trade-offs

- Derive averages at query time (store sums) → flexible ranges, no precomputed-average staleness.
- Per-user is **derived from `token_id`** (no migration) → all schema changes are additive/reversible.
- Tolerant `other` parsing tolerates provider variance but needs sample-based tests (R2 acceptance).
