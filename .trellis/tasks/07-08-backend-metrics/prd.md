# C2 — 后端指标扩展与 API

> Child of `07-08-monitor-v2`. See parent `prd.md` (F2, F3) and `design.md` (§2–§4, §7).
> Depends on **C1** (accurate rc.20 read layer, PG). Owns the JSON API + `types.ts`
> that **C3 consumes** — treat those as a stable contract.

## Goal & user value

Turn the accurate read layer into rich, queryable metrics. Parse `logs.other`, persist
new metric columns + a per-user dimension, derive cost / cache-hit / latency(ms) / TTFT /
TPS / success-rate from `logs`, and expose them through the existing `/api` surface so the
rebuilt UI (C3) can render them.

## Requirements

- **R2.1 — `other` parsing**: extend `server/tokenMetrics.js` to extract from `logs.other`
  (tolerant multi-key, like the existing `parseCacheHitTokens`): `cache_creation_tokens`
  (+`_5m`/`_1h`), `image_output`, `audio_input`/`audio_output`, tool call counts+prices
  (`web_search`/`file_search`/`image_generation`), ratios/price (`model_ratio`,
  `completion_ratio`, `group_ratio`, `cache_ratio`, `user_group_ratio`, `model_price`),
  `frt`(ms), `reasoning_effort`, `billing_source`. (parent F2)
- **R2.2 — SQLite metric columns**: add columns to `stats` and `usage_stats` per parent
  design §3, via the established `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` guards in
  `server/db.js`.
- **R2.3 — `user_id` dimension**: add `user_id` to `usage_stats` (and carry `username` via
  enrichment). This changes the PK → **table rebuild + backfill** behind a resumable
  `meta` flag (reuse the `USAGE_STATS_*_BACKFILL` pattern; the `/rebuild-stats` admin path exists).
- **R2.4 — latency/success rework**: response latency in **ms** from `other.frt`
  (fallback `use_time*1000`); TTFT sums; `success_count`; success-rate = 1 − error/req.
  This supersedes the seconds-based `avg_latency`.
- **R2.5 — backfill**: repopulate new columns from historical `logs.other`, bounded per run
  (`SYNC_MAX_BATCHES_PER_RUN`), resumable via `meta`.
- **R2.6 — API extension** (parent §4): add dimensions (`user`) + metrics (`cost`,
  `cache_hit_ratio`, `image_tokens`, `audio_tokens`, `success_rate`, `avg_latency_ms`,
  `avg_ttft_ms`, `tps`) to `/api/usage/*`; add headline metrics to `/api/summary` +
  `/api/dashboard/*`; enrich `/api/models/*`, `/api/channels/*`; add `other`-derived
  fields + `upstream_request_id` filter to `/api/logs`; expose trailing-60s RPM/TPM.
  Keep `request.js` validation + per-file response conventions.
- **R2.7 — `types.ts`**: hand-authored TypeScript types mirroring the API responses,
  placed for C3 to import (e.g. `web/src/api/types.ts` in the new app, or a shared file).

## Out of scope

- UI (→ C3). Prisma schema realignment (→ C1). Ingesting `quota_data`/`perf_metrics`
  (optional; OQ3 — verify populated, otherwise skip).

## Acceptance criteria

- [ ] After sync, new `stats`/`usage_stats` columns are populated for fresh logs; backfill
      repopulates history and is resumable (kill/restart continues).
- [ ] `/api/usage/breakdown` supports `dimension=user` and the new metrics; `/api/summary`
      returns cost$, cache-hit ratio, RPM/TPM, success rate.
- [ ] `/api/logs` rows include cache read/write, image/audio, frt→tokens/s, ratios,
      billing_source, upstream_request_id; filterable by `upstream_request_id`.
- [ ] Latency reported in ms (from frt); avg TTFT + TPS + success-rate available per model.
- [ ] `node:test` covers `other` parsing + cost derivation over **real `other` samples**
      (OpenAI, Anthropic-cache, audio/ws) and the latency/success math.
- [ ] `types.ts` compiles and matches the endpoints C3 uses.
- [ ] No write to the new-api DB; response envelopes consistent with each route file.

## Open items (confirm at review)

- OQ3 `quota_data`/`perf_metrics` populated? If yes, may seed backfill; if no, self-derive (default).
