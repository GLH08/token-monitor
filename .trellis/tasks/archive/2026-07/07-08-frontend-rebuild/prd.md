# C3 — 前端重构 (Vite + TypeScript)

> Child of `07-08-monitor-v2`. See parent `design.md` (§5 Frontend). Depends on **C2**
> (API + `types.ts` contract). Replaces `web/` while keeping the deployment model unchanged.

## Goal & user value

Replace the dated plain-JS dashboard with a modern, information-rich TypeScript app that
surfaces the metrics C2 exposes, in an IA aligned with new-api's current design language.

## Requirements

- **R3.1 — Stack**: Vite + **TypeScript** + Tailwind + **shadcn/ui** + **TanStack Query**
  (server state/polling) + **TanStack Table** (logs) + **ECharts** (`echarts-for-react`,
  per-chart imports) + **react-router v6** + lightweight **Zustand** for global UI state.
  **i18n** with zh default (en optional — OQ2).
- **R3.2 — Deployment unchanged**: `npm run build` → `web/dist`, copied to backend `public/`
  by the root `Dockerfile`; Vite dev proxy `/api` → backend. Single-port serving intact.
- **R3.3 — Auth preserved**: login page, bearer token in `localStorage`, clear-on-401 +
  `auth-changed` event, gate to Login when auth enabled (behavior parity with current `App.jsx`/`api.js`).
- **R3.4 — IA / pages** (parent §5): Overview, Usage Analytics, Models, Channels,
  Performance, Logs, Alerts. Sidebar + top bar (global time-range, currency/token toggle,
  sensitive-data mask, theme), **dark-first** (OQ2).
- **R3.5 — Consume C2 contract**: import `types.ts`; typed API client + TanStack Query hooks;
  render the new metrics (cost$, cache-hit%, image/audio/reasoning tokens, tool surcharge,
  success%, latency ms + TTFT + TPS, RPM/TPM) and multi-dim breakdowns incl. per-user.
- **R3.6 — Logs**: TanStack table with URL-state filters (draft-then-apply), dense cells
  (cache ↓/↑, FRT, tokens/s), **details dialog** (Token Breakdown + Billing Breakdown),
  mobile card fallback.
- **R3.7 — Quality**: `npm run lint` (+ typecheck) and `npm run build` pass; served correctly
  as static assets by Express in the Docker image.

## Out of scope

- Backend/API/data changes (→ C1/C2). New product features beyond monitoring.

## Acceptance criteria

- [ ] `npm run build` + lint/typecheck pass; `web/dist` served by Express renders the app on the single port (Docker build smoke-tested).
- [ ] All 7 pages render live data from C2's API using the shared `types.ts`.
- [ ] Auth flow works (login/logout/401 redirect) with auth enabled and disabled.
- [ ] Alerts page reaches parity with the current feature (rules + history), restyled.
- [ ] Currency↔token toggle, time-range, and sensitive-data mask work globally; logs filters persist in the URL.
- [ ] Responsive: logs table degrades to cards on mobile.

## Confirmed UX decisions

- **Chinese-only** UI (no bilingual/i18n toggle needed — a single zh string table).
- **Dark-first** theme.
- Expose the **full metric set**; no metric singled out or dropped.
