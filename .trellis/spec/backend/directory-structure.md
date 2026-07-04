# Backend Directory Structure — Context-First Atomic Architecture (4+2)

> **Authoritative, normative.** All backend code under `apps/server/` and `packages/*` follows this. This is the *code-organization* architecture (how source is layered), orthogonal to the *runtime-component* architecture in `docs/design/03-system-architecture.md` (which services exist at runtime). Each runtime component is built *from* these layers.
>
> Status: active. The codebase uses top-level `entry/`, `api/`, `contracts/`, and `errors/` plus bounded contexts under `contexts/`. Keep this file in sync as real modules land.

---

## 1. The model: bounded contexts + 4-layer dependency chain + 2 horizontal zones

```
        L1  entry/        ← single startup entry + composition root (assembly only)
         │
        L2  api/          ← protocol adapters (REST / WS / CLI / Webhook)
         │
        L3  usecases/     ← public application entrypoints
        L3b workflows/    ← private, context-local multi-step orchestration
        L3c services/     ← private, context-local application helpers
         │
        L4  atoms/        ← pure policies/parsers/decisions (no I/O)

   X1  contracts/   ← shared language: DTOs, error codes, ports, events, constants (declarations only)
   X2  adapters/    ← the ONLY place with I/O: DB / cache / MQ / HTTP / FS / SDK / model-service / git
```

Main chain compile-time dependency (one-way): **`api → context/usecases|workflows|services → context/atoms`**.
`contracts/` is depended on by everyone (declarations only). `adapters/` is wired in by `entry/` and reaches `usecases` **only through `contracts/ports`** -- never imported directly by `usecases`/`api`.

Use 4+2 as the dependency model, not as a mandatory horizontal-only directory shape. Janus groups backend code by bounded context to avoid rigidity from scattered edits, while preserving the same one-way dependency and I/O rules inside each context.

**First principle**: context ownership is the stable boundary; layers are the dependency safety rails inside that boundary. A private helper that belongs to one context should stay in that context, not be promoted into `_shared` or `contracts` just to satisfy a folder rule.

---

## 2. Directory layout (`apps/server/src/`)

```
apps/server/src/
├─ entry/
│  ├─ main.ts              # the single process entry
│  └─ composition-root.ts  # DI wiring: build adapters, inject ports into usecases
├─ api/
│  ├─ http/                # REST routes (Elysia/Hono)
│  ├─ ws/                  # WebSocket / SSE activity-stream endpoints
│  └─ error-map.ts         # internal error code → protocol error
├─ contracts/
│  ├─ ports/               # CliAdapterPort, ModelGatewayPort, RepoStorePort, GitCredsPort, ...
│  ├─ dto/                 # request/response/event types (shared with packages/shared where cross-cutting)
│  ├─ errors.ts            # error codes
│  └─ events.ts            # event definitions
├─ errors/
│  └─ janus-error.ts       # executable error class; not declarations-only contract code
└─ contexts/
   ├─ orchestrator/
   │  ├─ usecases/         # run/session lifecycle public entrypoints
   │  ├─ workflows/        # sandbox startup, run queueing, delivery/cancellation coordination
   │  ├─ services/         # lifecycle helpers with injected ports
   │  └─ atoms/            # pure queue/state/lifecycle decisions
   ├─ supervisor/
   │  ├─ usecases/         # supervisor-engine public entrypoints when needed
   │  ├─ workflows/        # private model/tool loop orchestration
   │  ├─ services/         # private tool execution helpers with injected ports
   │  └─ atoms/            # pure prompt, tool, CLI job, and discussion policy
   ├─ model-gateway/
   │  ├─ usecases/         # public provider/proxy entrypoints
   │  ├─ services/         # private provider health/failover helpers
   │  ├─ adapters/llm/     # upstream Anthropic/OpenAI-compatible HTTP I/O
   │  └─ atoms/            # pure provider ordering/model rewrite/token parsing
   ├─ sandbox/
   │  ├─ usecases/         # sandbox lifecycle policy
   │  ├─ adapters/docker/  # Docker I/O
   │  ├─ adapters/cli/     # Claude Code, Codex, tmux command execution I/O
   │  └─ atoms/            # pure sandbox policy and command/config construction
   ├─ git-broker/
   │  ├─ usecases/         # repository authorization policy
   │  ├─ adapters/git/     # git workspace/worktree/publish I/O
   │  ├─ adapters/github/  # GitHub API I/O
   │  └─ atoms/            # pure repo slug, branch name, diff parsing
   ├─ sessions/
   │  └─ usecases/         # session lifecycle and activity/diff flows
   ├─ projects/
   │  ├─ usecases/         # project connection/listing flows
   │  └─ atoms/            # public response shaping
   ├─ credentials/
   │  ├─ usecases/         # credential metadata flows
   │  └─ adapters/key-vault/
   └─ _shared/
      ├─ usecases/         # generic shared sub-usecases only
      └─ adapters/         # shared infrastructure adapters only
```

Do not recreate top-level `usecases/`, `atoms/`, or `adapters/` for new backend work. Add code to the owning `contexts/<context>/...` folder or create a new bounded context when the responsibility does not fit an existing one.

---

## 3. The layers in detail

### L1 — `entry/` (Entry Layer)
- The **single startup entry** + composition root. Process-level governance: config loading, **dependency assembly (DI)**, lifecycle, global exception capture, log/tracing init and routing.
- **Forbidden**: any business logic. Startup and runtime governance only.
- May depend on **everything** (for assembly only).

### L2 — `api/` (API / Transport Layer)
- The system's outward protocol adapter (HTTP / WS / CLI / Webhook): protocol codec, auth/gate, parameter validation, **error mapping** (internal error code → protocol error).
- **Forbidden**: any business rule / domain decision (branch decisions, state transitions, rule computation).
- May only call context usecase factories/functions; **must not orchestrate atoms directly**.

### L3 — `contexts/<context>/usecases/` (Public Application Entrypoints)
- Public application entrypoints called by `api/`, `entry/`, tests, or context composition.
- Owns: request-level orchestration, authorization/precondition checks, idempotency boundary, transaction boundary, and handoff into private workflows/services.
- Dependencies allowed: same-context `atoms/`, `workflows/`, `services/`, server `contracts/`, `errors/`, and carefully controlled `contexts/_shared/usecases/`.
- A public usecase may call same-context private workflows/services. It must not import another context's usecase/workflow/service directly.
- Public usecase→public usecase calls are discouraged because they blur ownership; prefer extracting the shared behavior into a same-context service/workflow, a pure atom, or a deliberately stable `_shared` helper.
- **Must not import `adapters/` directly** — external capability is injected via `contracts/ports`.

### L3b — `contexts/<context>/workflows/` (Private Workflow Helpers)
- Optional for large context-local flows that would otherwise make one usecase obscure or rigid.
- Workflow helpers are still usecase-layer code: they may compose atoms and injected ports, but they must not do I/O directly or import adapters.
- Workflows are private to their owning context. A usecase in another context must not import them; extract shared policy downward to atoms or a stable `_shared` usecase instead.

### L3c — `contexts/<context>/services/` (Private Application Services)
- Optional for context-local helper logic that is more than a pure atom but smaller than a workflow.
- Use services for repeated application behavior that needs injected ports, timestamps, id factories, or persistence updates, but does not define a public application entrypoint.
- Services are private to their owning context. Do not import another context's services; promote a cross-context need into a port/event/shared contract instead.
- Services must not import adapters directly and must not become a dumping ground for unrelated helpers.

### L4 — `contexts/<context>/atoms/` (Atomic Layer, pure only)
- Each atom is a **single-responsibility pure unit** (function / pure class / stateless).
- Atoms must: have **no I/O**, **no shared mutable state**, be unit-testable, be reusable.
- Atoms **may call atoms** (as long as they stay pure).
- A single atom's logic should usually be small enough to read in one screen. The old 80-line rule is a heuristic, not a correctness property. Cohesive policy modules may be larger when they remain pure, table-driven, and easier to read than scattered one-function files.

### X1 — `contracts/` (Contracts zone)
- The system's "shared language": DTOs / request-response types, error codes, **port interfaces (ports)**, event definitions, constants.
- **Declarations only, no implementation**; no business flow or I/O code.
- All layers may depend on `contracts/`, but only use its declarations. (Cross-cutting types shared with the frontend live in `packages/shared`; server-only contracts live here.)
- Executable classes/functions do not belong in `contracts/`. Put executable cross-cutting error helpers in `errors/` or a context-local atom, depending on scope.

### X2 — `contexts/<context>/adapters/` (Adapters / Infrastructure zone)
- The **only** place I/O may appear: DB / cache / MQ / HTTP / FS / third-party SDK / model-service / git.
- Provides external capability by **implementing `contracts/ports`**; assembled by `entry/` and injected into `usecases/`.
- May depend on `contracts/`, `errors/`, and optionally pure atoms.
- **Must not depend on `usecases/` or `api/`**, and must not carry business rules.

### Shared zones
- `contexts/_shared/usecases/` is for stable, protocol-free shared sub-usecases. Keep it small; if it starts carrying domain meaning, move that behavior into an owning context.
- `contexts/_shared/adapters/` is for infrastructure helpers reused by adapters, such as process runners or stores. Non-adapter code must not import it.
- `packages/shared` is only for cross-process/frontend DTOs, Zod schemas, constants, and inferred types. Server-only ports/events/errors stay in `apps/server/src/contracts`.

---

## 4. Hard rules (enforced)

1. **Compile-time deps are one-way**: `api → contexts/*/usecases|workflows|services → contexts/*/atoms`. `adapters` must not be imported by `usecases`/`workflows`/`services`/`api`; `entry` may depend on all (assembly only).
2. **No cross-layer calls**: except `entry`, no layer calls a more-outer layer's implementation.
3. **I/O isolation**: any network / DB / file / cache / queue access **must** be in `adapters/`. I/O appearing in `atoms` / `services` / `workflows` / `usecases` / `api` is a violation.
4. **Extension method**: prefer adding new atoms/usecases/workflows/services when behavior is genuinely new; refactor existing internals when it removes duplication, obscurity, or the wrong owner.
5. **Testing**: `atoms` must have unit tests; `usecases` must have use-case tests (mock ports); `api` does contract/route tests; `adapters` do integration tests (optional). See `quality-guidelines.md`.
6. **Context boundaries**: context-local workflows/services stay in their context. Cross-context reuse belongs in pure atoms, server contracts, ports/events, or carefully controlled `_shared` usecases.
7. **Contracts are declarations**: error code unions, port interfaces, event types, DTO declarations, and constants only.

---

## 5. "Where does my new code go?" — decision flow

```
Does it do I/O (DB/HTTP/FS/cache/subprocess/git)?
  └─ yes → contexts/<owner>/adapters/  (behind a contracts/ports interface)
  └─ no  → Is it a multi-step flow / orchestration / has a transaction or retry boundary?
            └─ yes → contexts/<owner>/usecases/ or workflows/ (compose atoms; inject ports)
            └─ no  → Does it need injected ports/time/id/state but is not a public entrypoint?
                      └─ yes → contexts/<owner>/services/
                      └─ no  → Is it pure, single-responsibility, reusable logic?
                                └─ yes → contexts/<owner>/atoms/
Is it a type / error code / port interface / event / constant?  → contracts/
Is it a route / WS handler / request validation / error mapping? → api/
Is it DI wiring / startup / lifecycle?                            → entry/
Is it an executable cross-cutting error helper/class?              → errors/
```

> Two atoms always passed together as parameters? That's a **data clump** — group them into a `contracts/dto` type. About to import an adapter from a usecase? Stop — define/inject a `contracts/ports` interface instead.

---

## 6. Mapping to runtime components (doc 03)

Runtime components (Orchestrator, Supervisor Engine, Model Gateway, Sandbox Manager, Git Credential Broker) map to bounded contexts under `contexts/`. See the mapping table in `docs/design/05-tech-stack-and-conventions.md` §5.1. Rule of thumb: a component's public application entrypoints are `usecases/`, private orchestration is `workflows/`, repeated injected helpers are `services/`, pure policy/decision logic is `atoms/`, I/O is `adapters/` behind `contracts/ports`, and transport is `api/`.

Orchestrator owns run/session lifecycle, sandbox startup/cleanup coordination, run queueing, queued-run delivery, cancellation registration, and lifecycle persistence. Supervisor owns the trusted agent loop surface: model turns, tool calls/results, prompt policy, tool input parsing, CLI job prompt policy, and group-discussion output policy. Do not put Orchestrator lifecycle code under `contexts/supervisor`.

---

## 7. Naming conventions

- Folders/files: `kebab-case`. Types/classes: `PascalCase`. Functions/vars: `camelCase`.
- Port interfaces end in `Port` (`CliAdapterPort`); their adapters are named by technology (`DockerSandboxAdapter`).
- One atom = one responsibility = one file (or a tight folder of closely-related pure functions).
- Context names use product/runtime language (`supervisor`, `model-gateway`, `sandbox`, `git-broker`, `sessions`, `projects`, `credentials`), not roadmap labels.
