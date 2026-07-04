# Backend Logging Guidelines

> Structured logging conventions. Status: greenfield — ⏳ marks choices to finalize. **The "what NOT to log" section is security-critical** (doc 03 §6 threat model).

---

## 1. Placement (hard rule)

- Logging is **I/O** → it belongs at the edges: `adapters/` and `entry/`.
- `atoms/` must not log (they are pure). `usecases/` should not log directly — inject a `LoggerPort` from `contracts/ports` if a flow genuinely needs to emit an event, so the layer stays testable and pure-ish.
- The **activity stream** (supervisor↔CLI events shown in the UI) is a product event channel, not the same as ops logging — it flows through `contracts/events.ts` → Orchestrator → WS, and is persisted via the store adapter. Keep the two concerns separate.

---

## 2. Structured logging

- ⏳ Library: a structured JSON logger (e.g. `pino`); confirm Bun compatibility before adopting it.
- Every log line is structured with at least: `level`, `msg`, `sessionId`, `projectId`, `component` (e.g. `supervisor`, `model-gateway`, `sandbox-mgr`), and a correlation/`traceId`.
- Initialize the logger and tracing in `entry/` (composition root), inject downward as a port.

## 3. Levels

| Level | Use |
|---|---|
| `debug` | Local dev detail; off in normal runs |
| `info` | Lifecycle events: session start/stop, dispatch, verify result, branch/PR created |
| `warn` | Recoverable: CLI retry, failover triggered, context compaction |
| `error` | Failed operation needing attention: sandbox crash, upstream LLM error, broker failure |

---

## 4. What NOT to log (security-critical)

**Never** write any of these to logs (or to the activity stream, or to error contexts):

- ❌ Real **LLM API keys** / `Authorization` / `x-api-key` headers.
- ❌ **GitHub OAuth / PAT / Git App tokens** or any remote Git credential.
- ❌ Session-level tokens that map to real keys.
- ❌ Full request bodies/responses that may carry the above.
- ❌ Owner private source code beyond what's needed for a diff summary.

The Model Gateway and Git Credential Broker **must redact** before logging upstream errors. Treat any leak of the above as a security incident, not a cosmetic bug. This rule is also enforced in `quality-guidelines.md` §4.

---

## 5. What to log (useful events)

Session lifecycle, supervisor phase transitions (plan/dispatch/verify/iterate), CLI dispatch + outcome, verification pass/fail, best-of-N fan-out/adjudication, branch/PR creation, sandbox start/stop, quota/egress-policy hits.
