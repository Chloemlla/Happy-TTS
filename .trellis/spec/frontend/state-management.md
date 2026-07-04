# Frontend State Management

> State conventions for `apps/web/`. Status: greenfield (✅ stack decided, doc 05 §2).

---

## 1. Three state categories — pick the right home

| Category | Tool | Examples |
|---|---|---|
| **Server state** | **TanStack Query** | sessions, projects, messages, diffs, verify results |
| **Live event state** | WS subscription (reconciled into Query) | activity stream, run-panel updates |
| **Local UI state** | **Zustand** (global UI) / `useState` (component-local) | selected candidate, panel open/closed, theme, draft input |

## 2. Rules

- **Do not copy server state into Zustand/`useState`.** Server data lives in the Query cache; components read it there. Duplicating it causes drift (a fragility smell).
- Promote local → global (Zustand) only when **multiple distant components** need it. Default to component-local.
- Derived state is computed at render (or `useMemo`), not stored.
- URL owns navigational state (selected session/project) where it should be shareable/bookmarkable.

## 3. Common mistakes to avoid

- A giant global store holding everything (needless complexity + re-render churn).
- Mirroring `useQuery` data into `useState` in an effect.
- Putting ephemeral UI flags into the server round-trip.
