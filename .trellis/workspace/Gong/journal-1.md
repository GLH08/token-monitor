# Journal - Gong (Part 1)

> AI development session journal
> Started: 2026-07-08

---



## Session 1: monitor-v2 全栈重构 + Trellis bootstrap + 优化

**Date**: 2026-07-09
**Task**: monitor-v2 全栈重构 + Trellis bootstrap + 优化
**Branch**: `main`

### Summary

Completed Trellis bootstrap (filled 11 backend/frontend spec files from real code, verified). Analyzed new-api v1.0.0-rc.20 (Prisma schema drift, logs.other rich metrics, quota_data/perf_metrics rollups, web/default UX; deployment confirmed PostgreSQL single-DB). Planned + executed monitor-v2 full-stack rebuild via Trellis: C1 data-layer (realign Prisma to rc.20, use_time=seconds, soft-delete, type 0/7, upstream_request_id, PG-validated), C2 backend-metrics (parse logs.other for cache-creation/image/audio/tool/ratios/frt, 10 new SQLite metric columns, resumable backfill, derive cost/cache-hit/success/latency/TTFT/TPS, per-user dimension via token_id, extended /api, web/src/api/types.ts contract), C3 frontend-rebuild (Vite+TS+Tailwind+shadcn+TanStack+ECharts, 7 pages, dark-first Chinese UI, logs detail dialog). Followed up with v2 optimizations: ECharts tree-shaking (gzip 514->361KB) + vendor chunk splitting, removed unused dayjs, hardened extended-metrics backfill against double-count (serialized startup backfills + fail-safe end_id capture, 5 new tests). All tasks archived; pushed 15 commits to origin/main.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `78dfb02` | (see git log) |
| `9dc0b32` | (see git log) |
| `840542e` | (see git log) |
| `f01b44c` | (see git log) |
| `64c127e` | (see git log) |
| `ecbc1f8` | (see git log) |
| `754e7f5` | (see git log) |
| `eba3d23` | (see git log) |
| `b10d2b5` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: v2 部署后修复: 缓存命中/环形图/模型树/日志筛选/计费

**Date**: 2026-07-09
**Task**: v2 部署后修复: 缓存命中/环形图/模型树/日志筛选/计费
**Branch**: `main`

### Summary

Fixed 5 post-deploy issues. (1) Cache-hit ratio 921%: new-api prompt_tokens excludes cache for Claude semantics; added total_input_tokens column computed per-log with semantic detection (prompt+cache_hit+cache_creation for Claude, prompt for OpenAI), used as the cache_hit_ratio denominator; fixed net_input_tokens/throughput_total; dedicated resumable backfill reusing the captured end_id. (2) Billing -1 sentinels render as '-'. (3) DistributionPie caps top-8 + '其他' and hides on-pie labels. (4) Models 模型数 KPI icon removed. (5) Logs upstream_request_id filter removed (request_id kept). 42 backend tests pass; frontend lint 0 errors + build OK.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c697ed1` | (see git log) |
| `91fa275` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
