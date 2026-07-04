# Frontend Quality Guidelines

> Quality bar for `apps/web/`. Status: greenfield. Shares the project-wide 7-code-smell watch-list (see `../backend/quality-guidelines.md` §2).

---

## 1. Required patterns

- Server state via TanStack Query; live data via the WS hook — one source of truth (`state-management.md`).
- Shared types/Zod from `packages/shared`; validate network data at the boundary (`type-safety.md`).
- Accessible primitives (shadcn/ui + Radix); explicit typed `Props`.

## 2. Forbidden patterns

- ❌ `any`, unchecked `as`, `@ts-ignore` without justification.
- ❌ `useEffect`+`fetch` for server state.
- ❌ Server state duplicated into local state.
- ❌ Secrets/tokens in client logs or `localStorage` (auth handled via the backend; see doc 03 §6).
- ❌ Raw colors/spacing instead of theme tokens.

## 3. Code-smell watch-list

The same seven smells apply (Rigidity, Redundancy, Circular dependency, Fragility, Obscurity, Data clump, Needless complexity). Frontend-flavored examples: prop-drilling chains (rigidity), copy-pasted Tailwind class sets (redundancy), god-store/god-component (needless complexity), boolean-flag prop explosions (data clump). **Raise and fix on sight.**

## 4. Testing requirements

- ⏳ Component tests with **Vitest + React Testing Library**; cover stateful behavior and a11y-critical interactions.
- Test hooks' logic; mock the API/WS client.
- Prefer tests at interactive/user-visible boundaries. Delete pure mapper or
  label-format snapshots when they only restate stable implementation details.

## 5. Review checklist

- [ ] Lint + type-check green (Biome or ESLint+Prettier, doc 05 §6); strict TS.
- [ ] No `any`/unsafe casts; network data validated.
- [ ] Server vs UI state in the right home; no duplication.
- [ ] No secret in client storage/logs.
- [ ] Scanned for the 7 smells.
