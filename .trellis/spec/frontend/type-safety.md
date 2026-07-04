# Frontend Type Safety

> TypeScript conventions for `apps/web/`. Status: greenfield.

---

## 1. Shared types are the source of truth

- Cross-cutting types (DTOs, events, error codes) come from **`packages/shared`** — front and back import the same definitions, so the contract can't drift.
- Validate external/runtime data (API responses, WS frames) with **Zod** schemas from `packages/shared`; infer TS types from the schema (`z.infer`), don't write the type twice.
- `types/` in the web app holds **UI-only** types that never cross the wire.

## 2. Conventions

- `strict` tsconfig (with `noUncheckedIndexedAccess` recommended).
- Prefer inference; annotate public function signatures and component `Props`.
- Use discriminated unions for event/state variants (e.g. activity-stream event kinds) and exhaustive `switch`.

## 3. Forbidden patterns

- ❌ `any` (use `unknown` + narrowing).
- ❌ Non-null `!` and unchecked `as` casts to silence the compiler — validate or narrow instead.
- ❌ Redeclaring a server DTO locally.
- ❌ `@ts-ignore` without a one-line justification.

## 4. Common mistakes to avoid

- Trusting unvalidated JSON from the network as a typed object (parse with Zod first).
- Casting WS payloads with `as SomeType` instead of validating the discriminant.
