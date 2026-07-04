# Backend Error Handling

> How errors are defined, propagated, and returned. Aligns with the atomic 4+2 architecture (`directory-structure.md`). Status: greenfield — conventions to follow; ⏳ marks choices to finalize with real code.

---

## 1. Where errors live per layer

| Layer | Responsibility |
|---|---|
| `contracts/errors.ts` | **Declare** error codes / typed error shapes (the shared vocabulary). Declarations only. |
| `atoms/` | Return typed results or throw pure domain errors; never log, never do I/O. |
| `usecases/` | Map low-level/port errors into domain outcomes; decide retry/iterate vs fail (the supervisor's iterate-on-verify-failure is a domain decision here). |
| `adapters/` | Catch raw external errors (DB driver, fetch, dockerode, GitHub SDK) and **wrap them into the port's declared error type** — callers never see a raw driver error. |
| `api/error-map.ts` | Map internal error codes → protocol errors (HTTP status / WS error frame). The **only** place internal→protocol translation happens. |
| `entry/` | Global last-resort handler: capture uncaught errors, log, exit/restart cleanly. |

---

## 2. Patterns

- **Typed over stringly**: domain errors carry a stable code from `contracts/errors.ts`, not just a message.
- **Wrap at the boundary**: adapters convert vendor errors to port errors so usecases stay vendor-agnostic (and the dependency direction holds).
- **No empty catch**: never swallow. Either handle (retry/fallback/translate) or rethrow with context.
- **No secrets in errors**: error messages/contexts must not include LLM keys, Git tokens, or request auth headers (see `logging-guidelines.md`). The Model Gateway / Git Broker must redact upstream errors before they propagate.
- **Result vs throw**: ⏳ pick one convention for expected/recoverable outcomes (e.g. a `Result<T, E>` type in `contracts/`) vs `throw` for truly exceptional cases — decide before the first usecases land, then keep it consistent.

---

## 3. API error response shape (⏳ to finalize)

A single envelope, validated by a shared Zod schema in `packages/shared`:

```jsonc
{ "error": { "code": "SANDBOX_START_FAILED", "message": "human-readable", "details": {} } }
```

WS/stream errors use the same `code` so the frontend can branch consistently. Finalize the field set when the API surface stabilizes.

---

## 4. Common mistakes to avoid

- Leaking a raw Postgres / fetch error to the client (skips error mapping, exposes internals).
- Doing error logging inside `atoms/`/`usecases/` (logging is I/O — keep it at adapters/entry edges or inject a logger port).
- Returning HTTP status codes from `usecases/` (that's `api/`'s job — keeps business layer protocol-free).
