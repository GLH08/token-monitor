# v2 优化: ECharts 树摇/dayjs/回填健壮性

## Goal

Tree-shake ECharts (core import), remove unused dayjs dep, harden extended-metrics backfill (serialize startup backfills + fail-safe end_id capture)

## Goal

Tree-shake ECharts (core import), remove unused dayjs dep, harden extended-metrics backfill (serialize startup backfills + fail-safe end_id capture)

## Requirements

- R1: Tree-shake ECharts - register only line/bar/pie + tooltip/legend/grid via `echarts/core` instead of the full bundle.
- R2: Split vendor chunks (echarts/react/tanstack) via `manualChunks` for independent caching.
- R3: Remove the unused `dayjs` dependency.
- R4: Harden the extended-metrics backfill - serialize startup backfills (usage_stats rebuild -> boundary capture -> first batch) and make end_id capture fail-safe (skip on missing end_id, no re-capture -> no double-count).

## Acceptance Criteria

- [x] `npm run build` passes; ECharts gzip drops from ~514KB to ~199KB (own cacheable chunk); react/tanstack split out.
- [x] `dayjs` removed from package.json; no imports remain.
- [x] Startup backfills run sequentially; `captureExtendedBackfillBoundary()` persists end_id before the sync loop; `stepExtendedMetricsBackfill` skips (no re-capture) when end_id is missing.
- [x] `node --test` passes (40 tests, incl. 5 new backfill-boundary cases).

## Done

Commits: `754e7f5` (perf web) + `eba3d23` (fix sync). Frontend lint 0 errors, build OK; backend 40/40 tests.
