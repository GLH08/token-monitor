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
tool_quota, success_count, latency_ms_sum, first_token_ms_sum, first_token_count,
use_time_sum_sec`. Averages are derived at query time (`latency_ms_sum/request_count`,
`first_token_ms_sum/first_token_count`, `tps = tokens / use_time_sum_sec`).

**`usage_stats` `user_id` migration (the one non-additive change):**
- New PK `(hour, user_group, channel_id, model_name, token_id, user_id)`.
- Strategy: create `usage_stats_v2` with the new PK+columns, backfill from `logs` (re-aggregate),
  then swap. Guard with `meta` flag `usage_stats_userid_migrated_v1`; resumable per
  `SYNC_MAX_BATCHES_PER_RUN`. Existing `/rebuild-stats` (`routes/admin.js`) is the manual trigger.
- Enrichment adds `username` from `users` (filtering `deleted_at IS NULL`, per C1).

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

## 5. `types.ts`

Hand-authored, mirrors §4. One interface per response + shared sub-types (`UsageRow`,
`LogRow`, `Summary`, `TimeSeries`). Lives where C3 imports it (new app `src/api/types.ts`).
It is the **single source of truth for the FE↔BE shape**; update it whenever an endpoint changes.

## 6. Trade-offs

- Derive averages at query time (store sums) → flexible ranges, no precomputed-average staleness.
- `user_id` migration cost is paid once (rebuild+backfill); everything else is additive.
- Tolerant `other` parsing tolerates provider variance but needs sample-based tests (R2 acceptance).
