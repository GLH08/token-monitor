# Type Safety

> Type safety patterns in this project.

---

## Overview

This is a **plain-JavaScript** codebase: **no TypeScript, no JSDoc types, no
`PropTypes`, no runtime schema validation** (no zod/yup). `@types/react` and
`@types/react-dom` are devDependencies purely for editor IntelliSense. "Type safety"
here means **defensive coding at each boundary**, not a type system — document and
follow that reality; do not introduce TypeScript or PropTypes as part of a normal change.

---

## Type Organization

There are no shared type definitions. API response shapes are implicit — known only
from `api.js` and how each call site consumes them. When you need to understand a
shape, read the fetcher in `web/src/api.js` and the consuming hook.

---

## Validation

No runtime validator. API results are guarded defensively at the point of use:

- **Coerce arrays before mapping:**
  ```jsx
  // web/src/hooks/useDashboardData.js:75-77
  const statsRows = Array.isArray(statsRes) ? statsRes : [];
  ```
- **Optional chaining + fallback for nested/optional fields:**
  ```jsx
  // web/src/App.jsx:26
  const enabled = config?.data?.enabled !== false;
  ```
- **Default object on empty/failed fetch** (so render never hits `undefined`):
  ```jsx
  // web/src/hooks/useModelsAnalysis.js:15
  setData(result || { models: [], summary: {} });
  ```
- **Small guard helper** — the closest thing to validation:
  ```jsx
  // web/src/hooks/useUsageAnalysis.js:4-9
  const ensureNoApiError = (value) => {
      if (value?.error) throw new Error(value.error);
      return value;
  };
  ```

---

## Common Patterns

**Multiple response envelopes coexist** and are disambiguated by hand at the call
site. Know which one an endpoint returns before consuming it:

- **Bare array** — `fetchStats`, `fetchAnalysis`, `fetchChannels`.
- **`{ success, data }`** — model-status endpoints; check `if (result.success) setData(result.data)`
  (`useModelStatusData.js:16`).
- **`{ error }` / `{ data | logs }`** — checked in `usePaginatedData.js:31-35`:
  ```jsx
  if (!result || typeof result !== 'object' || result.error) {
      throw new Error(result?.error || '获取数据失败');
  }
  const resData = result.data || result.logs || [];
  ```

---

## Forbidden Patterns

- **Do not add TypeScript, JSDoc `@type` annotations, or `PropTypes`** to fit a normal
  feature/fix — it would clash with the rest of the codebase. (Raise a migration
  separately if desired.)
- **Do not assume a response is an array/object without guarding** — coerce with
  `Array.isArray(...)`, optional chaining, or a default value, exactly as above.
- **Do not rely on an envelope shape you haven't confirmed** — endpoints differ
  (bare array vs `{ success, data }` vs `{ error }`).
