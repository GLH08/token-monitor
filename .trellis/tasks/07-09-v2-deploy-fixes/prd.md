# v2 部署后修复: 缓存命中/环形图/模型树/日志筛选/计费显示

## Goal

Post-deploy fixes: cache-hit ratio >100%, donut label chaos with many models, model-tree icon inconsistency, logs request-id filter UX, billing -1 sentinels; de-emphasize unreliable price, prioritize token stats

## Goal

Post-deploy fixes for 5 issues found after the v2 rebuild deployment. User priority: accurate TOKEN stats (input/output/cache) matter most; price ($) is unreliable (new-api channel/model prices mostly unset) and optional.

## Confirmed root causes

- **Cache hit 921%**: new-api's `logs.prompt_tokens` EXCLUDES cache tokens for Anthropic/Claude (native Claude + OpenRouter-Claude), but INCLUDES them for OpenAI (`service/text_quota.go:204,256-258,480`; `relay/channel/claude/relay-claude.go:731,910`). So `cache_hit / prompt_tokens` exceeds 100% on Claude-heavy traffic. Same flaw makes `net_input_tokens = prompt - cache` clamp to 0 for Claude.
- **Billing -1**: new-api uses `-1` as the "unset" sentinel for ratios/price; `parseRatios` returns -1 and the dialog renders `-1.0000` / `$-1`.
- **Donut chaos**: `DistributionPie` labels every slice (no top-N cap) and overlaps with many models.
- **Model-tree icon**: `Models.tsx` 模型数 KPI has `icon: Cpu`; the other 5 KPI cards have none.

## Requirements

- **R1 (backend, cache correctness)**: add a `total_input_tokens` column to `stats`/`usage_stats`, computed per-log at sync as: `other.input_tokens_total` if present, else (Claude-semantic ? `prompt + cache_hit + cache_creation` : `prompt`). Use SUM(total_input_tokens) as the `cache_hit_ratio` denominator everywhere; fix `net_input_tokens`/`throughput_total` to derive from `total_input_tokens`. Add a DEDICATED resumable backfill for the new column (reuses the captured end_id; the existing extended backfill is already done and cannot re-run without double-counting).
- **R2 (frontend, billing -1)**: in the log details billing section, render `-` (unset) for ratio/price values that are `-1` or `0`.
- **R3 (frontend, donut)**: cap `DistributionPie` to top-N + "其他", hide on-pie labels (legend + tooltip only).
- **R4 (frontend, model-tree icon)**: remove `icon: Cpu` from the 模型数 KPI card on `Models.tsx`.
- **R5 (frontend, logs filters)**: remove the `upstream_request_id` search input (only obtainable from new-api -> matches the user's complaint); keep `request_id` (obtainable from client API responses/errors).

## Out of scope

- Removing price/cost from the UI entirely (still useful when configured; currency/token toggle already exists).
- Re-running the existing extended backfill (would double-count).

## Acceptance Criteria

- [x] `cache_hit_ratio` never exceeds 100% on Claude-heavy traffic; uses `total_input_tokens` denominator (verified in code + a node:test case).
- [x] `net_input_tokens`/`throughput_total` correct for both OpenAI and Claude semantics (node:test).
- [x] Dedicated `total_input_tokens` backfill is resumable + bounded, reuses end_id, does not double-count.
- [x] Log details billing shows `-` for unset (-1/0) ratios and price.
- [x] DistributionPie caps to top-N + "其他", no overlapping on-pie labels.
- [x] Models 模型数 KPI has no icon (matches the other cards).
- [x] Logs page has no upstream_request_id search input; request_id retained.
- [x] `node --test` passes (42); `npm run lint` + `npm run build` pass.

## Done

Commits: `c697ed1` (backend cache-hit fix) + `91fa275` (frontend UI fixes). Note: the `total_input_tokens` backfill runs automatically on startup (reuses the captured end_id); until it completes, cache_hit_ratio falls back to prompt_tokens (OpenAI-correct, Claude-approximate) and converges as the backfill progresses.
