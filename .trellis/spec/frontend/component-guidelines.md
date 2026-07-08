# Component Guidelines

> How components are built in this project.

---

## Overview

All components are **function components written as arrow functions**, one per file,
**default-exported**. Styling is **100% inline Tailwind utility classes**. There is
**no `prop-types`, no TypeScript** — props are plain, destructured in the signature.

---

## Component Structure

Uniform file order:

1. Imports — React/router → `lucide-react` icons → `./api` → `./components/PageUI` → hooks
2. Module-level constant maps (`TYPE_MAP`, `COLORS`, `CHART_COLORS`, ...)
3. Helper formatters (`formatPercent`, `formatCurrency`, ...)
4. The component (arrow function)
5. `export default <Component>;`

```jsx
// web/src/Channels.jsx:14,238 (abridged)
const Channels = () => {
    const [overview, setOverview] = useState({ channels: [], statusCount: {}, total: 0 });
    // ...
    return ( /* JSX */ );
};
export default Channels;
```

Small **file-local presentational sub-components** are common and encouraged for
things used only within one page — e.g. `DashboardTooltip` (`Dashboard.jsx:56`),
`StatusIcon` (`ModelStatus.jsx:15`), `LogDetailsDrawer` (`LogsTable.jsx:23`).

---

## Props Conventions

- **Destructure props in the parameter signature with inline defaults.**
- **Icon components are passed as props** via the `icon: Icon` rename idiom.
- No `prop-types` — do not add them (none exist anywhere in `web/src`).

```jsx
// web/src/components/PageUI.jsx:112 (abridged)
export const StatCard = ({ icon: Icon, value, label, hint,
                           iconWrapperClassName = 'bg-slate-100',
                           valueClassName = 'text-slate-800', cardClassName = '' }) => (
    <div className={`bg-white p-5 rounded-xl border shadow-sm ${cardClassName}`}>
        <Icon className={iconClassName} /> {/* ... */}
    </div>
);
```

### Export style

- **Pages & most components**: `export default`.
- **`components/PageUI.jsx` is the exception**: it uses **named exports** for a
  library of small presentational pieces (`PageHeader`, `StatCard`, `PanelCard`,
  `FilterBar`, `TimeRangeTabs`, `EmptyState`, `LoadingState`, `FilterSelect`,
  `ChannelSelect`, `PaginationBar`). Reuse these before hand-rolling new markup.

---

## Styling Patterns

- **Tailwind utility classes inline in `className`.** No CSS modules or styled-components.
- **Conditional/dynamic classes via template literals:**
  ```jsx
  // web/src/Channels.jsx:219
  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
      parseFloat(ch.errorRate) > 5 ? 'bg-red-100 text-red-700'
      : parseFloat(ch.errorRate) > 1 ? 'bg-yellow-100 text-yellow-700'
      : 'bg-green-100 text-green-700'}`}>{ch.errorRate}%</span>
  ```
- `style={{}}` is used **only for computed values** (e.g. dynamic widths), not static styling.
- Icons come from `lucide-react` (named imports); charts from `recharts`. Brand color is cyan (`primary` scale in `tailwind.config.js`).

---

## Common Mistakes

- Reaching for a CSS file or inline `style` for something Tailwind classes already cover.
- Re-implementing a card/header/empty-state instead of importing it from `PageUI`.
- Adding `prop-types` or converting a file to a named export "for consistency" — the
  default-export + no-prop-types convention is deliberate here.
- Passing an icon as `<Icon/>` in JSX when the component expects the component ref via `icon={Icon}`.
