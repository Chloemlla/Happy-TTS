# Frontend Development Guidelines

> Conventions for frontend development (Vite + React + TypeScript). Read before writing any frontend code.

---

## Stack (✅ decided, doc 05 §2 / D13)

**Vite + React + TS** · **Tailwind + shadcn/ui + Radix** · **TanStack Query** (server state) + **Zustand** (UI state) · WebSocket client (activity stream) · shared types/Zod from **`packages/shared`**.

## Pre-Development Checklist

Before writing frontend code, confirm:

- [ ] Cross-cutting types come from `packages/shared` (not redeclared locally).
- [ ] Server data goes through TanStack Query; live data through the WS hook — not duplicated into local state.
- [ ] New shared component/hook is justified (a second consumer exists), else keep it feature-local.
- [ ] Network/WS data is validated (Zod) before being treated as typed.
- [ ] No secret/token touches client storage or logs.

## Quality Check

Before marking work done (see [`quality-guidelines.md`](./quality-guidelines.md)):

- [ ] Lint + type-check green; strict TS, no `any`/unsafe casts.
- [ ] Scanned for the 7 code smells; none introduced.
- [ ] Tests pass (Vitest + RTL where applicable).

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Feature-based layout, naming | ✅ Filled |
| [Component Guidelines](./component-guidelines.md) | shadcn/Radix + Tailwind, props, a11y, real-time surfaces | ✅ Filled |
| [Hook Guidelines](./hook-guidelines.md) | TanStack Query, WS activity-stream hook | ✅ Filled |
| [State Management](./state-management.md) | Server vs live vs UI state | ✅ Filled |
| [Type Safety](./type-safety.md) | Shared types, Zod validation, forbidden casts | ✅ Filled |
| [Quality Guidelines](./quality-guidelines.md) | Forbidden/required patterns, 7 smells, tests | ✅ Filled (⏳ test setup to confirm) |

> ⏳ items are recommendations from `docs/design/05-tech-stack-and-conventions.md` to finalize before the relevant code lands.

---

**Language**: all documentation and code identifiers are in **English** (project language policy; conversational replies may be Chinese).
