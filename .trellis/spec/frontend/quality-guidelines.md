# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

Quality is enforced by **ESLint (flat config) + the build**, plus consistency with
the established React patterns. There is **no test suite** on the frontend. Before
reporting UI work done, run `npm run lint` and `npm run build`, and verify the
affected screen in the browser via `npm run dev`.

---

## Tooling

- **ESLint — flat config** (`web/eslint.config.js`): `@eslint/js` recommended +
  `eslint-plugin-react-hooks` (flat) + `eslint-plugin-react-refresh` (vite). `dist`
  is ignored. One custom rule allows unused **capitalized/underscore** identifiers:
  ```js
  // web/eslint.config.js
  rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }] }
  ```
  So keep the react-hooks rules green (exhaustive deps, rules-of-hooks) and don't
  leave unused lowercase locals.
- **Vite** (`web/vite.config.js`): `@vitejs/plugin-react` + a dev proxy sending
  `/api` to the backend on `http://localhost:3002` (pairs with `api.js` `API_BASE = '/api'`).
- **Tailwind** (`web/tailwind.config.js`): content globs cover `./src/**/*.{js,jsx,...}`;
  `theme.extend` adds the `primary` cyan scale and custom shadows. PostCSS =
  `tailwindcss` + `autoprefixer`.
- **Commands**: `npm run dev` / `npm run build` / `npm run lint` / `npm run preview`.

---

## Required Patterns

- **All network calls go through `web/src/api.js`** (native `fetch` + bearer token +
  401 handling). Never import `axios` or call `fetch` directly.
- **Data fetching lives in `use*` hooks**, not inline in components (see
  [hook-guidelines](./hook-guidelines.md)).
- **Reuse `components/PageUI.jsx`** presentational pieces and **`usePaginatedData`**
  before hand-rolling equivalents.
- **Relative imports only** — no path aliases.
- **Guard API responses defensively** — see [type-safety](./type-safety.md).

---

## Forbidden / Avoid

- **`axios` or raw `fetch` in components/hooks** — use `api.js`. (`axios` is an unused
  dependency; do not start importing it.)
- **TypeScript / PropTypes / JSDoc types** in normal changes — this is a plain-JS codebase.
- **Global state libraries** — state is local + URL + events (see [state-management](./state-management.md)).
- **Unused lowercase variables / broken hook-deps** — they fail `npm run lint`.

---

## Testing Requirements

There is **no frontend test setup** (no vitest/jest/testing-library, no `test`
script). Verification is manual: `npm run lint`, `npm run build`, and a browser check
of the affected screen with `npm run dev`. Do not add a test framework as a side
effect of a feature change.

---

## Code Review Checklist

- [ ] `npm run lint` and `npm run build` pass; affected screen verified in the browser.
- [ ] Network calls go through `api.js`; no `axios`/raw `fetch` in components/hooks.
- [ ] Data fetching is in a `use*` hook with a cleanup/cancellation guard.
- [ ] API responses are guarded defensively (array coercion, optional chaining, default shape).
- [ ] Shared filter/window state is in the URL (`useSearchParams`), not duplicated in `useState`.
- [ ] Reused `PageUI` / `usePaginatedData` instead of re-implementing; styling is inline Tailwind.
