# Backend Development Guidelines

> Conventions for backend development in this project (Bun + TypeScript). Read before writing any backend code.

---

## ⭐ Start here: context-first atomic architecture (4+2)

All backend code under `apps/server/` and `packages/*` follows the **context-first atomic architecture: bounded contexts using a 4-layer dependency model + 2 horizontal zones**:

```
api → context/usecases|workflows|services → context/atoms
contracts (declarations) · adapters (the only I/O)
```

→ **Read [`directory-structure.md`](./directory-structure.md) first** — it is the authoritative, normative spec (bounded context ownership, layer responsibilities, dependency rules, I/O isolation, "where does my code go?" decision flow).

---

## Pre-Development Checklist

Before writing backend code, confirm:

- [ ] I know which **layer** my code belongs to (`directory-structure.md` §5 decision flow).
- [ ] Any I/O I need goes in `adapters/` behind a `contracts/ports` interface — not in usecases/api/atoms.
- [ ] I know the owning **bounded context** (`contexts/<context>`), and I am not importing private workflow/service code across contexts.
- [ ] I'm adding new behavior where that is clearer, or refactoring existing internals when that removes real duplication/obscurity.
- [ ] Shared orchestration stays in same-context `workflows/` or `services/`, not in cross-context usecase calls.
- [ ] I know the test I owe (atom = high-signal invariant/contract test when useful; usecase = mock-port).
- [ ] No secret (LLM key / Git token) will touch logs, the sandbox, or plaintext storage.

## Quality Check

Before marking work done, verify against [`quality-guidelines.md`](./quality-guidelines.md):

- [ ] Architecture invariants intact (one-way deps, I/O only in adapters).
- [ ] Scanned for the 7 code smells; none introduced.
- [ ] Required tests pass; lint + type-check green.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Repository Session Flow Contracts](./repository-session-flow-contracts.md) | Concrete API/env/secret/workspace/session/activity/diff contracts | Filled |
| [Directory Structure](./directory-structure.md) | **Context-first atomic 4+2 architecture** — bounded contexts, layers, deps, I/O isolation | ✅ Filled |
| [Quality Guidelines](./quality-guidelines.md) | Invariants, 7 code smells, testing, forbidden patterns | ✅ Filled |
| [Error Handling](./error-handling.md) | Error vocabulary, wrapping at boundaries, API error shape | ✅ Filled |
| [Database Guidelines](./database-guidelines.md) | Postgres store, typed SQL, access via ports | ✅ Filled |
| [Logging Guidelines](./logging-guidelines.md) | Structured logging, levels, **secret redaction** | ✅ Filled (⏳ lib to confirm) |

> ⏳ items are recommendations from `docs/design/05-tech-stack-and-conventions.md` to finalize before the relevant code lands. They are decisions, not blanks.

---

**Language**: all documentation and code identifiers are in **English** (project language policy; conversational replies may be Chinese).
