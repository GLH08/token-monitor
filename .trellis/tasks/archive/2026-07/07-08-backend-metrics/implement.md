# C2 — Implement plan

> Depends on C1. Follows this task's `design.md`. All SQLite changes use the existing
> `PRAGMA table_info` + `ALTER TABLE` guard pattern in `server/db.js`.

## Ordered checklist

1. **Collect real `other` samples** → `research/other-samples.md` (a few consume logs:
   OpenAI, Anthropic-cache, audio/ws) by reading `logs.other` shapes from new-api source
   (`service/log_info_generate.go`, `service/text_quota.go`).
   → verify: samples cover cache-read/write, image, audio, tool, ratios, frt.

2. **Extend `server/tokenMetrics.js`** to the normalized struct (design §1) with tolerant
   extractors + **`node:test`** over the samples.
   → verify: `node --test` green; each field extracted from ≥1 sample.

3. **`server/db.js`**: add the new columns to `stats` + `usage_stats` via ALTER guards.
   → verify: fresh DB and existing DB both end with the new columns (PRAGMA check).

4. **Sync aggregation** (`server/syncer.js`): write the new metric sums per hourly bucket;
   compute `success_count`, `latency_ms_sum` (frt), `first_token_*`, `use_time_sum_sec`.
   → verify: after a sync run, new columns are non-zero for recent buckets.

5. **`user_id` migration**: build `usage_stats` v2 (new PK + `user_id`), backfill from
   `logs` re-aggregation behind `meta` flag; wire into `/rebuild-stats`.
   → verify: per-user breakdown returns non-empty; migration resumes after a kill.

6. **Backfill** historical `other`-derived columns (resumable, bounded).
   → verify: kill mid-backfill, restart, it continues from `meta`.

7. **API extension** (design §4) across `routes/{usage,stats,tokens,channels,logs,modelStatus}.js`
   using `request.js` helpers; add `dimension=user`, new metrics, `upstream_request_id` filter,
   RPM/TPM.
   → verify: each endpoint returns the new fields; validation rejects bad params (400).

8. **`types.ts`** mirroring §4/§5.
   → verify: `tsc --noEmit` on the types file passes.

9. **Regression + tests**: `node --test`; manual curl of key endpoints.
   → verify: existing suites pass; new endpoints return expected shapes.

## Validation commands

```sh
cd server
node --test
node index.js   # then curl /api/summary, /api/usage/breakdown?dimension=user, /api/logs
```

## Risky files / rollback points

- `server/db.js` (schema), `server/syncer.js` (aggregation + backfill), `server/tokenMetrics.js`,
  `server/routes/*` (API). The **`usage_stats` rebuild** is the only destructive step — it
  writes v2 then swaps; keep the old table until verified, and gate on the `meta` flag.
- Rollback: additive columns are harmless on downgrade; keep the migration behind its flag so
  a revert leaves the pre-migration `usage_stats` usable.

## Contract note for C3

`types.ts` + design §4 are the FE↔BE contract. If an endpoint shape changes during
implementation, update `types.ts` in the same commit and note it for C3.
