# Backend Quality Guidelines

> Code-review standards and the quality bar for `apps/server/` and `packages/*`.
> Pairs with `directory-structure.md` (the context-first atomic 4+2 architecture). Status: active — these are the conventions every change is held to.

---

## 1. Architecture invariants (must hold on every change)

Restated from `directory-structure.md` §4 because a reviewer checks these first:

1. **One-way deps**: `api → context usecases/workflows/services → atoms`. `adapters` not imported by `usecases`/`workflows`/`services`/`api`; only `entry` may import across all for assembly.
2. **I/O only in `adapters/`**. Any DB/HTTP/FS/cache/queue/subprocess/git call elsewhere is a defect.
3. **Application-layer code reaches external capability only via `contracts/ports`** (constructor/factory injection), never a direct adapter import.
4. **`api` holds no business rules**; `entry` holds no business logic.
5. **Context privacy holds**: same-context private workflows/services may support public usecases; cross-context usecase/workflow/service imports are forbidden.
6. **Atoms are pure** (no I/O, no shared mutable state) and small enough to read/review as one responsibility.
7. **Extend or refactor deliberately**: add new atoms/usecases/workflows/services for new behavior; refactor existing internals when it removes duplication, obscurity, or the wrong owner.

A change breaking any invariant is fixed or explicitly justified in review — never merged silently.

---

## 2. Code-smell watch-list (raise immediately when spotted)

Whenever you write or review code, actively watch for these seven smells. **The moment you spot one, surface it and propose a fix** — don't let it merge.

| # | Smell | What it looks like here | Typical fix |
|---|---|---|---|
| 1 | **Rigidity** | A small change forces a cascade of edits across layers | Re-check dependency direction; push volatile logic behind a `contracts/ports` interface |
| 2 | **Redundancy** | The same logic duplicated across usecases/workflows/services/atoms | Sink to a same-context service/workflow, pure `atom/`, or carefully controlled `_shared/` helper |
| 3 | **Circular dependency** | Two modules import each other, or private context helpers leak across contexts | Extract the shared part down to `atoms/`, a port/event, or an owning-context service |
| 4 | **Fragility** | Editing one spot breaks unrelated features | Tighten layer boundaries; add tests at the seam |
| 5 | **Obscurity** | Intent unclear, tangled structure | Rename to intent; split; add a one-line "why" where non-obvious |
| 6 | **Data clump** | The same group of params travels together across signatures | Group into a `contracts/dto` type |
| 7 | **Needless complexity** | A sledgehammer for a nut; over-engineering | Delete speculative generality; solve the problem in front of you |

> Catching these early is cheaper than a refactor later.

---

## 3. Testing requirements per layer

| Layer | Required test | How |
|---|---|---|
| `atoms/` | High-signal unit/property tests for meaningful contracts | Pure in/out; no mocks needed (no I/O) |
| `usecases/` / `workflows/` / `services/` | **Application-layer tests (required for behavior)** | Mock the injected `contracts/ports`; assert orchestration/flow, not I/O |
| `api/` | Contract / route tests | Validate codec, validation, error mapping |
| `adapters/` | Integration tests (optional) | Hit a real/embedded dependency or `msw`-style mock (cf. cc-switch) |

Test runner: `bun test` / Vitest (see doc 05 §6).

### Higher-signal atom tests

For pure atoms with broad input space (parsers, normalizers, path policies,
security allow/deny policy, text transforms), prefer bounded property-based,
metamorphic, or differential tests over example-only tables. Do not keep a
unit test just because a pure function exists: if the test only snapshots a
stable implementation detail, static prompt wording, presentation label, or
one-line pass-through, delete it or cover the user-visible contract at a more
useful boundary.

**Contract**:
- Use `fast-check` with `bun:test` for generated checks.
- Keep generated tests deterministic and bounded: set a fixed `seed` and a
  small `numRuns` that is cheap in normal `bun test`.
- Preserve explicit regression examples for security boundaries, protocol
  examples, and bugs that need a readable named case.
- Keep low-volatility security defaults covered when a wrong value would be
  dangerous, for example sandbox hardening, egress policy, or secret handling.
- Use metamorphic assertions when an input transformation should preserve the
  result, for example normalization idempotence or line-order independence.
- Use differential assertions only when there is a real second oracle or shared
  contract, for example a server wrapper matching a shared policy.

**Good/base/bad cases**:
- Good: generated safe and unsafe shell command paths prove allow/deny
  invariants across many command lines.
- Base: one named example remains for a concrete path escape or secret path.
- Bad: a property that reimplements the production algorithm line-for-line and
  only proves the same code twice.

**Example**:

```typescript
const propertyOptions = { numRuns: 150, seed: 20260627 };

test("keeps normalization idempotent for generated input", () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 120 }), (input) => {
      const normalized = normalizeInput(input);

      expect(normalizeInput(normalized)).toBe(normalized);
    }),
    propertyOptions,
  );
});
```

--- 

## 4. Naming and comment hygiene

- File names, test names, comments, and docs should describe the behavior or responsibility they cover. Avoid internal roadmap labels, task names, implementation phases, or temporary shorthand when a product/domain name is available.
- Use comments only to explain a non-obvious why or boundary. Do not add comments that restate the code or memorialize planning context.

---

## 5. Forbidden patterns

- ❌ Importing `adapters/*` from `usecases/*` or `api/*`.
- ❌ Any I/O (fetch, db client, fs, child_process, redis, git) outside `adapters/`.
- ❌ Business branching / state transitions in `api/` or `entry/`.
- ❌ Importing another context's usecase/workflow/service directly.
- ❌ Promoting context-private helper logic into `_shared` before it is stable, generic, and protocol-free.
- ❌ Shared mutable module-level state in `atoms/`.
- ❌ **Any real LLM key / Git token written into the sandbox image, default env, or logs** (security-critical; see doc 03 §6 and `logging-guidelines.md`). Plaintext key storage anywhere is forbidden — use the encrypted key vault.
- ❌ Swallowing errors (empty catch) — see `error-handling.md`.

---

## 6. Review checklist (before approving a change)

- [ ] Dependency direction intact; no adapter leaks into usecases/api.
- [ ] All I/O lives behind a `contracts/ports` interface in `adapters/`.
- [ ] New behavior arrived in the correct context owner; refactors remove real duplication/obscurity rather than moving code around.
- [ ] Atoms are pure and small; application-layer code orchestrates via injected ports.
- [ ] Required tests present (atom unit / usecase mock-port).
- [ ] No secret touches logs, the sandbox, or plaintext storage.
- [ ] User-facing text, comments, file names, and test names use product/domain terms rather than roadmap shorthand.
- [ ] Scanned for the 7 smells; none introduced (or each flagged with a follow-up).
