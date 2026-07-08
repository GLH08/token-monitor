# Hook Guidelines

> How hooks are used in this project.

---

## Overview

Data fetching is done with **custom `use*` hooks built on `fetch` + `useState` +
`useEffect`**. There is **no react-query or SWR**. Each data hook owns its loading
state, error handling, and (often) a polling interval and a cleanup guard.

---

## Custom Hook Patterns

- **`use*` prefix, camelCase `.js`** file under `web/src/hooks/`.
- Two declaration styles coexist — either is acceptable, match the neighbours:
  - `export function useDashboardData(period) { ... }` (`useDashboardData.js:14`)
  - `export const useChannels = () => { ... }` (`useChannels.js:4`)
- Hooks return an object: data fields plus `loading` and `refetch`/`error`.
- Wrap the fetch in `useCallback` (stable deps) and call it from `useEffect`.

```jsx
// web/src/hooks/useModelsAnalysis.js:5-28 (abridged)
export const useModelsAnalysis = (period, selectedChannel) => {
    const [data, setData] = useState({ models: [], summary: {} });
    const [loading, setLoading] = useState(true);
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await fetchModelsAnalysis({ start_ts, end_ts: now, channel_id: selectedChannel });
            setData(result || { models: [], summary: {} });   // default object on empty
        } catch (error) {
            console.error('Load data error:', error);
            setData({ models: [], summary: {} });             // reset to safe default on error
        } finally {
            setLoading(false);
        }
    }, [period, selectedChannel]);
    useEffect(() => { loadData(); }, [loadData]);
    return { data, loading, refetch: loadData };
};
```

---

## Data Fetching

- **Always go through the named fetchers in `web/src/api.js`** — never call `fetch`
  or `axios` directly from a hook/component. (`axios` is a dependency but is never
  imported; all requests use the `authFetch` wrapper in `api.js`.)
- On error: `console.error(...)` and reset state to a safe default shape so the UI
  never renders against `undefined`.

### Polling

Server data is refreshed by polling — `setInterval(fn, 30000)` with an
`clearInterval` cleanup. There is no WebSocket/SSE on the frontend.

```jsx
// web/src/hooks/useModelStatusData.js:52-56 (abridged)
const interval = setInterval(fetchOverview, 30000);
return () => { isMounted = false; clearInterval(interval); };
```

### Cleanup / race guards (pick one, stay consistent within a hook)

- `let isMounted = true; ... return () => { isMounted = false; }` (`useChannels.js`, `useModelStatusData.js`)
- `let cancelled = false; ... return () => { cancelled = true; }` (`useUsageAnalysis.js`)
- Monotonic ref for out-of-order responses — `useDashboardData.js:56-73`:
  ```jsx
  const requestId = latestRequestIdRef.current + 1;
  latestRequestIdRef.current = requestId;
  // ...after await...
  if (latestRequestIdRef.current !== requestId) return; // a newer request superseded this one
  ```

### Client-side caching

Some hooks cache responses with a TTL: `localStorage` (5-min TTL) in
`useDashboardData.js`, `sessionStorage` in `usePaginatedData.js`. Reuse this pattern
only where it already exists; don't add caching by default.

---

## Reusable Hook

`usePaginatedData(fetcher, initialFilters, options)` is a generic pagination hook —
returns `{ data, total, stats, page, setPage, loading, refreshing, error, filters,
handleSearch, handleResetFilters, totalPages }`. Use it for any new
paginated/filterable list instead of re-implementing paging:

```jsx
// web/src/components/LogsTable.jsx:189-195
} = usePaginatedData(fetchLogs,
    { channel_id: '', model_name: '', request_id: '', start_ts: '', end_ts: '' },
    { pageSize: 20, cacheKey: 'logs_cache' });
```

---

## Common Mistakes

- Introducing react-query/SWR/axios for one screen — stay with the `fetch` + hook pattern.
- Forgetting the `clearInterval` / cancellation guard, causing state updates after unmount.
- Not resetting to a default shape on error, letting the page render against `undefined`.
- Re-implementing pagination instead of using `usePaginatedData`.
