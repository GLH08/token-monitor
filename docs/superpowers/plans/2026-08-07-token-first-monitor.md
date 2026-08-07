# Token-First Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Token Monitor a token-first analytics platform while preserving amount/quota as secondary estimates.

**Architecture:** Normalize new-api log token fields once in the backend, persist token-oriented hourly aggregates in local SQLite, expose token-first REST contracts, and update the React pages to consume those contracts. Keep upstream/reference directories read-only.

**Tech Stack:** CommonJS Node.js, Express 5, Prisma 5, PostgreSQL/MySQL source databases, SQLite aggregate database, React 19, TypeScript, TanStack Query, ECharts, Node test.

**Execution status:** Tasks 1-9 implemented on `codex/token-first-monitor`; final verification and independent review passed. GitHub publish is pending the local `gh` CLI/auth prerequisite.

## Global Constraints

- Modify only `D:/Files/Code/token-monitor`.
- Preserve existing user-owned untracked files and do not stage `AGENTS.md` or unrelated `docs/` files.
- Write a failing test before production code for every behavior change.
- Token metrics are primary; quota and estimated amount are secondary.
- Keep existing API compatibility unless a test documents the new default.
- Commit each completed task independently on `codex/token-first-monitor`.
- Do not push GitHub until final review and verification pass.

---

### Task 1: Secure local environment and record the baseline

**Files:**
- Modify: `.gitignore`
- Delete from repository: `server/temp_env`
- Modify: `.env.example`
- Test: repository status and configuration checks

**Interfaces:**
- Produces a repository without a tracked plaintext environment file.
- Keeps all existing runtime environment variable names backward compatible.

- [ ] **Step 1: Write the regression check**

Run:

```powershell
git ls-files server/temp_env .env server/.env
```

Expected after the task: no output for `server/temp_env`, `.env`, or `server/.env`.

- [ ] **Step 2: Verify the check fails before the change**

Expected: `server/temp_env` is listed because it is currently tracked.

- [ ] **Step 3: Add local environment patterns and remove the tracked file**

Keep the local file uncommitted only if needed for local work; never include its contents in output or commits.

- [ ] **Step 4: Verify configuration documentation**

Run:

```powershell
Select-String -Path .env.example -Pattern 'DATABASE_URL|QUOTA_PER_UNIT|MAX_MONITOR_MODELS|DATA_RETENTION_DAYS'
```

Expected: documented variables contain placeholders or safe defaults only.

- [ ] **Step 5: Commit**

```powershell
git add .gitignore .env.example
git rm -- server/temp_env
git commit -m "chore: secure local environment configuration"
```

### Task 2: Standardize canonical token metrics

**Files:**
- Modify: `server/tokenMetrics.js`
- Test: `server/test/token-metrics.test.js`
- Test: `server/test/stats-tokens.test.js`

**Interfaces:**
- `metricsFromLog(log)` returns `totalInputTokens`, `cacheHitTokens`, `cacheCreationTokens`, `netInputTokens`, `completionTokens`, and `throughputTokens` with non-negative integer values.
- Existing exported helpers remain available.

- [ ] **Step 1: Write the failing tests**

Cover normalized input, cache subtraction, and throughput:

```js
const metrics = metricsFromLog({
  promptTokens: 80,
  completionTokens: 20,
  useTime: 2,
  other: JSON.stringify({
    input_tokens_total: 100,
    cache_tokens: 30,
    cache_write_tokens: 10
  })
});

assert.equal(metrics.totalInputTokens, 100);
assert.equal(metrics.netInputTokens, 60);
assert.equal(metrics.throughputTokens, 120);
```

- [ ] **Step 2: Run the focused test and confirm the intended failure**

```powershell
npm test -- --test-name-pattern="canonical|throughput|cache"
```

Expected: the new assertion fails because the canonical fields are not yet exposed or normalized as specified.

- [ ] **Step 3: Implement the minimum normalization**

Use normalized `input_tokens_total` when present, preserve Claude fallback behavior, clamp subtraction at zero, and never convert `reasoning_requests` into a token count.

- [ ] **Step 4: Run focused and full backend tests**

```powershell
npm test -- --test-name-pattern="canonical|throughput|cache"
npm test
```

Expected: focused tests and all existing tests pass.

- [ ] **Step 5: Commit**

```powershell
git add server/tokenMetrics.js server/test/token-metrics.test.js server/test/stats-tokens.test.js
git commit -m "feat: standardize canonical token metrics"
```

### Task 3: Align Prisma schema with the reference database

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/syncer.js`
- Test: `server/test/schema-compatibility.test.js`

**Interfaces:**
- Prisma channel organization maps to `open_ai_organization`.
- `channelInfo` accepts the source JSON value or its serialized representation.
- Source integer-width changes are converted to safe application values at the database boundary.

- [ ] **Step 1: Write failing schema and parser tests**

Assert that the schema contains `@map("open_ai_organization")`, `channelInfo` is JSON-compatible, and the channel parser accepts both an object and a JSON string.

- [ ] **Step 2: Run the focused test and confirm it fails**

```powershell
npm test -- --test-name-pattern="schema compatibility|channel info"
```

- [ ] **Step 3: Update the Prisma mappings and parser**

Make the smallest cross-provider-compatible change; update all code references without changing the external database.

- [ ] **Step 4: Generate Prisma Client and run tests**

```powershell
npx prisma generate
npm test
```

- [ ] **Step 5: Commit**

```powershell
git add server/prisma/schema.prisma server/syncer.js server/test/schema-compatibility.test.js
git commit -m "fix: align prisma schema with new-api database"
```

### Task 4: Add token-oriented rollup and period comparison helpers

**Files:**
- Modify: `server/db.js`
- Modify: `server/syncer.js`
- Modify: `server/routes/usage.js`
- Test: `server/test/usage-stats.test.js`
- Test: `server/test/stats-tokens.test.js`

**Interfaces:**
- Existing hourly `usage_stats` remains the source for token-dimension queries.
- New summary responses expose canonical input/output/cache/throughput fields and optional previous-period deltas.

- [ ] **Step 1: Write failing tests for token totals and period deltas**

Insert two periods of aggregate rows and assert that current total, previous total, absolute delta, and percentage delta are correct, including a zero previous period.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
npm test -- --test-name-pattern="period|delta|throughput"
```

- [ ] **Step 3: Implement aggregation and comparison using integer token sums**

Keep cost/quota calculation separate and optional. Do not use floating-point cost values to calculate token totals.

- [ ] **Step 4: Run full backend tests**

```powershell
npm test
```

- [ ] **Step 5: Commit**

```powershell
git add server/db.js server/syncer.js server/routes/usage.js server/test/usage-stats.test.js server/test/stats-tokens.test.js
git commit -m "feat: add token rollups and period comparisons"
```

### Task 5: Expose token-first API contracts

**Files:**
- Modify: `server/routes/usage.js`
- Modify: `server/routes/tokens.js`
- Modify: `server/routes/stats.js`
- Modify: `server/request.js`
- Test: `server/test/api-metrics.test.js`
- Test: `server/test/usage-stats.test.js`

**Interfaces:**
- Usage summary defaults to `metric=tokens` when omitted.
- Token usage returns hourly series plus total input/output/cache/throughput/request fields.
- Model and channel responses include token efficiency fields without removing cost fields.

- [ ] **Step 1: Write failing route-contract tests**

Assert omitted usage metric selects tokens, token usage returns canonical fields, and invalid ranges still return the existing validation error.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
npm test -- --test-name-pattern="usage metric|token usage|token contract"
```

- [ ] **Step 3: Implement the minimum response and validation changes**

Reuse existing `usage_stats` queries and mapping helpers. Keep existing response keys for compatibility and add canonical fields explicitly.

- [ ] **Step 4: Run backend tests**

```powershell
npm test
```

- [ ] **Step 5: Commit**

```powershell
git add server/routes/usage.js server/routes/tokens.js server/routes/stats.js server/request.js server/test/api-metrics.test.js server/test/usage-stats.test.js
git commit -m "feat: expose token-first usage analytics"
```

### Task 6: Make Overview and Usage pages token-centric

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/api/hooks.ts`
- Modify: `web/src/pages/Overview.tsx`
- Modify: `web/src/pages/UsageAnalytics.tsx`
- Modify: `web/src/components/StatCard.tsx`
- Modify: `web/src/lib/format.ts`

**Interfaces:**
- Frontend types model canonical token totals and period deltas.
- Overview and Usage default to the token metric while amount remains selectable.

- [ ] **Step 1: Add typed usage fixtures**

Add typed fixture objects for canonical token summary fields and compile them through the API types.

- [ ] **Step 2: Run the frontend typecheck and confirm the new fields are missing**

```powershell
npm run typecheck
```

- [ ] **Step 3: Implement token KPI cards and token-first controls**

Use existing chart/table components, keep labels explicit, and format large integer Token values without currency conversion.

- [ ] **Step 4: Run typecheck and build**

```powershell
npm run typecheck
npm run build
```

- [ ] **Step 5: Commit**

```powershell
git add web/src/api web/src/pages/Overview.tsx web/src/pages/UsageAnalytics.tsx web/src/components/StatCard.tsx web/src/lib/format.ts
git commit -m "feat: make overview and usage token-centric"
```

### Task 7: Add Token, model, channel, and multi-Key token views

**Files:**
- Modify: `web/src/pages/Models.tsx`
- Modify: `web/src/pages/Channels.tsx`
- Modify: `web/src/pages/Logs.tsx`
- Modify: `web/src/api/types.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/api/hooks.ts`
- Test: frontend typecheck and build

**Interfaces:**
- Models display token efficiency and input/output ratios.
- Channels display token distribution and multi-Key balance.
- Logs display canonical token fields when available.

- [ ] **Step 1: Add typed API fixtures for model/channel/token fields**

Compile fixtures covering zero-token rows, missing model names, and multi-Key indices.

- [ ] **Step 2: Run `npm run typecheck` and confirm missing contract fields**

- [ ] **Step 3: Implement views using existing tables, KPI cards, and charts**

Do not introduce a new UI dependency; keep estimated cost secondary.

- [ ] **Step 4: Run frontend validation**

```powershell
npm run typecheck
npm run lint
npm run build
```

- [ ] **Step 5: Commit**

```powershell
git add web/src/pages/Models.tsx web/src/pages/Channels.tsx web/src/pages/Logs.tsx web/src/api
git commit -m "feat: add token views for models and channels"
```

### Task 8: Add percentile performance and token anomaly alerts

**Files:**
- Modify: `server/db.js`
- Modify: `server/syncer.js`
- Modify: `server/alerter.js`
- Modify: `server/routes/alerts.js`
- Modify: `web/src/pages/Performance.tsx`
- Modify: `web/src/pages/Alerts.tsx`
- Test: `server/test/api-metrics.test.js`
- Test: `server/test/usage-stats.test.js`

**Interfaces:**
- Performance responses expose P50/P95/P99 latency and TTFT where enough samples exist.
- Alert types include token spike/drop, cache-hit decline, oversized request, and multi-Key imbalance.

- [ ] **Step 1: Write failing tests for percentile buckets and anomaly cooldown**

Use deterministic sample latencies and two evaluation windows; assert percentile values and existing cooldown behavior.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
npm test -- --test-name-pattern="percentile|token spike|cache hit|cooldown"
```

- [ ] **Step 3: Implement bounded percentile aggregation and baseline comparison**

Exclude zero-duration and error-only rows from latency percentiles. Reuse the existing alert history/cooldown mechanism.

- [ ] **Step 4: Run backend and frontend validation**

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

- [ ] **Step 5: Commit**

```powershell
git add server/db.js server/syncer.js server/alerter.js server/routes/alerts.js web/src/pages/Performance.tsx web/src/pages/Alerts.tsx server/test/api-metrics.test.js server/test/usage-stats.test.js
git commit -m "feat: add token anomalies and percentile performance"
```

### Task 9: Update documentation and perform final verification

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Create: `docs/token-metrics.md`
- Test: repository diff and full validation commands

- [ ] **Step 1: Document canonical Token fields and amount limitations**

Document units, fallback behavior, cache semantics, and the fact that `reasoning_requests` is not reasoning token count.

- [ ] **Step 2: Run the complete validation set**

```powershell
Push-Location server; npm test; Pop-Location
Push-Location web; npm run typecheck; npm run lint; npm run build; Pop-Location
git diff --check
git status --short
```

- [ ] **Step 3: Inspect every commit and sensitive file**

```powershell
git log --oneline --decorate -12
git ls-files server/temp_env .env server/.env
git diff main...HEAD --stat
```

- [ ] **Step 4: Commit documentation**

```powershell
git add README.md .env.example docs/token-metrics.md
git commit -m "docs: describe token-first monitoring"
```

- [ ] **Step 5: Final review before publishing**

Confirm tests, typecheck, lint, build, diff, commit history, and source/reference compatibility. Only after this review push `codex/token-first-monitor` to `origin` and create a draft pull request if the repository workflow supports it.
