# 成本与 Token 分析优化规划

## Context

当前 token-monitor 已能从 NewAPI 的 `logs` 表同步消费/错误日志，并落入本地 SQLite `stats` 聚合表，用于 Dashboard、渠道页、模型页展示基础的请求数、Token、quota/cost、错误率和延迟。

用户现在重点关注两个个人使用场景：

1. 按 NewAPI 的分组、渠道、模型、时间查看使用成本。
2. 按 NewAPI 的分组、渠道、模型、时间查看 Token 使用。

明确不纳入本轮规划：退款、订阅抵扣、多租户/公开部署、复杂账单审计。成本口径保持简单：`cost = quota / QUOTA_PER_UNIT`，以 NewAPI 消费日志为准。

现有主要缺口：

- 本地 `stats` 只按 `channel_id + model_name + hour` 聚合，没有 `group` 维度。
- Token 页只是 Token 列表，`usedCount` 目前为 0，未使用已有 `/tokens/:id/usage`。
- 缺少统一的成本/Token 交叉分析 API，现有 API 分散在 `/summary`、`/analysis`、`/channels/performance`、`/models/analysis`。
- 前端没有一个面向“成本/Token 分析”的集中页面，用户需要在 Dashboard、Channels、Models、Tokens 之间跳转。
- `logs.use_time` 在 NewAPI 中是秒级语义，当前 UI 多处显示 `ms`，后续应顺手修正展示口径，但它不是成本/Token 主线。

## Dependency graph

```text
NewAPI logs table
  -> Prisma Log model (server/prisma/schema.prisma)
    -> syncLogs/updateStats (server/syncer.js)
      -> local SQLite stats table (server/db.js)
        -> stats APIs (server/routes/stats.js)
          -> web API client (web/src/api.js)
            -> Dashboard / Channels / Models hooks/pages

NewAPI tokens table
  -> Prisma Token model
    -> token APIs (server/routes/tokens.js)
      -> web API client
        -> Tokens page
```

Planned new flow:

```text
NewAPI logs table
  -> syncLogs/updateStats with group + token_id-aware aggregation
    -> usage_stats table
      -> /api/usage/summary
      -> /api/usage/breakdown
      -> /api/usage/timeseries
      -> upgraded Tokens page and Cost/Token Analysis page
```

## Recommended approach

Use a small additive analytics layer instead of heavily rewriting existing Dashboard/Channels/Models APIs.

- Keep existing `stats` table and existing pages working during migration.
- Add a new aggregate table focused on personal cost/Token analysis.
- Backfill/rebuild the new table from NewAPI logs for the retained time range.
- Add new APIs for flexible filtering and dimension breakdown.
- Add one new frontend analysis page for cost/Token exploration.
- Upgrade Token page with actual usage stats, without turning it into a full admin console clone.

## Critical files to modify

Backend:

- `server/db.js`
- `server/syncer.js`
- `server/request.js`
- `server/routes/usage.js` or `server/routes/stats.js`
- `server/routes/tokens.js`
- `server/index.js`
- `server/prisma/schema.prisma` only if current fields are missing or mapped incorrectly

Frontend:

- `web/src/api.js`
- `web/src/App.jsx`
- `web/src/components/Layout.jsx`
- `web/src/components/PageUI.jsx`
- New page: `web/src/CostTokenAnalysis.jsx`
- New hook: `web/src/hooks/useUsageAnalysis.js`
- `web/src/Tokens.jsx`

## Reuse existing utilities

Backend:

- Reuse `parseTimeRange`, `parseOptionalId`, `parseModelList`, `parsePositiveInt`, `sendValidationError` from `server/request.js`.
- Reuse `QUOTA_PER_UNIT` pattern from `server/routes/stats.js` and `server/routes/tokens.js`.
- Reuse `rebuildStatsForDateRange` pattern from `server/syncer.js` for rebuilding new aggregates.
- Reuse existing `db.getAsync`, `db.allAsync`, `db.runAsync` from `server/db.js`.

Frontend:

- Reuse `authFetch` and `withQuery` wrappers in `web/src/api.js`.
- Reuse `TimeRangeTabs`, `FilterBar`, `PanelCard`, `StatCard`, `EmptyState`, `ChannelSelect`, `updateUrlSearchParams`, `getSupportedWindow` from `web/src/components/PageUI.jsx`.
- Reuse `useChannels` from `web/src/hooks/useChannels.js` for channel filter labels.
- Follow `Models.jsx` URL query pattern for shareable filters.

## Phase 1: Add group/token-aware aggregate foundation

### Task 1.1 — Add `usage_stats` aggregate table

Create a new SQLite aggregate table instead of changing `stats` in place.

Suggested columns:

```text
hour INTEGER
user_group TEXT
channel_id INTEGER
model_name TEXT
token_id INTEGER
prompt_tokens INTEGER
completion_tokens INTEGER
tokens INTEGER
request_count INTEGER
quota INTEGER
error_count INTEGER
avg_latency INTEGER
PRIMARY KEY (hour, user_group, channel_id, model_name, token_id)
```

Use `user_group` rather than `group` in SQLite SQL to avoid confusion with `GROUP BY`.

Suggested indexes:

```text
idx_usage_stats_hour
idx_usage_stats_group_hour
idx_usage_stats_channel_hour
idx_usage_stats_model_hour
idx_usage_stats_token_hour
```

Acceptance criteria:

- App startup creates `usage_stats` if missing.
- Existing `stats`, Dashboard, Channels, Models pages continue working.
- Re-running startup is idempotent.

Verification:

- Start backend once and confirm no SQLite migration error.
- Query SQLite schema manually or through a small read-only check.
- Run existing frontend build after all implementation phases.

### Task 1.2 — Write to `usage_stats` during sync

Extend `updateStats(logs)` or split helper functions so every synced log updates both:

- existing `stats` for old pages
- new `usage_stats` for flexible analysis

Aggregation key:

```text
hour + log.group + log.channelId + log.modelName + log.tokenId
```

For personal-use scope:

- Include consume logs for cost/Token.
- Keep error count if error logs have channel/model/group/token available.
- Do not implement refund/subscription fields.

Acceptance criteria:

- New rows are created with group and token_id populated.
- Existing `stats` row counts and old pages are unaffected.
- Logs with empty group use a stable fallback such as `''` or `default`, chosen consistently across API and UI.

Verification:

- Run sync against a known NewAPI DB with recent logs.
- Compare total `SUM(quota)` and `SUM(tokens)` between old `stats` and new `usage_stats` for the same time window, allowing only expected differences from token/group granularity.

### Checkpoint 1

Before frontend work, verify backend can produce correct aggregates for:

- all groups
- one group
- one channel
- one model
- one token
- combined group + channel + model

## Phase 2: Add unified usage analysis APIs

### Task 2.1 — Add request parsers for usage filters

Extend `server/request.js` with parsers for:

```text
user_group / group string
channel_id optional id
token_id optional id
model_name exact string
metric: cost | tokens | requests | quota
dimension: time | group | channel | model | token
```

Keep validation simple. Do not add permissions or multi-user authorization complexity.

Acceptance criteria:

- Invalid ids return 400.
- Unsupported dimensions/metrics return 400.
- Empty filters mean “all”.

Verification:

- Exercise API endpoints with valid and invalid query params.

### Task 2.2 — Add `/api/usage/summary`

Return totals for a time range and optional filters:

```json
{
  "tokens": 123,
  "prompt_tokens": 100,
  "completion_tokens": 23,
  "requests": 10,
  "quota": 5000,
  "cost": 0.01,
  "errors": 0,
  "active_groups": 2,
  "active_channels": 3,
  "active_models": 4,
  "active_tokens": 5
}
```

Acceptance criteria:

- Supports filters: `start_ts`, `end_ts`, `group`, `channel_id`, `model_name`, `token_id`.
- Cost uses existing `QUOTA_PER_UNIT`.
- No refund/subscription fields are included.

Verification:

- Compare summary totals with direct SQL over `usage_stats`.

### Task 2.3 — Add `/api/usage/breakdown`

Return ranked breakdown for one dimension:

```text
dimension=group|channel|model|token
metric=cost|tokens|requests
```

Each row should include:

```json
{
  "key": "...",
  "label": "...",
  "tokens": 123,
  "requests": 10,
  "quota": 5000,
  "cost": 0.01,
  "errors": 0
}
```

Enrich labels:

- channel: name/type from Prisma `channel`
- token: name/status/group from Prisma `token`
- model: model name; optional metadata from Prisma `model`
- group: raw group string

Acceptance criteria:

- Can rank by cost, tokens, or requests.
- Channel and token labels are human-readable.
- Limit defaults to a sane value such as 20.

Verification:

- Compare group/channel/model/token breakdown sums against summary for the same filters.

### Task 2.4 — Add `/api/usage/timeseries`

Return hourly time series for selected filters, with optional split dimension:

```text
split=none|group|channel|model|token
```

First version:

- `split=none` for total trend.
- `split=model` and `split=channel` for top-N stacked charts.
- Defer token split if UI becomes crowded.

Acceptance criteria:

- Missing hours are filled with zeroes for the selected range.
- Supports the same filters as summary.
- Top-N split avoids enormous payloads.

Verification:

- 24h query returns the expected hourly buckets.
- Sum of timeseries values matches summary for same filters.

### Checkpoint 2

At this point, all new analysis should be usable from API alone:

- total cost/Token over time
- by group
- by channel
- by model
- by token
- with combined filters

## Phase 3: Build personal-use Cost/Token Analysis page

### Task 3.1 — Add API client and hook

Add wrappers in `web/src/api.js`:

```text
fetchUsageSummary(filters)
fetchUsageBreakdown(filters)
fetchUsageTimeseries(filters)
```

Add `web/src/hooks/useUsageAnalysis.js` to load:

- summary
- primary trend
- breakdown by selected dimension
- optional secondary breakdowns for quick cards

Acceptance criteria:

- Hook accepts URL-derived filters.
- Loading and error states are handled similarly to existing hooks.
- Existing pages are untouched.

Verification:

- Use browser devtools/network to confirm API calls match selected filters.

### Task 3.2 — Add `CostTokenAnalysis` page

Create a page focused on the user’s exact workflow.

Filters:

- time window: 1h / 6h / 24h / 7d / 30d
- group select/input
- channel select
- model input/select
- token select/input
- metric toggle: cost / tokens / requests
- dimension toggle: group / channel / model / token

Display:

- summary cards: cost, total tokens, requests, active models/channels/tokens
- hourly trend chart
- ranked breakdown table
- top breakdown bar chart

Acceptance criteria:

- User can answer: “过去 24 小时，某分组在某渠道、某模型上花了多少钱/用了多少 Token”。
- User can clear filters easily.
- URL query params preserve current analysis view.

Verification:

- Start Vite dev server and test filter combinations in browser.
- Confirm totals change when group/channel/model/token filters change.

### Task 3.3 — Add navigation entry

Add a sidebar/nav item such as “成本分析” or “用量分析”.

Acceptance criteria:

- Route is accessible from Layout navigation.
- Direct URL load works.
- Existing routes still work.

Verification:

- Browser navigation smoke test.

### Checkpoint 3

The new page should become the primary place for cost and Token exploration. Existing Dashboard/Channels/Models pages remain as overview pages.

## Phase 4: Upgrade Token analysis

### Task 4.1 — Fix token overview usage counts

Update `/tokens/overview` so `usedCount` is derived from `usage_stats` for a default recent window or all retained data.

Recommended first version:

- Add optional `start_ts` and `end_ts` filters.
- Return per-token recent `requests`, `tokens`, `quota`, `cost`.

Acceptance criteria:

- `usedCount` is no longer hardcoded 0.
- Token list can show recent requests, tokens, and cost.

Verification:

- Compare one token’s overview numbers with `/api/usage/summary?token_id=...`.

### Task 4.2 — Add Token detail drilldown

On `Tokens.jsx`, add a row action or expandable section to show one token’s usage:

- hourly trend
- top models
- top channels
- group
- cost/tokens/requests

This can reuse `/api/usage/*` with `token_id` filter instead of a bespoke endpoint.

Acceptance criteria:

- Clicking a token shows meaningful cost/Token breakdown without navigating away, or links to Cost/Token Analysis page with `token_id` prefilled.
- Personal-use simple UX is preferred over complex modals.

Verification:

- Pick a token with known traffic and verify breakdown matches NewAPI logs.

### Checkpoint 4

Token page should answer:

- Which token used the most cost?
- Which token used the most Token?
- What models/channels did this token use?
- How did this token’s usage change over time?

## Phase 5: Correct unit/label issues and polish

### Task 5.1 — Correct latency display unit

NewAPI log `use_time` is seconds in normal relay logs. Existing token-monitor labels often show `ms`.

Options:

- Convert `useTime` seconds to milliseconds during aggregation and keep UI as ms.
- Or keep seconds and relabel UI as seconds.

Recommended: convert at aggregation boundary for UI consistency, but verify against actual NewAPI data before changing historical interpretation.

Acceptance criteria:

- Latency labels match stored values.
- Existing charts/tables are not misleading.

Verification:

- Compare one slow request in NewAPI log with token-monitor display.

### Task 5.2 — Add lightweight formatting helpers

If repeated across pages, add local helpers for:

- cost formatting
- compact Token formatting
- quota formatting
- percent formatting

Do not introduce a large utility abstraction unless duplication becomes painful.

Acceptance criteria:

- New page has consistent number formatting.
- Existing formatting is not unnecessarily refactored.

Verification:

- Visual check in browser.

## End-to-end verification plan

Backend:

```sh
cd server
npm install
npx prisma generate
node index.js
```

Frontend:

```sh
cd web
npm install
npm run build
npm run dev
```

Manual browser verification:

1. Open dashboard and confirm existing overview still loads.
2. Open new Cost/Token Analysis page.
3. Test these queries:
   - all traffic, 24h, metric cost, dimension model
   - one group, 24h, metric tokens, dimension channel
   - one channel + one model, 7d, metric cost, dimension time
   - one token, 24h, metric tokens, dimension model
4. Compare at least one query with NewAPI logs or direct DB totals.
5. Open Token page and confirm request count/cost/token values are non-zero for active tokens.

## Scope guardrails

Do not implement in this round:

- refund/net cost handling
- subscription/billing-source analysis
- multi-tenant permissions
- public sharing/exporting
- complex `logs.other` billing explanations
- upstream model mapping analysis

These can be revisited later if personal usage needs them, but they are not required for the current goal.
