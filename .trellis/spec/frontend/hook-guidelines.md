# Frontend Hook Guidelines

> Custom-hook and data-fetching conventions for `apps/web/`. Status: greenfield.

---

## 1. Data fetching: TanStack Query (✅ doc 05 §2)

- Server data is fetched/cached via **TanStack Query** — never hand-rolled `useEffect` + `fetch` for server state.
- Wrap each endpoint in a typed hook: `useSession(id)`, `useProjects()`. Query keys are stable, structured arrays (`['session', id]`).
- The fetcher uses the shared API client (`lib/`) and shared types (`packages/shared`).

## 2. Real-time: WebSocket activity stream

- A `useActivityStream(sessionId)` hook subscribes to the WS channel and feeds the live event stream.
- Reconcile WS events with Query cache where appropriate (e.g. invalidate/patch on completion) so there is one source of truth.
- Session activity SSE/WS handlers must validate frames with the shared `activityEventSchema`, upsert durable events into the `sessionActivity(sessionId)` query, and invalidate related Query keys from the event type rather than copying server state into component state:
  - `session_renamed`, `session_created`, `session_completed`, `session_canceled`, `session_failed` -> project threads.
  - `checkpoint_recorded` -> session checkpoints, session diff, and workspace content.
  - `diff_recorded` -> session diff and workspace content.
  - `sandbox_started` / `session_failed` -> session runtime.
- Run-live SSE handlers must validate frames with `supervisorRunLiveEventSchema`, patch the `sessionRuns(sessionId)` query, and limit sidebar/thread invalidation to run status/delivery/error boundaries so token-level streaming does not cause refetch storms.

## 3. Custom-hook patterns

- Name `useXxx`; one responsibility per hook; return a typed object.
- Hooks compose other hooks; keep side-effect logic inside hooks, not components.
- Extract a hook only when logic is reused or a component gets too busy (avoid premature abstraction).

## 4. Common mistakes to avoid

- Using `useEffect`+`fetch` for server state instead of TanStack Query.
- Putting non-stateful pure helpers in a hook (they belong in `lib/`).
- Unstable query keys (causes refetch storms).
