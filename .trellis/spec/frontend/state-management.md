# State Management

> How state is managed in this project.

---

## Overview

State is **purely local** — `useState` inside components and custom hooks. There is
**no global state library and no Context/`useReducer`** (no Redux, Zustand, Jotai,
etc. — grep across `web/src` finds none). Cross-cutting concerns are handled with
two lightweight mechanisms: **the URL query string** and **browser events**.

---

## State Categories

| Category | How it's held |
|----------|---------------|
| **Local UI state** | `useState` in the component |
| **Server state** | Custom `use*` hooks (fetch + `useState`), refreshed by polling |
| **URL state** | `useSearchParams` — filters/time-window live in the query string |
| **Auth state** | `useState` in `App.jsx`, synced via `localStorage` + browser events |

---

## When to Use Global State

**Don't add a global store.** The established alternatives:

- **Shared filter/selection state → the URL** via `useSearchParams`, so views are
  linkable and survive reload:
  ```jsx
  // web/src/ModelStatus.jsx:23-26
  const [searchParams, setSearchParams] = useSearchParams();
  const timeWindow    = getSupportedWindow(MODEL_STATUS_TIME_RANGE_OPTIONS, searchParams.get('window'), '24h');
  const selectedModel = searchParams.get('model') || null;
  const selectedChannel = searchParams.get('channel_id') || '';
  ```
  Update it through the shared `updateUrlSearchParams` helper (`PageUI.jsx:46`).

- **Cross-component signals (like auth) → browser events**, not a provider (see below).

---

## Server State

Manual **polling**, not a cache library. Hooks call `api.js` fetchers on mount and on
a `setInterval` (30 s), with `clearInterval` cleanup. No WebSocket/SSE on the client
even though a `/realtime` endpoint exists. See [hook-guidelines](./hook-guidelines.md)
for the fetch/poll/cleanup patterns and the optional `localStorage`/`sessionStorage`
TTL caching.

---

## Auth State

Managed in `App.jsx` with three `useState` flags (`isAuthenticated`, `authEnabled`,
`authLoading`), the token stored in `localStorage` under `'access_token'`, and
cross-tab/cross-component sync via the native `storage` event plus a custom
`auth-changed` event:

```jsx
// web/src/App.jsx:53-62 (abridged)
window.addEventListener('storage', handleAuthChange);
window.addEventListener('auth-changed', handleAuthChange);
return () => {
    window.removeEventListener('storage', handleAuthChange);
    window.removeEventListener('auth-changed', handleAuthChange);
};
```

`api.js` owns the token and fires `auth-changed` on login/logout and on **any 401**
(it also clears the stored token), which drives `App.jsx` back to the login gate:

```jsx
// web/src/api.js (abridged)
export const notifyAuthChanged = () => window.dispatchEvent(new Event('auth-changed'));
// inside authFetch:
if (res.status === 401) { clearStoredToken(); notifyAuthChanged(); throw new Error('Unauthorized'); }
```

---

## Common Mistakes

- Adding Context/Redux/Zustand for state the URL or a hook already handles.
- Duplicating filter state in component `useState` when it belongs in `useSearchParams`
  (breaks linkability and the back button).
- Reading/writing the auth token directly instead of going through `api.js` (bypasses
  the 401 handling and the `auth-changed` event).
