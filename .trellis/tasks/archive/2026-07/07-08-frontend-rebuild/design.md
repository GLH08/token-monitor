# C3 — Design (IA / components / state)

> Depends on C2. Parent `design.md` §5 has the IA table; this narrows to app structure,
> state model, and the shared building blocks.

## 1. App structure (`web/src/`)

```
src/
├── main.tsx  App.tsx            # bootstrap + auth gate + router
├── routes.tsx                   # react-router route table
├── api/
│   ├── client.ts                # fetch wrapper: bearer token, 401→clear+auth-changed
│   ├── types.ts                 # from C2 (the FE↔BE contract)
│   └── hooks.ts                 # TanStack Query hooks (useSummary, useUsageBreakdown, useLogs…)
├── components/
│   ├── ui/                      # shadcn primitives (button, card, dialog, select, table…)
│   ├── layout/                  # AppShell (sidebar + topbar), PageHeader
│   ├── charts/                  # EChart wrappers: TrendChart, DistributionPie, RankBar
│   ├── StatCard.tsx  KpiStrip.tsx  DataTable.tsx  EmptyState.tsx  …
├── pages/                       # Overview, UsageAnalytics, Models, Channels, Performance, Logs, Alerts, Login
├── stores/ui.ts                 # Zustand: timeRange, currencyMode, masked, theme
├── lib/                         # format.ts (quota/tokens/latency), currency.ts, time.ts, cn.ts
└── i18n/                        # zh (default), en (optional)
```

## 2. State model

- **Server state** → **TanStack Query** hooks in `api/hooks.ts`; polling via `refetchInterval`
  (replaces the manual `setInterval` hooks). 401 handled centrally in `client.ts`.
- **Global UI state** → **Zustand** `stores/ui.ts`: `timeRange`, `currencyMode` (usd|cny|token),
  `masked`, `theme`. Small and explicit; no Redux/Context sprawl.
- **Filter/pagination state** → **URL search params** (react-router `useSearchParams`),
  draft-then-apply on the logs filter bar (shareable/bookmarkable).

## 3. API client & auth (parity with current app)

`client.ts` mirrors today's `web/src/api.js` semantics in TS: base `/api`, attach
`Authorization: Bearer <localStorage token>`, on `401` clear token + dispatch `auth-changed`;
`App.tsx` listens for `storage` + `auth-changed` and flips to `<Login>` when auth is enabled.
Config from `/api/auth/config`.

## 4. Charts (ECharts)

`components/charts/*` wrap `echarts-for-react` with per-chart module imports (tree-shaken):
- `TrendChart` — stacked area/line over time, top-N series + "Other", theme-aware, Total-row tooltip.
- `DistributionPie` — donut share.
- `RankBar` — horizontal ranking.
Series capping + a stable key→color map (port the idea from new-api `charts.ts`).

## 5. Shared building blocks

`StatCard` (label + big `tabular-nums` value + optional sparkline + loading/`--` states),
`KpiStrip` (divided responsive grid), `DataTable` (TanStack table + toolbar + mobile-card
fallback + skeleton/empty), `format.ts`/`currency.ts` (quota→$/¥/token, K/M tokens, ms/TTFT/TPS),
mask toggle, theme provider (OKLCH tokens, dark default).

## 6. Migration / rollback

- Build the new app in place under `web/`; **keep the old sources reachable in git** until
  C3 is verified. Build output path (`web/dist`) and the root `Dockerfile` copy step are unchanged.
- If the new build regresses, revert the C3 commit → old `web/` returns; backend is untouched.

## 7. Trade-offs

- react-router (kept) vs TanStack Router: react-router is simpler and already understood;
  URL-state needs are met by `useSearchParams`. Revisit only if type-safe routes become valuable.
- ECharts vs VChart(new-api): ECharts is lighter to reason about and battle-tested for dense
  time-series; we forgo direct component reuse from new-api for a smaller, more familiar dep.
