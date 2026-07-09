# C3 — Implement plan

> Depends on C2 (`types.ts` + API). Follows this task's `design.md`. Keep the old `web/`
> sources in git until the new build is verified.

## Ordered checklist

1. **Scaffold** Vite + React + **TypeScript**; add Tailwind + shadcn/ui init; deps:
   `@tanstack/react-query`, `@tanstack/react-table`, `echarts` + `echarts-for-react`,
   `react-router-dom`, `zustand`, `i18next`/`react-i18next`, `lucide-react`.
   → verify: `npm run dev` renders a blank shell; `npm run build` passes.

2. **API layer**: `api/client.ts` (bearer + 401 handling, parity with current `api.js`),
   drop in C2 `types.ts`, `api/hooks.ts` (Query hooks for the endpoints in C2 design §4).
   → verify: a smoke `useSummary()` renders real numbers against the running backend.

3. **Auth**: Login page + `App.tsx` gate (config/session, `auth-changed`, `storage`).
   → verify: with `ACCESS_PASSWORD` set → login required; unset → open.

4. **Layout + theme + stores**: AppShell (sidebar+topbar), `stores/ui.ts` (timeRange/
   currency/mask/theme), theme provider (dark default), i18n zh.
   → verify: nav routes; theme toggle; time-range changes propagate.

5. **Shared components**: `StatCard`, `KpiStrip`, chart wrappers, `DataTable`, `lib/format`+`currency`.
   → verify: isolated render with sample props; currency/token toggle formats correctly.

6. **Pages** (in order, each consuming Query hooks): Overview → Usage Analytics →
   Models → Channels → Performance → Logs → Alerts.
   → verify per page: renders live data; filters/time-range/currency apply; empty/loading states.

7. **Logs**: TanStack table + URL-state filters (draft-then-apply) + details dialog
   (Token + Billing breakdown) + mobile cards.
   → verify: filter by model/channel/request_id/upstream_request_id; details dialog shows cache/billing.

8. **Polish + i18n pass + a11y basics**; remove old `web/src` sources once parity confirmed.
   → verify: `npm run lint` + typecheck + `npm run build` all pass.

9. **Deployment smoke**: build the Docker image; confirm Express serves `web/dist` on the single port.
   → verify: container serves the app + `/api` works.

## Validation commands

```sh
cd web
npm run lint
npm run build
npm run preview          # or: docker compose up --build  (root) for full smoke
```

## Risky files / rollback points

- Whole `web/` tree is replaced. Keep old sources in git history; the root `Dockerfile`
  build/copy step is unchanged, so rollback = revert the C3 commit.
- No backend files change in C3.
