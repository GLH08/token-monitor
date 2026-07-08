# Directory Structure

> How frontend code is organized in this project (`web/`).

---

## Overview

The frontend is **Vite + React 19 in plain JavaScript (`.jsx`) — no TypeScript**.
Routed page components live **flat under `web/src/`**; shared UI lives in
`web/src/components/`; custom hooks in `web/src/hooks/`; all HTTP goes through a
single `web/src/api.js` module.

---

## Directory Layout

```
web/src/
├── main.jsx                # Entry: createRoot + <BrowserRouter><App/></BrowserRouter>
├── App.jsx                 # Auth gate + <Layout> + all <Route> declarations
├── api.js                  # Single API module (native fetch, bearer token, /api base)
├── index.css / App.css     # Tailwind directives + a little global CSS
├── Dashboard.jsx  Channels.jsx  Models.jsx  ModelStatus.jsx   # routed pages (flat)
├── Alerts.jsx  Errors.jsx  Performance.jsx  Tokens.jsx
├── CostTokenAnalysis.jsx  Login.jsx
├── components/             # Shared UI
│   ├── Layout.jsx          # App shell / nav
│   ├── PageUI.jsx          # Named-export presentational library (StatCard, PageHeader, ...)
│   ├── LogsTable.jsx       # NOTE: this is actually the routed /logs page
│   └── CustomDateTimePicker.jsx
└── hooks/                  # use* data hooks
    ├── useDashboardData.js  useChannels.js  useModelStatusData.js
    ├── useModelsAnalysis.js  useUsageAnalysis.js  usePaginatedData.js
```

---

## Module Organization

- **Routed pages** → flat files at `web/src/` root (one component per file).
- **Shared, reusable UI** → `web/src/components/`.
- **Data fetching / stateful logic** → `web/src/hooks/` (see [hook-guidelines](./hook-guidelines.md)).
- **All network calls** → `web/src/api.js`. Components/hooks import named fetchers
  from it; they never call `fetch` directly.

Routing is `react-router-dom` v6, declared centrally in `App.jsx` inside `<Layout>`:

```jsx
// web/src/App.jsx:84-96
<Routes>
  <Route path="/" element={<Dashboard />} />
  <Route path="/logs" element={<LogsTable />} />
  <Route path="/channels" element={<Channels />} />
  {/* ... */}
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

---

## Naming Conventions

- **Pages & components**: PascalCase `.jsx` (`Dashboard.jsx`, `Layout.jsx`).
- **Hooks**: camelCase `.js` with `use*` prefix (`useDashboardData.js`).
- **Plain modules**: camelCase `.js` (`api.js`).
- Imports are **relative paths only — no path aliases** (`'./api'`,
  `'./components/PageUI'`, `'../hooks/usePaginatedData'`).

---

## Known Inconsistency

`components/LogsTable.jsx` is a routed page (`/logs`) even though every other routed
page lives at `src/` root. Don't replicate this for new pages — put new routed pages
at `src/` root; keep genuinely shared UI in `components/`.
