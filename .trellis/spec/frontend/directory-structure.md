# Frontend Directory Structure

> How `apps/web/` is organized. Status: greenfield — feature-based convention to follow; ⏳ marks details to confirm with real code.

---

## 1. Stack (✅ decided, doc 05 §2 / D13)

**Vite + React + TypeScript**; **Tailwind + shadcn/ui + Radix**. Real-time via a WebSocket client. Shared types/schema come from `packages/shared` (never redeclared locally).

## 2. Layout (⏳ feature-based)

```
apps/web/src/
├─ app/             # app shell, router, providers (Query/WS/theme)
├─ features/        # one folder per Code-mode surface (doc 02 §2.2)
│  ├─ session/         # conversation + supervisor plan/decisions
│  ├─ activity-stream/ # real-time supervisor↔CLI event stream (signature surface)
│  ├─ plan/            # plan / task-decomposition view
│  ├─ diff/            # diff view + file tree
│  ├─ run-panel/       # test/build/verify results
│  ├─ best-of-n/       # candidate comparison + adjudication
│  ├─ repo-connect/    # GitHub OAuth / PAT / repo picker
│  └─ model-config/    # cc/cx provider + model config (cc-switch-style)
├─ components/      # shared presentational components (shadcn/ui wrappers)
├─ hooks/           # cross-feature reusable hooks
├─ lib/             # pure client utilities (api client, ws client, formatters)
└─ types/           # local-only UI types (cross-cutting types live in packages/shared)
```

## 3. Module organization

- A feature owns its components, hooks, and local state; it imports shared UI from `components/` and shared types from `packages/shared`.
- Promote a component/hook to the top-level `components/`/`hooks/` only when a **second** feature needs it (avoid premature sharing → needless complexity).

## 4. Naming conventions

- Components: `PascalCase.tsx`. Hooks: `useCamelCase.ts`. Other files: `kebab-case.ts`.
- One component per file; co-locate its styles/tests beside it.

## 5. Common mistakes to avoid

- Redeclaring server DTOs locally instead of importing from `packages/shared` (causes front/back type drift).
- A "utils dumping ground" — keep `lib/` purpose-named.
