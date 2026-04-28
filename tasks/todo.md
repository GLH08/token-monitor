# Cost and Token Analysis Todo

## Phase 1 — Aggregate foundation
- [ ] Add `usage_stats` SQLite table and indexes
- [ ] Write group/token-aware aggregates during sync
- [ ] Add rebuild support for `usage_stats`
- [ ] Verify aggregate totals against existing `stats`

## Phase 2 — Usage APIs
- [ ] Add usage filter parsers
- [ ] Add `/api/usage/summary`
- [ ] Add `/api/usage/breakdown`
- [ ] Add `/api/usage/timeseries`
- [ ] Verify API totals and breakdown sums

## Phase 3 — Cost/Token analysis UI
- [ ] Add usage API client functions
- [ ] Add `useUsageAnalysis` hook
- [ ] Add Cost/Token Analysis page
- [ ] Add navigation route
- [ ] Browser-test filter combinations

## Phase 4 — Token analysis
- [ ] Replace hardcoded `usedCount`
- [ ] Show per-token requests/tokens/cost
- [ ] Add token drilldown or link-to-analysis
- [ ] Verify one token against NewAPI logs

## Phase 5 — Polish
- [ ] Fix latency unit labeling/conversion
- [ ] Add minimal number formatting helpers if needed
- [ ] Run frontend build
- [ ] Run backend smoke test
