# Repository Session Flow Contracts

> Concrete implementation contract for the GitHub -> workspace -> Claude Code session -> activity stream -> diff flow.

## Scenario: Repository Session Flow

### 1. Scope / Trigger

- Trigger: this flow introduces cross-layer API contracts, local encrypted secret storage, Git workspace I/O, Docker sandbox I/O, model-gateway proxying, SSE activity streaming, and frontend/server shared DTOs.
- Applies to `apps/server/`, `apps/web/`, and `packages/shared` when extending credential, project, session, activity, diff, sandbox, or model-gateway behavior.

### 2. Signatures

- `POST /api/credentials` stores one secret alias.
- `GET /api/credentials` returns credential metadata only.
- `POST /api/repositories/authorize` stores one repository authorization record through `RepoAuthorizationPort`.
- `POST /api/projects` clones or fetches one GitHub repo into a persistent workspace.
- `GET /api/projects` returns project metadata.
- `POST /api/sessions` starts one Claude Code sandbox session.
- `POST /api/sessions/:sessionId/instructions` dispatches one instruction and records a diff.
- `GET /api/sessions/:sessionId/activity` returns persisted events.
- `GET /api/sessions/:sessionId/activity-stream` streams activity events as SSE.
- `GET /api/sessions/:sessionId/diff` returns the recorded diff.
- `GET /api/projects/:projectId/threads` lists session summaries for the sidebar. It must query supervisor runs through session-scoped store reads for the project's sessions rather than decoding every persisted run row.
- `ALL /api/model-gateway/anthropic/*` proxies Anthropic-compatible requests using a session-scoped model gateway token.
- Docker Claude Code dispatch runs `claude --print --output-format stream-json --session-id <sessionId> ... -- <instruction>` inside the existing session sandbox, with typed launch options mapped by the adapter.
- Docker session startup passes the session-scoped model gateway token through the Docker process environment and `-e ANTHROPIC_API_KEY`, not as a literal command argument.

### 3. Contracts

- Credential request fields: `alias`, `kind` (`github_pat` or `llm_api_key`), `secret`.
- Credential response fields: `alias`, `kind`, `status`, `updatedAt`; never return `secret`.
- Repository authorization fields: `id`, `provider`, `owner`, `repo`, normalized `repoSlug`, `mode`, `status`, `authorizedAt`, optional `tokenAlias`. Default composition must use the durable Janus store, not a process-local in-memory adapter.
- Project request fields: `provider: "github"`, `owner`, `repo`, `gitCredentialAlias`.
- GitHub `owner` and `repo` must be path-safe GitHub identifiers. The normalized repo slug is lower-case `owner/repo` and must never contain traversal segments.
- Session request fields: `projectId`, `llmCredentialAlias`, optional `image`.
- Session IDs generated for real runtime sessions must be UUIDs because Claude Code's `--session-id` flag requires a UUID.
- The sandbox receives only the model session token produced by `issueModelSessionToken(deps, sessionId)`; it must never receive the real LLM credential value.
- The model session token is a random, short-lived capability. Persist only its SHA-256 hash plus `sessionId`, `issuedAt`, `expiresAt`, and optional `revokedAt`; never persist the plaintext token or derive the token from `sessionId`.
- The model session token maps to a real control-plane credential, so treat it as sensitive: it may be injected into the sandbox environment, but it must not appear in Docker command arrays, API responses, logs, activity events, or error contexts.
- The model-gateway adapter must resolve upstream URLs only from origin-relative request paths. Legacy fallback pins the upstream base URL to `https://api.anthropic.com`; configured provider routing may use only HTTP(S) upstream base URLs, preserves any configured path prefix, and rejects absolute URLs, protocol-relative paths, backslashes, control characters, or path-prefix escapes before attaching real provider auth.
- Activity event fields: `id`, `sessionId`, `sequence`, `type`, `level`, `message`, `timestamp`.
- Claude Code `stream-json` / Codex JSON stdout must be parsed into structured `cli_output` activity messages; do not persist one raw unbounded stdout blob when line-level JSON can be decoded.
- Diff fields: `sessionId`, `files[]`, `patch`, `updatedAt`.
- Thread summary fields: `sessionId`, `projectId`, `cli`, `title`, `status`, `runCount`, `updatedAt`. Sessions without runs use title `"New session"`, status `"idle"`, `runCount: 0`, and the session `startedAt`.
- Untracked files must be represented both in `files[]` and in `patch`; newly created files should not produce an empty diff body.
- Env keys: `JANUS_RUNTIME_MODE`, `JANUS_DATA_DIR`, `JANUS_DATABASE_URL`, `JANUS_SQLITE_PATH`, `JANUS_VAULT_KEY`, `JANUS_MODEL_GATEWAY_URL`, `JANUS_ACCESS_TOKEN`, `HOST`, `PORT`.
- Runtime data crossing frontend/backend must be parsed with schemas from `packages/shared`.

### 4. Validation & Error Matrix

- Missing or malformed JSON -> `VALIDATION_FAILED` / HTTP 400.
- Missing single-user token on protected `/api/*` route -> `UNAUTHORIZED` / HTTP 401.
- Missing model session token on `/api/model-gateway/anthropic/*` or `/api/model-gateway/openai/*` -> `UNAUTHORIZED` / HTTP 401.
- Invalid, missing, revoked, or expired model session token capability -> `UNAUTHORIZED` / HTTP 401.
- Absolute/protocol-relative/invalid Anthropic proxy path -> `MODEL_GATEWAY_FAILED` / HTTP 502, before any upstream fetch or real key header is created.
- Invalid GitHub owner/repo or workspace path escaping the workspace root -> `VALIDATION_FAILED` / HTTP 400.
- Missing credential alias -> `CREDENTIAL_NOT_FOUND` / HTTP 404.
- Missing project -> `PROJECT_NOT_FOUND` / HTTP 404.
- Missing session or diff -> `SESSION_NOT_FOUND` / HTTP 404.
- Schema-incompatible supervisor run rows for the requested session -> fail that run/thread response through the shared schema parser. Unrelated run rows must not be decoded for session-scoped run or thread listing.
- Store failures while listing project threads, such as database or connection errors -> propagate normally.
- Missing or invalid `JANUS_VAULT_KEY` during secret read/write -> `CONFIGURATION_REQUIRED` / HTTP 500.
- Invalid `JANUS_RUNTIME_MODE` -> `CONFIGURATION_REQUIRED` / HTTP 500 before `Bun.serve`.
- Git clone/fetch/diff failure -> `WORKSPACE_SYNC_FAILED` / HTTP 500.
- Docker start failure -> persist the session as `failed`, emit `session_failed`, then return `SANDBOX_START_FAILED` / HTTP 500.
- Claude Code dispatch failure -> `CLI_DISPATCH_FAILED` / HTTP 500.
- Anthropic upstream failure -> `MODEL_GATEWAY_FAILED` / HTTP 502.

### 5. Good/Base/Bad Cases

- Good: store GitHub PAT and LLM key aliases, connect a repo, start a session, stream events, dispatch one instruction, and fetch a diff without exposing real secrets to responses or sandbox config.
- Good: repository authorization survives process restart because the default port is wired to the Janus store.
- Good: `JANUS_RUNTIME_MODE=dev` starts the API with SQLite and local dev runtime adapters without requiring Docker or Postgres.
- Good: opening a newly created session calls the session-scoped run listing path and is not affected by unrelated orphan or historical supervisor run rows.
- Base: service starts without `JANUS_VAULT_KEY`; health/access still work, but credential read/write fails with `CONFIGURATION_REQUIRED`.
- Base: omitting `JANUS_RUNTIME_MODE` uses `release` only when `NODE_ENV=production`; otherwise it uses `dev`.
- Bad: passing a real LLM key or Git token into Docker env, Docker command args, API responses, logs, activity events, or frontend storage.
- Bad: requiring Docker or Postgres for basic local UI/API testing in dev mode.
- Bad: accepting `janus_session_<sessionId>` as authentication. The token prefix is only a namespace; the capability must match a stored hash and be within TTL.

### 6. Tests Required

- Atom tests: sandbox policy, session-scoped model gateway token shape/hash, git diff parsing.
- Shared usecase tests: issue a model session token, persist only the hash, resolve the token before TTL, and reject expired or session-id-derived tokens.
- API/usecase tests: repository authorization normalizes `owner/repo`, returns no token value, and default composition writes through the durable store port.
- Usecase tests: project thread listing queries runs only for project sessions, session run listing uses the session-scoped store method, and store failures for requested sessions still propagate.
- Entry tests: startup config validates `JANUS_RUNTIME_MODE` and composition selects SQLite/local dev adapters for `dev`, Postgres/Docker adapters for `release`.
- Usecase tests with mock ports: project connect uses Git credential alias, session start passes only a session-scoped gateway token to sandbox, dispatch records activity and diff.
- API smoke: credential -> project -> session -> dispatch -> activity -> diff using fake Git/Docker/CLI/model ports.
- Adapter tests: Claude Code Docker dispatch includes `--session-id <sessionId>` and separates instruction text after `--` so prompt text cannot be parsed as CLI flags.
- Adapter tests: model gateway rejects attacker-controlled absolute/protocol-relative paths without calling fetch; Docker startup command output does not include the model session token; Git workspace refuses paths outside the workspace root and includes untracked patches.
- Quality scans: no adapter imports from `api/`, `usecases/`, or `atoms`; no real secret literals in committed code.

### 7. Wrong vs Correct

#### Wrong

```ts
await docker.start({
  env: {
    ANTHROPIC_API_KEY: realLlmKey,
  },
});
```

```ts
new URL(request.path, "https://api.anthropic.com");
headers.set("x-api-key", realLlmKey);
```

```ts
["docker", "run", "-e", `ANTHROPIC_API_KEY=${modelSessionToken}`];
```

#### Correct

```ts
await sandboxSessionPort.startSessionSandbox({
  modelGatewayUrl,
  modelSessionToken: await issueModelSessionToken(deps, sessionId),
  hardening: buildSessionSandboxPolicy(),
});
```

```ts
const upstream = resolveAnthropicUrl(provider.upstreamBaseUrl, request.path);
headers.set(provider.authMode === "bearer" ? "authorization" : "x-api-key", realLlmKey);
```

```ts
await runProcess({
  command: ["docker", "run", "-e", "ANTHROPIC_API_KEY"],
  env: { ANTHROPIC_API_KEY: modelSessionToken },
});
```

The correct path gives the sandbox only a session-scoped gateway token. The model gateway maps that capability to the real key inside the trusted control plane.

## Scenario: Session Titles and Rename

### 1. Scope / Trigger

- Trigger: session titles are a cross-layer shared DTO/API/UI contract and are persisted as part of `SessionRecord`.
- Applies when changing session creation, supervisor-run session creation, project thread summaries, session rename API, or sidebar session list UI.

### 2. Signatures

- `SessionRecord.title?: string` stores the user-facing session title. The field is optional for compatibility with older stored sessions.
- `POST /api/sessions` creates an explicit empty session with `title: "New session"`.
- `POST /api/supervisor-runs` creates a new session when `sessionId` is omitted with `title: "New session"`; the first running supervisor workflow then calls `SupervisorModelPort.generateSessionTitle({ task, modelOverride?, signal? })` once before normal supervisor work and saves the generated title.
- `PATCH /api/sessions/:sessionId` accepts `{ title }` and returns `{ session }`.
- `GET /api/projects/:projectId/threads` returns each thread title from the session record, not from the latest supervisor run.
- Manual rename and first-run automatic naming both append a durable `session_renamed` activity event for the affected session.

### 3. Contracts

- Rename request fields: `title: string`, trimmed, non-empty, max 120 characters.
- Rename response fields: `session: SessionRecord`.
- Thread summary fields remain `sessionId`, `projectId`, `cli`, `title`, `status`, `runCount`, `updatedAt`.
- Session title is the source of truth for the sidebar label. Supervisor run task text must not overwrite it after the first supervisor-model title generation.
- Existing sessions without `title` display `"New session"` until explicitly renamed or recreated.
- Supervisor title generation belongs to first-run startup application logic behind `SupervisorModelPort`, not a supervisor tool and not a deterministic local prompt trimmer. The model prompt must require a concise few-word title and a title-only response.
- `session_renamed` activity events use the standard activity event fields (`id`, `sessionId`, `sequence`, `type`, `level`, `message`, `timestamp`) and are the realtime invalidation signal for thread/sidebar title refreshes. The session record remains the source of truth for the title.

### 4. Validation & Error Matrix

- Missing or malformed JSON on `PATCH /api/sessions/:sessionId` -> `VALIDATION_FAILED` / HTTP 400.
- Empty, whitespace-only, or overlong `title` -> `VALIDATION_FAILED` / HTTP 400 before the usecase persists.
- Missing session on rename -> `SESSION_NOT_FOUND` / HTTP 404.
- Store failure while saving a renamed session -> propagate normally through API error mapping; do not silently keep a stale frontend title.
- Activity event append failure after a saved rename -> propagate normally rather than silently losing the realtime invalidation contract.

### 5. Good/Base/Bad Cases

- Good: first supervisor run creates or claims a `New session`, asks the supervisor model for a concise title, saves it before normal supervisor work, and later runs in the same session leave that title unchanged.
- Good: sidebar Rename switches only the selected row label into an input, persists through `PATCH /api/sessions/:sessionId`, and refreshes TanStack Query state.
- Good: manual rename and automatic first-run naming both emit `session_renamed`, so an open session activity stream can invalidate project thread data without inventing frontend-only title state.
- Base: old stored sessions with no title render as `"New session"` and remain renameable.
- Bad: deriving `ThreadSummary.title` from the latest run task; this couples session identity to run history.
- Bad: adding a supervisor rename tool or letting model output repeatedly rename a session.
- Bad: duplicating session title state in frontend stores instead of reading it from project thread query data.

### 6. Tests Required

- Shared schema tests or usecase coverage: rename rejects empty/invalid titles through the shared schema/API boundary.
- Usecase tests: rename persists a new title through `SessionStorePort` and missing sessions fail with `SESSION_NOT_FOUND`.
- Usecase tests: manual rename appends a `session_renamed` activity event through `ActivityEventPort`.
- Orchestrator workflow tests: new supervisor-created sessions and user-created placeholder sessions receive a supervisor-model-generated title at first run startup, and same-session follow-up runs do not change it.
- Orchestrator workflow tests: first-run automatic naming appends `session_renamed`.
- Session thread tests: `buildThreadSummary` uses `session.title` even when the latest run has a different task.
- Frontend checks: rename mutation invalidates or updates the project thread query and does not mirror server state into a long-lived local store.

### 7. Wrong vs Correct

#### Wrong

```ts
const title =
  latest === undefined ? "New session" : deriveThreadTitle(latest.task);
```

```ts
supervisorTools.push({
  name: "rename_session",
  inputSchema: { title: "string" },
});
```

#### Correct

```ts
const session: SessionRecord = {
  id: sessionId,
  projectId: project.id,
  title: "New session",
  cli: "claude-code",
  status: "starting",
  modelGatewayUrl,
  startedAt,
};
```

```ts
return {
  ...thread,
  title: session.title ?? "New session",
};
```

The correct path makes session naming a session-owned source of truth, keeps one-time automatic naming outside the repeatable tool surface, and reserves later title changes for explicit user rename requests.

## Scenario: Supervisor Model Streaming and Run Live Updates

### 1. Scope / Trigger

- Trigger: supervisor model calls can stream provider output, persist incremental transcript state, publish ephemeral run-live events, and fall back to non-streaming calls when a model does not support streaming.
- Applies when changing `SupervisorModelPort`, supervisor model adapters, supervisor run transcript persistence, run live SSE, retry behavior, or frontend run query freshness.

### 2. Signatures

- `SupervisorModelPort.completeTurn(request)` accepts `onStreamEvent?: (event) => Promise<void> | void`.
- `SupervisorModelPort.generateSessionTitle({ task, modelOverride?, signal? })` returns a short session title generated by the supervisor model.
- `GET /api/sessions/:sessionId/runs-stream` streams `SupervisorRunLiveEvent` SSE frames with `event: run`.
- `SupervisorRunLivePort.publish({ type: "run_updated", sessionId, run })` broadcasts latest run state in-process; it is not a durable store.

### 3. Contracts

- Streaming requests must send provider-native `stream: true` when `onStreamEvent` is present and the selected model has no `streamingDisabledAt` marker.
- The adapter must aggregate streamed provider deltas back into the existing `CompleteSupervisorTurnResult` shape so the tool loop remains provider-agnostic.
- Supported normalized stream events are text delta/done and thought delta/done. Thought content may only come from provider-exposed reasoning/thinking summary fields.
- Incremental assistant/thought transcript entries use `status: "streaming"` while active and `status: "completed"` with `completedAt` when finalized.
- Unsupported streaming is model-scoped: save `streamingDisabledAt` and optional `streamingDisabledReason` on the exact provider model alias, then retry the same turn through the non-streaming path.
- Updating an unchanged model preserves its streaming-disabled marker; changing that model clears the marker. Updating other models must not clear unrelated markers.
- Retry attempts for supervisor model calls publish persisted `supervisor_model_retry` activity events before waiting for the next attempt.

### 4. Validation & Error Matrix

- Missing supervisor model port -> `CONFIGURATION_REQUIRED` / run failure.
- Missing supervisor model credential -> `CREDENTIAL_NOT_FOUND`.
- Upstream non-retryable streaming unsupported status (`400`, `404`, `405`, `415`, `422`) -> mark model streaming disabled and fall back to non-streaming.
- Upstream retryable failures (`429`, `5xx`, network before response) -> retry the model call up to 5 total attempts, with visible `supervisor_model_retry` activity events.
- Abort/cancellation -> do not retry; cancellation must stop promptly.
- Invalid non-streaming JSON or invalid streaming JSON -> `MODEL_GATEWAY_FAILED`, secret-redacted.

### 5. Good/Base/Bad Cases

- Good: OpenAI Chat Completions request includes `stream: true`, emits text/thought deltas into the run transcript, and returns final text/tool calls to the tool loop.
- Good: a model returning `400 stream not supported` is marked streaming-disabled once and later runs skip streaming for that model.
- Good: the frontend subscribes to `runs-stream` and patches TanStack Query run data directly from shared-schema-validated events.
- Base: providers without `onStreamEvent` callers use the existing non-streaming behavior.
- Bad: adding UI-only "streaming" status while the adapter still waits for `response.json()`.
- Bad: writing every token delta as a persisted activity event; run-live events are ephemeral, while retry/status activity remains durable.
- Bad: exposing private chain-of-thought not present in provider-safe summary fields.

### 6. Tests Required

- Adapter tests: streaming request body includes `stream: true`; SSE text/thought/tool-call deltas aggregate to the final `CompleteSupervisorTurnResult`.
- Adapter tests: unsupported streaming status records a model-scoped disabled marker and falls back to non-streaming.
- Orchestrator tests: streamed deltas persist one in-progress transcript entry and finalization does not duplicate the assistant message.
- Orchestrator tests: transient model failures emit `supervisor_model_retry` activity and retry up to 5 total attempts; aborts do not retry.
- Frontend checks: run SSE events validate with `supervisorRunLiveEventSchema` before patching the session-runs query.

### 7. Wrong vs Correct

#### Wrong

```ts
const payload = await response.json();
return extractSupervisorResult(provider, payload);
```

```ts
await appendSessionEvent(deps, {
  type: "cli_output",
  message: tokenDelta,
});
```

#### Correct

```ts
await supervisorFetch(url, {
  method: "POST",
  body: JSON.stringify({ ...body, stream: true }),
});
```

```ts
deps.supervisorRunLivePort.publish({
  type: "run_updated",
  sessionId: run.sessionId,
  run,
});
```

The correct path keeps provider streaming in the model adapter, normalized run state in the orchestrator, durable user-visible retry status in activity events, and live token updates out of the persisted activity log.

## Scenario: Workspace Git Source Control

### 1. Scope / Trigger

- Trigger: project workspaces expose local Git source-control state and actions through cross-layer HTTP/shared DTO contracts.
- Applies when changing project Git status, staging, unstaging, local commits, frontend Source Control UI, `GitSourceControlPort`, or `GitWorkspaceAdapter` local Git operations.

### 2. Signatures

- `GET /api/projects/:projectId/git/status` returns current local source-control state.
- `POST /api/projects/:projectId/git/stage` with `{ path }` stages one workspace-relative path.
- `POST /api/projects/:projectId/git/unstage` with `{ path }` unstages one workspace-relative path.
- `POST /api/projects/:projectId/git/stage-all` stages all workspace changes.
- `POST /api/projects/:projectId/git/commit` with `{ message }` commits currently staged changes and returns the new commit plus updated status.
- `GitSourceControlPort` owns these operations behind injected project records; subprocess Git I/O remains in `contexts/git-broker/adapters/git/`.

### 3. Contracts

- Status response fields:
  - `branch: string`
  - `stagedChanges: GitFileChange[]`
  - `changes: GitFileChange[]`
  - `clean: boolean`
- `GitFileChange` fields: `path`, optional `originalPath`, and `status` from the existing diff file status vocabulary (`added`, `modified`, `deleted`, `renamed`, `untracked`).
- Path request fields: `path: string`, non-empty, workspace-relative after normalization.
- Commit request fields: `message: string`, trimmed non-empty.
- Commit response fields: `commit: GitCommit` and `status: GitStatusResponse`.
- `GitCommit` may include `parentShas: string[]` when history is read through the Source Control panel. The Git adapter reads it from `%P`, shortens each parent to the UI/API short SHA length, and omits the field for root commits or legacy rows without parent data.
- Local commits use Janus identity: `user.name=Janus`, `user.email=janus@users.noreply.github.com`.
- Git command arguments must be passed as argv arrays, never shell-composed command strings.
- File operations must validate the normalized path stays inside `project.workspacePath` before invoking Git.
- No GitHub PAT is needed for these local operations, and no real Git token may be returned to the frontend or included in errors.

### 4. Validation & Error Matrix

- Missing project -> `PROJECT_NOT_FOUND` / HTTP 404 before any Git port call.
- Empty commit message -> `VALIDATION_FAILED` / HTTP 400 before any commit command.
- Empty or workspace-escaping path -> `VALIDATION_FAILED` / HTTP 400 before any Git command.
- Git status/stage/unstage/commit command failure -> `WORKSPACE_SYNC_FAILED` / HTTP 500 with a generic, secret-free message.
- Commit with no staged changes -> Git command failure mapped to `WORKSPACE_SYNC_FAILED`; the frontend should normally disable commit before this path.

### 5. Good/Base/Bad Cases

- Good: the Source Control sidebar loads status, stages one file, commits with a non-empty message, refreshes status, and shows the new commit without exposing any credentials.
- Good: the commit tree displays parent commit edges from `GitCommit.parentShas` and marks merge commits when more than one parent is present.
- Good: `git status --porcelain=v1 -z --untracked-files=all` parsing is pure atom logic; adapter code only performs Git subprocess I/O and path confinement.
- Base: a clean workspace returns empty staged/unstaged arrays and `clean: true`.
- Base: renamed porcelain entries preserve `originalPath` for future UI display even if the current UI only shows the new path.
- Bad: running `git add ${path}` through a shell string; this creates command-injection and path-parsing risk.
- Bad: implementing Git subprocess calls in API routes, usecases, or frontend hooks.
- Bad: adding destructive actions such as discard/reset without an explicit contract and confirmation policy.

### 6. Tests Required

- Atom tests: porcelain status parser splits staged, unstaged, untracked, and renamed records.
- Usecase tests with mock ports: missing project and empty commit message fail before the Git port is called.
- Adapter tests: status reads current branch plus porcelain output; stage/unstage/stage-all emit argv arrays; commit uses Janus identity; file paths cannot escape the workspace.
- Adapter tests: history parsing includes parent SHAs from `git log --format=%H%x1f%P...`.
- Frontend checks: Source Control mutations invalidate Git status, Git history, workspace tree, and workspace file queries after successful actions.
- Quality scans: architecture check must confirm Git I/O remains behind `GitSourceControlPort` in adapters.

### 7. Wrong vs Correct

#### Wrong

```ts
app.post("/api/projects/:projectId/git/stage", async (context) => {
  await Bun.spawn(["sh", "-c", `git add ${context.req.query("path")}`]);
});
```

```tsx
const [status, setStatus] = useState(await fetch("/git/status"));
```

#### Correct

```ts
const response = await manageGitSourceControl.stageFile(projectId, body.path);
```

```ts
await runGit(["add", "--", cleanPath], project.workspacePath, processRunner);
```

```tsx
const statusQuery = useGitStatusQuery(projectId);
const stageFile = useStageGitFileMutation(projectId);
```

The correct path keeps protocol parsing in `api/`, project lookup and validation in a usecase, Git subprocess I/O in the adapter, pure porcelain parsing in an atom, and frontend state in TanStack Query.

## Scenario: Release Blocker Safety Contracts

### 1. Scope / Trigger

- Trigger: release blockers around model-gateway capability lifetime, Docker/session teardown, Docker session egress, frontend access-token forwarding, subprocess hangs, and GitHub PR base branches.
- Applies when changing model session token issuance/resolution/revocation, sandbox hardening policy, sandbox teardown, worktree cleanup, process execution adapters, protected web/API requests, verification command execution, or GitHub pull-request creation.

### 2. Signatures

- `ModelSessionTokenPort.saveModelSessionToken(record)` stores `{ tokenHash, sessionId, issuedAt, expiresAt, revokedAt? }`.
- `ModelSessionTokenPort.getModelSessionTokenByHash(tokenHash)` returns a token record or `undefined`.
- `ModelSessionTokenPort.revokeModelSessionTokensForSession(sessionId, revokedAt)` marks all non-revoked capabilities for a session as revoked and returns the count.
- `issueModelSessionToken(deps, sessionId)` returns a plaintext session capability token once and stores only the hash.
- `issueSupervisorRunModelSessionToken(deps, sessionId)` issues the same hash-only session capability token with a run-scoped TTL.
- `resolveModelSessionToken(deps, token)` returns `sessionId` only for a stored, non-revoked, non-expired token hash.
- `SandboxSessionPort.stopSessionSandbox({ sandboxId })` removes a running session sandbox.
- `RunProcessRequest` supports optional `timeoutMs` and `signal`; `runProcess` returns exit code `124` on timeout and `130` on cancellation.
- `runProcess` inherits only the explicit process environment allowlist required for shell/Docker operation plus caller-provided `env` overrides; Janus control-plane env values are not inherited by default.
- `VerificationPort.runCommand({ sessionId, sandboxId, command })` passes a finite timeout to the process runner.
- `PullRequestPort.createPullRequest(...)` must read GitHub repository metadata and use `default_branch` as the PR base.
- `buildSessionSandboxPolicy()` returns the effective session sandbox policy, including `networkMode: "bridge"` and `egressAllowlist: ["host.docker.internal"]`.
- `SandboxEgressGuardPort.applyEgressGuard({ sandboxId, destinations })` returns runtime egress status `{ mode: "enforced" | "dev_noop", allowedDestinations[], detail, warning? }`.
- `SandboxEgressGuardPort.teardownEgressGuard({ sandboxId })` removes egress enforcement rules before the sandbox container is removed.
- `resolveServerStartupConfig(env)` computes `{ hostname, port, createServerOptions }`; no-token startup binds to loopback, and public binds require `JANUS_ACCESS_TOKEN`.
- Docker session startup adds `--add-host host.docker.internal:host-gateway` and passes the session-scoped model gateway token through process env, not command args.
- On Linux, Docker session startup reconciles workspace write access: it resolves the workspace dir's numeric owner and runs the container as that `uid:gid` (overriding the policy default) so the sandbox process and the host control-plane git operations share write access without hitting git "dubious ownership". If the workspace is owned by root (Janus runs as root), it instead `chown -R`s the workspace to the policy sandbox user and keeps `--user 10001:10001`. Non-Linux hosts keep the policy default because bind-mount permissions are not enforced there.
- `JANUS_REQUIRE_EGRESS_ENFORCEMENT` (bool, default off) makes `startSessionSandbox` fail closed: if the started container's runtime egress mode is not `enforced`, the partially-started container is torn down and startup fails with `SANDBOX_START_FAILED`. Wired from `resolveServerStartupConfig` -> `createServer({ requireEgressEnforcement })` -> `DockerSandboxSessionAdapter({ requireEnforcedEgress })`.

### 3. Contracts

- Default model session token TTL is short-lived: 15 minutes unless a test or composition explicitly overrides it. Supervisor runs use a longer run-scoped default TTL and must revoke the capability in `finally` when the run/candidate session ends.
- Token persistence is hash-only. Plaintext model session tokens must not be stored in the Janus store, API responses, activity events, logs, or error contexts.
- Direct supervisor runs must stop the session sandbox in `finally`; best-of-N candidate sessions must stop their candidate sandbox in candidate-level `finally`.
- Cleanup failures must not overwrite the already-persisted terminal run/session state. They should be isolated to the cleanup boundary and must not expose secrets.
- Empty sandbox hardening defaults to `networkMode: "none"` and no `egressAllowlist`.
- Session sandbox hardening defaults to `networkMode: "bridge"` plus `egressAllowlist: ["host.docker.internal"]` so Claude Code and Codex can reach the trusted control-plane Model Gateway through the session-token boundary.
- The session `egressAllowlist` is enforced on Linux by host firewall rules scoped to the sandbox container and the Model Gateway host:port. Non-Linux dev hosts must return runtime egress mode `dev_noop` with warning code `egress_enforcement_dev_noop`.
- Runtime snapshots include optional `egress` status. `mode: "enforced"` should not emit an egress warning; `mode: "dev_noop"` must emit a warning; missing egress status with an allowlist falls back to legacy `egress_allowlist_label_only`.
- Docker session startup must reject policies that cannot reach the local Model Gateway, including `networkMode: "none"` or a missing `host.docker.internal` allowlist.
- Protected API token comparison uses `crypto.timingSafeEqual` over fixed-length hashes. Empty/missing access token fails closed unless `allowDevWithoutToken` is explicitly enabled by loopback startup/test wiring.
- Frontend protected API/SSE calls use `VITE_JANUS_ACCESS_TOKEN` only as an in-memory build-time env value and send it as `x-janus-access-token`; do not write it to client storage or logs.
- CLI dispatch and verification commands must have finite process timeouts so a stuck CLI or shell command cannot hang the supervisor loop indefinitely.
- GitHub PR creation uses repository `default_branch`, not a hard-coded branch name.

### 4. Validation & Error Matrix

- Model session token missing on gateway route -> `UNAUTHORIZED` / HTTP 401.
- Model session token hash absent, revoked, or expired -> `UNAUTHORIZED` / HTTP 401.
- Docker session policy cannot reach `host.docker.internal` on the expected bridge path -> `SANDBOX_START_FAILED` / HTTP 500.
- Linux egress guard cannot inspect the container or apply firewall rules -> `SANDBOX_START_FAILED` / HTTP 500 and the partially-started container is removed.
- Egress guard teardown failure -> `SANDBOX_STOP_FAILED` / HTTP 500 at the adapter boundary after Docker removal is attempted.
- Docker session stop failure -> `SANDBOX_STOP_FAILED` / HTTP 500 at the adapter boundary; supervisor cleanup ignores it after persisting terminal state.
- Missing access token with public `HOST` binding -> `CONFIGURATION_REQUIRED` before `Bun.serve`.
- Verification process timeout -> result `exitCode: 124`; supervisor treats the command as failed verification output, not a hung loop.
- CLI process cancellation -> result `exitCode: 130`.
- GitHub repository metadata lookup fails before PR creation -> `PULL_REQUEST_FAILED` / HTTP 502.
- GitHub PR response missing `html_url` or `number` -> `PULL_REQUEST_FAILED` / HTTP 502.

### 5. Good/Base/Bad Cases

- Good: session startup issues a random `janus_session_*` token, stores only its hash with a 15-minute expiry, injects it through process env, and resolves it at the gateway before upstream auth is attached.
- Good: a supervisor run issues a run-scoped session capability token, completes/fails/max-exhausts, revokes all session capabilities, and removes the session sandbox.
- Good: session sandbox starts with `--network bridge`, `--add-host host.docker.internal:host-gateway`, and only session-scoped model gateway tokens in process env so the CLI can reach the local Model Gateway without receiving real keys.
- Good: on Linux, the Docker session adapter applies `DOCKER-USER` allow/reject rules so only the Model Gateway host:port is reachable, and removes those rules before `docker rm -f`.
- Good: on non-Linux dev, runtime snapshots expose `egress.mode: "dev_noop"` and warning `egress_enforcement_dev_noop`.
- Good: no access token starts only on loopback; public binds require `JANUS_ACCESS_TOKEN`, and token checks use timing-safe fixed-length comparison.
- Good: child processes inherit `PATH`/Docker client env only; `JANUS_ACCESS_TOKEN`, `JANUS_VAULT_KEY`, and other control-plane secrets are not inherited unless explicitly passed.
- Good: CLI JSON stdout creates multiple structured `cli_output` events instead of one raw blob.
- Good: empty sandbox starts with `--network none`; it remains the no-network inspection/template path.
- Good: a verification command that never exits is killed by the process runner and recorded as a failed verification result.
- Good: a repo with default branch `trunk` gets a PR body with `base: "trunk"`.
- Good: on Linux, a workspace cloned by a non-root host user (e.g. uid 1000) is mounted into a container started with `--user 1000:1000`, so the CLI worker can edit files and produce a non-empty diff.
- Good: with `JANUS_REQUIRE_EGRESS_ENFORCEMENT=1` on a non-Linux host, `startSessionSandbox` tears down the container and fails with `SANDBOX_START_FAILED` instead of running with `dev_noop` egress.
- Bad: `janus_session_${sessionId}` authenticates gateway traffic.
- Bad: leaving `sleep infinity` session containers or non-revoked model-session tokens after a supervisor terminal state.
- Bad: treating `egressAllowlist: ["host.docker.internal"]` alone as real network enforcement, omitting egress runtime status, or leaving firewall rules behind after sandbox teardown.
- Bad: comparing access tokens with `===` or allowing a no-token public bind by default.
- Bad: mounting a host-cloned workspace into a container hardcoded to a uid that does not own the workspace, so the CLI worker cannot write it and the run produces an empty diff.
- Bad: spreading `Bun.env` into every child process.
- Bad: storing raw `stream-json` stdout as one activity event blob when structured message lines are available.
- Bad: waiting on `process.exited` without timeout/cancel for CLI dispatch or verification.
- Bad: hard-coding `base: "main"` for every GitHub PR.

### 6. Tests Required

- Token usecase tests: hash-only persistence, short TTL, successful resolve before expiry, expired-token rejection, session-id-derived token rejection, and revoke-by-session rejection.
- Supervisor usecase tests: direct run calls token revoke and sandbox stop after success/failure; best-of-N candidates revoke and stop each candidate sandbox.
- Sandbox atom tests: session policy uses `bridge` with `host.docker.internal`; empty sandbox policy uses `none`.
- Sandbox adapter tests: session command uses `--network bridge` and `--add-host host.docker.internal:host-gateway`, command output does not contain the model token, policies that cannot reach the local gateway are rejected, Linux egress rules are applied/removed, non-Linux returns `dev_noop`, and stop removes the container with a bounded process timeout.
- Runtime snapshot tests: enforced egress has no egress warning; dev-noop egress includes `egress_enforcement_dev_noop`; stronger isolation warning remains.
- Process runner tests: timeout returns `124`; abort signal returns `130`; stdout/stderr are still drained; control-plane env is not inherited; explicit env overrides are passed.
- API/access tests: missing configured token fails closed, explicit dev mode allows loopback/test use, header/cookie tokens pass, wrong-length tokens reject without compare errors, and public no-token startup is refused.
- Activity tests: stream-json stdout lines produce separate structured `cli_output` messages; plain stdout remains a single bounded message.
- Verification adapter tests: Docker command shape and timeout propagation.
- Frontend tests or review checks: API and SSE paths both use `buildApiHeaders` so `VITE_JANUS_ACCESS_TOKEN` reaches protected routes.
- GitHub adapter tests: mock metadata `default_branch` and assert PR create payload uses it.

### 7. Wrong vs Correct

#### Wrong

```ts
const token = `janus_session_${sessionId}`;
```

```ts
command.push("--network", "bridge", "--label", "janus.egress-allowlist=github.com");
```

```ts
const [exitCode] = await Promise.all([process.exited]);
```

```ts
body: JSON.stringify({ head: branchName, base: "main" });
```

#### Correct

```ts
const token = await issueModelSessionToken(deps, sessionId);
```

```ts
try {
  await runSupervisorLoop(...);
} finally {
  await revokeModelSessionTokensForSession(deps, sessionId);
  await sandboxSessionPort.stopSessionSandbox({ sandboxId });
}
```

```ts
if (!canReachSessionModelGateway(request.hardening)) {
  throw new JanusError("SANDBOX_START_FAILED", "Docker session sandbox must allow access to the local Janus Model Gateway.", 500);
}
```

```ts
await runProcess({ command, timeoutMs: 10 * 60 * 1000 });
```

```ts
const base = await readDefaultBranch(request);
body: JSON.stringify({ head: branchName, base });
```

The correct path treats session gateway tokens as real capabilities, enforces session egress on Linux with an honest dev-noop status elsewhere, keeps long-running subprocesses bounded, and adapts PR creation to each repository.

## Scenario: Dev and Release Runtime Modes

### 1. Scope / Trigger

- Trigger: Janus has two runtime modes so contributors can test the UI/API locally without Docker or Postgres while release deployments keep the durable Postgres and Docker sandbox boundaries.
- Applies when changing server startup config, entry composition, store adapter selection, sandbox/CLI/verification adapters, env docs, or mode-sensitive tests.

### 2. Signatures

- `readServerStartupEnv(env)` reads `JANUS_RUNTIME_MODE`, `JANUS_DATA_DIR`, `JANUS_DATABASE_URL`, `JANUS_SQLITE_PATH`, `JANUS_ACCESS_TOKEN`, `JANUS_VAULT_KEY`, `JANUS_MODEL_GATEWAY_URL`, `JANUS_REQUIRE_EGRESS_ENFORCEMENT`, `HOST`, `PORT`, and `NODE_ENV`.
- `resolveServerStartupConfig(env)` returns `{ hostname, port, createServerOptions }` and sets `createServerOptions.runtimeMode` to `"dev"` or `"release"`.
- `CreateServerOptions.runtimeMode?: "dev" | "release"` controls the default adapter graph in `createServerPorts(options)`.
- `CreateServerOptions.sqlitePath?: string` configures the dev SQLite database path.
- `CreateServerOptions.databaseUrl?: string` configures the release Postgres connection string.
- `createServerPorts(options)` wires one store adapter to all Janus store ports and chooses runtime adapters by `runtimeMode`.

### 3. Contracts

- `JANUS_RUNTIME_MODE=dev` selects `SqliteJanusStoreAdapter(options.sqlitePath ?? join(dataDir, "janus.sqlite"))` plus local dev sandbox, CLI, interactive CLI, and verification adapters.
- `JANUS_RUNTIME_MODE=release` selects `PostgresJanusStoreAdapter(options.databaseUrl ?? "postgres://postgres:postgres@127.0.0.1:5432/janus")` plus Docker sandbox/session, Docker CLI, tmux, and Docker verification adapters.
- When `JANUS_RUNTIME_MODE` is omitted, `NODE_ENV=production` selects `release`; every other environment selects `dev`.
- `JANUS_DATA_DIR` defaults to `.janus-dev` and owns local workspaces, helpers, vault storage, and the default dev SQLite file path.
- `JANUS_SQLITE_PATH` is dev-mode storage configuration. Release mode must not use it as a fallback for Postgres.
- `JANUS_DATABASE_URL` is release-mode storage configuration. Dev mode must not require it for health, project listing, or basic UI/API testing.
- Explicit port overrides in `CreateServerOptions` still win over mode defaults. Tests may inject fake ports without changing runtime mode.
- Mode selection belongs in `entry/startup-config.ts` and `entry/composition/ports.ts`. Usecases, workflows, services, atoms, and API handlers must depend on ports only.

### 4. Validation & Error Matrix

- `JANUS_RUNTIME_MODE` is neither `dev` nor `release` -> `CONFIGURATION_REQUIRED` / HTTP 500 before `Bun.serve`.
- Public `HOST` binding without `JANUS_ACCESS_TOKEN` -> `CONFIGURATION_REQUIRED` / HTTP 500 before `Bun.serve`.
- Dev mode with no Docker or Postgres installed -> startup and store-backed UI/API flows use SQLite/local dev adapters, not Docker/Postgres.
- Release mode with missing or unreachable Postgres -> store-backed routes fail at the Postgres adapter boundary; do not silently fall back to SQLite or in-memory persistence.
- Release mode with Docker sandbox startup failure -> persist the session as `failed`, emit `session_failed`, then return `SANDBOX_START_FAILED` / HTTP 500.
- Dev mode sandbox/CLI/verification execution -> return local dev results with runtime `local_dev` / egress `dev_noop`, not fake Docker command output.

### 5. Good/Base/Bad Cases

- Good: a contributor runs the server without `JANUS_RUNTIME_MODE`, Docker, or Postgres; startup defaults to dev, stores data in `.janus-dev/janus.sqlite`, and local dev adapters make session flows observable.
- Good: a release deployment sets `JANUS_RUNTIME_MODE=release` and `JANUS_DATABASE_URL`; all Janus store ports share the Postgres adapter and sandbox work uses Docker boundaries.
- Good: a composition test passes `sqlitePath: ":memory:"` with `runtimeMode: "dev"` and verifies the durable store port behavior without starting Docker.
- Base: `NODE_ENV=production` with no explicit runtime mode selects release and therefore expects release dependencies.
- Bad: a usecase checks `process.env.JANUS_RUNTIME_MODE` to skip work or choose a persistence implementation.
- Bad: release startup catches a Postgres error and silently creates a SQLite store.
- Bad: dev mode returns Docker-shaped command arrays that imply real sandbox isolation when execution was skipped.

### 6. Tests Required

- Startup config tests: explicit `dev`, explicit `release`, omitted mode with and without `NODE_ENV=production`, invalid mode error, and public bind token enforcement.
- Composition tests: dev mode uses SQLite and local dev runtime adapters; release mode uses Postgres and Docker runtime adapters; explicit port overrides still win.
- Store adapter tests: SQLite supports the same Janus store port surface needed by dev UI/API flows, including project/session persistence, activity sequence allocation, model gateway routing, model-session tokens, runtime snapshots, approval requests, supervisor runs, and repository authorization.
- Regression tests: dev mode session startup emits `local_dev` runtime snapshots with `dev_noop` egress and no Docker dependency.
- Quality gates: `bun run lint`, `bunx tsc -b`, `bun run --cwd apps/server test`, `bun run --cwd apps/web typecheck`, and `bun run --cwd apps/web build`.

### 7. Wrong vs Correct

#### Wrong

```ts
const storeAdapter = new PostgresJanusStoreAdapter(databaseUrl);
```

```ts
if (process.env.JANUS_RUNTIME_MODE === "dev") {
  return skippedSessionResult;
}
```

#### Correct

```ts
const storeAdapter =
  runtimeMode === "release"
    ? new PostgresJanusStoreAdapter(databaseUrl)
    : new SqliteJanusStoreAdapter(sqlitePath);
```

```ts
await createSessionUsecase({
  sessionStorePort,
  sandboxSessionPort,
  cliSessionPort,
});
```

The correct path keeps runtime-mode branching in entry composition, preserves the same usecase contracts in both modes, and makes dev convenience explicit instead of weakening release boundaries.

## Scenario: Janus Store Release Postgres Persistence

### 1. Scope / Trigger

- Trigger: release mode uses Postgres persistence for projects, sessions, activity, supervisor runs, model gateway routing, runtime state, model-session tokens, and repository authorization.
- Applies when changing `contexts/_shared/adapters/store/postgres/*`, store port signatures, default composition wiring, schema initialization/migrations, or data retention behavior.

### 2. Signatures

- Release composition creates `PostgresJanusStoreAdapter(databaseUrl)` and injects that same adapter for all Janus store ports unless a test or caller overrides a specific port.
- `JANUS_DATABASE_URL` configures the release control-plane Postgres connection string. When omitted in release mode, Janus defaults to `postgres://postgres:postgres@127.0.0.1:5432/janus`.
- `PostgresJanusStoreAdapter(databaseUrl, now?)` implements `ProjectStorePort`, `SessionStorePort`, `ActivityEventPort`, `SupervisorRunStorePort`, `ModelGatewayStorePort`, `ModelSessionTokenPort`, `RuntimeStatePort`, and `RepoAuthorizationPort`.
- Tables: `projects`, `sessions`, `session_diffs`, `runtime_snapshots`, `approval_requests`, `activity_events`, `activity_event_sequences`, `supervisor_runs`, `model_providers`, `active_model_gateway_routes`, `model_provider_health`, `model_session_tokens`, and `repo_authorizations`.

### 3. Contracts

- The adapter lazily initializes the schema on first store use, so `/api/health` and access checks do not require an immediate database connection.
- Each aggregate has its own table. Stable lookup/order fields are scalar columns; nested records are stored as `jsonb` in `body` and decoded with shared Zod schemas on read.
- Indexed access paths include project repo slug, session start time, approval request session/request time, activity event session/sequence, model provider priority/name, model session token session/expiry, and repository authorization id.
- `activity_events` must enforce unique `(session_id, sequence)` values. `nextSequence(sessionId)` allocates sequence numbers through the `activity_event_sequences` table with one Postgres upsert/returning statement, not `MAX(sequence)` read-then-return.
- Model-session tokens store only `token_hash`, `session_id`, `issued_at`, `expires_at`, and nullable `revoked_at`. Expired tokens are pruned during token save/read paths.
- Repository authorization persists in Postgres in release mode. Do not reintroduce a process-local default authorization adapter.
- The legacy single-file `store.json` adapter is not a supported default persistence path.
- SQLite is supported only for dev-mode local testing and must not become the release fallback when Postgres is missing or unreachable.

### 4. Validation & Error Matrix

- Malformed JSON `body` or schema-incompatible records -> the adapter read fails through the shared schema parser; callers must treat this as store corruption, not silently drop records.
- Duplicate activity event `session_id` + `sequence` -> Postgres constraint failure; fix the caller/sequence allocation rather than overwriting an event.
- Expired model-session token lookup -> return `undefined` after pruning expired token rows.
- Revoked model-session token lookup -> return the stored row with `revokedAt`; gateway resolution rejects it at the token usecase boundary.
- Missing/unreachable Postgres service in release mode -> store-backed routes fail at the adapter boundary; fix deployment configuration rather than falling back to SQLite or a process-local store.

### 5. Good/Base/Bad Cases

- Good: restart a release-mode server with the same `JANUS_DATABASE_URL`; projects, sessions, model gateway route, repo authorization, runtime state, and supervisor runs survive in Postgres.
- Good: background activity appends and HTTP reads operate against per-record Postgres writes rather than a whole-file read-modify-write cycle.
- Good: concurrent `nextSequence("session-1")` calls allocate `0..n` without duplicates.
- Base: an expired model-session token may remain until the next save/read sweep; the next token access prunes it.
- Bad: a store adapter reads the full persisted state into memory, mutates arrays, and rewrites one `store.json` file.
- Bad: `nextSequence` calculates `MAX(sequence) + 1` outside a database write; two callers can allocate the same sequence.
- Bad: release mode falls back to `.janus-dev/janus.sqlite` because Postgres was not reachable.
- Bad: a usecase imports `postgres`, `drizzle`, or any database client directly.

### 6. Tests Required

- Adapter tests: records persist across two `PostgresJanusStoreAdapter` instances using the same database.
- Adapter tests: multiple record writes keep all records and do not rely on whole-store rewrite semantics.
- Adapter tests: `nextSequence` allocates unique contiguous sequences for the same session through multiple adapter instances.
- Adapter tests: expired model-session tokens are pruned and revoke-by-session returns the changed row count.
- Adapter tests: repository authorization is stored in the `repo_authorizations` table and validates through the shared schema.
- Quality gates: `bun run lint`, `bun run arch:check`, `bun run typecheck`, `bun test`, and `bun run build`.

### 7. Wrong vs Correct

#### Wrong

```ts
const latest = await store.listEvents(sessionId);
return latest.length;
```

```ts
await writeFile("store.json", JSON.stringify({ ...wholeStore, events }));
```

#### Correct

```ts
await sql`
  INSERT INTO activity_event_sequences (session_id, next_sequence)
  VALUES (${sessionId}, 1)
  ON CONFLICT (session_id) DO UPDATE
  SET next_sequence = activity_event_sequences.next_sequence + 1
  RETURNING next_sequence - 1 AS sequence
`;
```

```ts
const storeAdapter = new PostgresJanusStoreAdapter(databaseUrl);
```

The correct path keeps persistence I/O inside `_shared/adapters/store/postgres`, preserves existing store ports for usecases, and makes Postgres the MVP system of record.

## Scenario: Runtime Safety and Approval Observability

### 1. Scope / Trigger

- Trigger: M5 adds runtime observability and approval state across shared DTOs, HTTP routes, runtime-state persistence, sandbox/session/supervisor usecases, and frontend server state.
- Applies when changing sandbox hardening snapshots, session runtime health, approval request lifecycle, or the runtime safety UI.

### 2. Signatures

- `GET /api/sessions/:sessionId/runtime` returns session runtime health, optional runtime snapshot, and approval requests for one session.
- `GET /api/sessions/:sessionId/approval-requests` lists approval requests for one session.
- `POST /api/sessions/:sessionId/approval-requests` creates one pending approval request.
- `POST /api/sessions/:sessionId/approval-requests/:approvalRequestId/approve` approves one pending request.
- `POST /api/sessions/:sessionId/approval-requests/:approvalRequestId/deny` denies one pending request.
- `RuntimeStatePort` owns `saveRuntimeSnapshot`, `getRuntimeSnapshot`, `saveApprovalRequest`, `getApprovalRequest`, and `listApprovalRequests`.
- Sandbox startup usecases record a runtime snapshot immediately after the sandbox starts and before emitting `sandbox_started`.

### 3. Contracts

- Runtime snapshot fields: `sessionId`, `sandboxId`, `runtime: "docker"`, `hardening`, `isolation[]`, `warnings[]`, `recordedAt`.
- Isolation entries must report hardened Docker as `active`; gVisor and Firecracker must be reported as `not_configured` or `unavailable` until a real runtime integration exists.
- Runtime warnings are policy metadata only. They must not include real LLM keys, Git tokens, model session token values, raw Docker output, request headers, or private source.
- Runtime health fields: `sessionId`, `sessionStatus`, `status`, `failureCount`, optional `latestFailure`, `policyWarningCount`, `pendingApprovalCount`, `updatedAt`.
- Runtime health status values are `not_started`, `healthy`, `warning`, `failed`, and `completed`. A completed session reports `completed` even when policy warnings remain; clients should read `policyWarningCount` and `snapshot.warnings` for warning detail.
- Approval request fields: `id`, `sessionId`, `source`, `actionKind`, `riskLevel`, `title`, `description`, `status`, `requestedAt`, optional `decidedAt`, optional `decisionNote`.
- Approval lifecycle is `pending -> approved` or `pending -> denied`. Terminal states are immutable.
- Approval decisions record `decidedAt`; `decisionNote` is optional and must be user/operator text, not raw command output or secrets.
- Frontend runtime data must flow through TanStack Query and parse responses with `packages/shared` runtime schemas.

### 4. Validation & Error Matrix

- Missing or malformed approval payload -> `VALIDATION_FAILED` / HTTP 400.
- Missing session on runtime or approval routes -> `SESSION_NOT_FOUND` / HTTP 404.
- Missing approval request or request belonging to another session -> `APPROVAL_REQUEST_NOT_FOUND` / HTTP 404.
- Approving or denying a non-pending request -> `APPROVAL_REQUEST_ALREADY_RESOLVED` / HTTP 409.
- Sandbox startup failure -> no runtime snapshot is recorded; persist the session as `failed`, emit `session_failed`, then return `SANDBOX_START_FAILED` / HTTP 500.

### 5. Good/Base/Bad Cases

- Good: a session starts, stores one runtime snapshot with effective hardening policy, returns runtime health, creates an approval request, approves it once, and rejects a second terminal decision.
- Base: a session exists before sandbox startup completes; runtime health returns `not_started` with no snapshot.
- Bad: claiming gVisor or Firecracker is active when local Docker is the only configured runtime, or storing raw CLI/Docker output in approval descriptions.

### 6. Tests Required

- Atom tests: runtime snapshot serialization, honest isolation status, warning derivation, approval state transition immutability, and health status derivation.
- Usecase tests with mock ports: create/list/approve/deny approval requests, missing session/request errors, and runtime response aggregation from session, events, snapshots, and approvals.
- API smoke tests: runtime and approval routes parse shared schemas, terminal approval decisions return `APPROVAL_REQUEST_ALREADY_RESOLVED`, and runtime responses never expose secrets.
- Frontend checks: runtime panel consumes `sessionRuntimeResponseSchema`, invalidates the runtime query after session/run start and approval decisions, and does not duplicate server state in local state.

### 7. Wrong vs Correct

#### Wrong

```ts
await runtimeStatePort.saveRuntimeSnapshot({
  runtime: "firecracker",
  warnings: [],
});
```

```ts
await runtimeStatePort.saveApprovalRequest({
  status: "approved",
  description: rawCliOutput,
});
```

#### Correct

```ts
await runtimeStatePort.saveRuntimeSnapshot(
  buildSessionRuntimeSnapshot({
    sessionId,
    sandboxId,
    hardening: buildSessionSandboxPolicy(),
    recordedAt,
  }),
);
```

```ts
await runtimeStatePort.saveApprovalRequest(
  transitionRuntimeApprovalRequest({
    approvalRequest,
    status: "approved",
    decidedAt,
    note,
  }),
);
```

The correct path records the effective Docker hardening policy honestly, keeps terminal approval decisions immutable, and exposes runtime state through shared schemas without leaking control-plane credentials.

## Scenario: Model Gateway Provider Routing

### 1. Scope / Trigger

- Trigger: M3 adds control-plane provider routing for Supervisor, Claude Code, and Codex model traffic across shared DTOs, HTTP routes, Janus store persistence, model-gateway usecases, upstream HTTP adapter behavior, and frontend server state.
- Applies when changing provider config, provider test calls, active model route selection, Anthropic/OpenAI proxy routing, failover policy, provider health, supervisor model wire APIs, or model-gateway UI behavior.

### 2. Signatures

- `GET /api/model-gateway/providers` returns configured provider records.
- `POST /api/model-gateway/providers` creates or updates one provider record.
- `POST /api/model-gateway/providers/test` verifies submitted provider settings by making one minimal upstream model call without saving a new provider or returning upstream response content.
- `DELETE /api/model-gateway/providers/:providerId` deletes one provider record and associated provider state.
- `POST /api/model-gateway/active-route` sets the active provider/model alias route for one app (`supervisor`, `claude-code`, or `codex`).
- `GET /api/model-gateway/status` returns `activeRoutes` keyed by app plus provider health. It may also return legacy `activeRoute` for older clients, but new UI and routing logic must use the app-keyed map.
- `ALL /api/model-gateway/anthropic/*` resolves the session token, reads the `claude-code` active route on every request, rewrites the Anthropic `model`, and forwards to the selected upstream.
- `ALL /api/model-gateway/openai/*` resolves the session token, reads the `codex` active route on every request, rewrites the OpenAI-compatible `model`, and forwards to the selected upstream.
- `ModelGatewayStorePort` persists provider records, one active route per app, and redacted provider health records.
- `SupervisorModelPort.completeTurn(...)` may call a supervisor provider through Anthropic Messages, OpenAI Chat Completions, or OpenAI Responses based on the provider `wireApi`.

### 3. Contracts

- Provider request fields: optional `id`, `client` (`supervisor`, `claude-code`, or `codex`), `name`, `upstreamBaseUrl`, optional `apiKey`, `authMode` (`x-api-key` or `bearer`), optional `wireApi` (`responses` or `chat`; undefined means Anthropic Messages), non-empty `models[alias]`, `enabled`, and `priority`.
- Provider records store `hasApiKey` and may store a masked `apiKeyPreview`; real provider keys remain in the encrypted key vault and must not appear in provider records, API responses, frontend storage, logs, activity events, or sandbox env.
- Provider test request uses the provider request fields plus optional `modelAlias`; when `apiKey` is omitted for an existing `id`, the usecase reads the stored key from the key vault. The success response is `{ "success": true }`; failure responses use the normal error envelope and must not include upstream response bodies or secrets.
- Provider delete removes provider metadata, provider health, only that provider's app active route when it points at the deleted provider, and the encrypted `llm_api_key` vault entry when the key vault adapter supports deletion.
- `upstreamBaseUrl` must be a valid HTTP(S) URL. If it includes a path prefix such as `/anthropic`, proxied request paths remain under that prefix.
- Model map rules: at least one model alias is required, but `default` is not globally required. Claude Code and Codex should normally use `default`; Supervisor may expose arbitrary user-facing aliases without synthesizing `default`. Route model aliases are free-form non-empty strings and must reference an alias exposed by the selected provider.
- Active route fields: `app` (`supervisor`, `claude-code`, or `codex`), `providerId`, `modelAlias`, `updatedAt`. Persistence is keyed by `app`; selecting a Supervisor provider must not overwrite the Claude Code or Codex active route.
- Active route writes must reject a provider whose `client` does not match `app`, a disabled provider, or a `modelAlias` missing from the provider's model map.
- Provider health fields: `providerId`, `status` (`unknown`, `healthy`, `degraded`), `failureCount`, optional `lastCheckedAt`, optional redacted `lastError`.
- Proxy routing reads the active route for its own app on every request. Switching one app's route affects that app's next Claude Code, Codex, or Supervisor model request without restarting the sandbox or changing the session gateway token, and must not clear other apps' selections.
- If no active route exists for the requested app, proxy routing falls back to the session's `llmCredentialAlias` and the app's default upstream (`https://api.anthropic.com` for Claude Code, `https://api.openai.com` for Codex) for compatibility.
- Failover tries the active enabled provider first, then enabled providers sorted by `priority` and `name`; retryable statuses are `429`, `500`, `502`, `503`, and `504`.
- OpenAI-compatible provider base URLs must include the version path, for example `https://api.openai.com/v1`; provider test calls and supervisor OpenAI requests append only `/chat/completions` or `/responses`. Supervisor Anthropic requests use `/v1/messages`. Tool calls and tool results must be translated at the supervisor model adapter boundary.

### 4. Validation & Error Matrix

- Missing or malformed provider payload -> `VALIDATION_FAILED` / HTTP 400.
- Empty provider model map -> `VALIDATION_FAILED` / HTTP 400.
- Provider create/test without an API key or existing stored key -> `CREDENTIAL_REQUIRED` / HTTP 400.
- Provider test selected alias is not configured -> `VALIDATION_FAILED` / HTTP 400.
- Provider test upstream non-2xx or fetch failure -> `MODEL_GATEWAY_FAILED` / HTTP 502 with HTTP status and a redacted, bounded upstream response/error detail; saved provider health becomes `degraded` when the request includes an existing provider `id`.
- Supervisor model upstream non-2xx or fetch failure -> `MODEL_GATEWAY_FAILED` / HTTP 502 with HTTP status and a redacted, bounded upstream response/error detail; persisted run/session `lastError` should be specific enough for the UI to show the provider's actual rejection reason.
- Provider delete for an unknown `providerId` is idempotent and returns success.
- Active route references a missing, disabled, or wrong-client provider -> `MODEL_PROVIDER_NOT_FOUND` / HTTP 404.
- Active route references an alias missing from the provider's model map -> `VALIDATION_FAILED` / HTTP 400.
- Active route exists but no enabled providers are available -> `MODEL_PROVIDER_NOT_FOUND` / HTTP 404.
- Invalid model session token on proxy route -> `UNAUTHORIZED` / HTTP 401.
- Missing session for a valid model session token -> `SESSION_NOT_FOUND` / HTTP 404.
- Invalid proxy path or invalid upstream base URL -> `MODEL_GATEWAY_FAILED` / HTTP 502 before upstream fetch or real provider auth headers are created.
- Retryable upstream response -> mark provider `degraded`, increment `failureCount`, then try the next enabled provider.
- First non-retryable upstream response -> mark provider `healthy` and return it.

### 5. Good/Base/Bad Cases

- Good: Claude Code, Codex, and Supervisor providers are configured with encrypted keys; changing `activeRoutes[app]` to one app's provider/alias affects that app's next gateway or supervisor model request without clearing the other app selections or exposing real keys.
- Good: two Anthropic-compatible providers are configured with encrypted keys, the Claude Code active route points to provider A/`sonnet`, a running Claude Code session sends the next Messages request, Janus rewrites `model` to provider A's `sonnet` model, and a retryable failure fails over to provider B without exposing real keys.
- Good: a Supervisor provider stores multiple aliases such as `default`, `planner`, and `reviewer`; the composer displays them as `Provider/default`, `Provider/planner`, and `Provider/reviewer`, and the selected route writes `providerId + modelAlias`.
- Good: a Supervisor provider stores a single custom alias such as `claude-opus-4-8` without adding a synthetic `default` alias.
- Good: the Provider form can test unsaved settings with the submitted `apiKey` without persisting it, or test an edited provider with the stored key when `apiKey` is omitted.
- Good: the Provider form displays only a masked key preview such as `sk-r********-key`; replacing the key requires an explicit edit action and never reveals the full stored key.
- Good: deleting a provider clears its health and stale active route state for that provider's app so later routing cannot point at a deleted provider while other app selections stay intact.
- Good: an OpenAI-backed Supervisor provider chooses either Chat Completions or Responses, and the supervisor model adapter translates Janus tool calls/tool results to that wire API.
- Base: no active route exists for an app; existing sessions still proxy through that app's default upstream using `session.llmCredentialAlias`.
- Bad: persisting a real LLM key in a provider record, returning it in `/api/model-gateway/status`, forwarding an absolute proxy path, letting `../` escape a configured upstream path prefix, or caching the active route in a running sandbox.
- Bad: accepting an active route for `Provider/missingAlias`, testing a provider by sending the real API key from the frontend directly to an upstream URL, or logging the upstream provider test error body.

### 6. Tests Required

- Atom tests: model alias inference/rewrite, provider ordering, retryable status classification.
- Usecase tests with mock ports: provider upsert/list/status redaction and masked key preview, provider delete cleanup, provider test calls for submitted and stored keys, OpenAI test paths with versioned base URLs, redacted upstream test-call failures, active route alias/client validation, independent active routes per app, active route switching per request, model rewrite, retryable failover, missing credential/provider errors, and no-route fallback.
- Adapter tests: absolute/protocol-relative paths are rejected before fetch, non-HTTP(S) upstream bases are rejected before auth headers, configured path prefixes are preserved, and path-prefix escapes do not reach fetch.
- Supervisor adapter tests: Anthropic Messages, OpenAI Chat Completions, and OpenAI Responses request/response translators preserve model aliases, tool calls, tool results, and stop reasons without exposing provider keys.
- Supervisor adapter tests: upstream non-2xx failures include provider response details while redacting the configured API key.
- API smoke tests: provider config and status endpoints never return real secrets and M1/M2 repository-session and supervisor flows still pass.
- Frontend checks: provider/status/test server state flows through TanStack Query, all three provider forms expose test call status, supervisor aliases render as `provider/alias`, and optional model aliases are omitted when blank instead of submitted as empty strings.

### 7. Wrong vs Correct

#### Wrong

```ts
await modelGatewayStorePort.saveModelProvider({
  credentialAlias: "sk-ant-real-key",
});
```

```ts
const activeRoute = cachedAtSessionStartup;
```

```ts
new URL(request.path, provider.upstreamBaseUrl);
headers.set("x-api-key", realLlmKey);
```

```ts
await fetch(provider.upstreamBaseUrl, {
  headers: { authorization: `Bearer ${apiKey}` },
});
```

#### Correct

```ts
await modelGatewayStorePort.saveModelProvider({
  hasApiKey: true,
});
```

```ts
const activeRoute = await modelGatewayStorePort.getActiveRoute("claude-code");
```

```ts
const upstream = resolveAnthropicUrl(provider.upstreamBaseUrl, request.path);
headers.set(provider.authMode === "bearer" ? "authorization" : "x-api-key", realLlmKey);
```

```ts
await testModelProvider.execute({
  client: "supervisor",
  upstreamBaseUrl,
  apiKey,
  authMode,
  models,
});
```

The correct path keeps secrets in the control plane, reads routing state per proxy request, validates provider aliases, and attaches real provider auth only inside the model-gateway/supervisor adapter boundary after URL validation succeeds.

## Scenario: Supervisor Reasoning Effort and Visible Thought Output

### 1. Scope / Trigger

- Trigger: supervisor model configuration now carries per-alias reasoning effort across shared DTOs, provider storage, model adapter request payloads, supervisor run transcripts, and frontend conversation rendering.
- Applies when changing `ModelProviderRecord.models`, supervisor model wire APIs, `CompleteSupervisorTurnResult`, `SupervisorRunRecord.transcript`, provider settings UI, or conversation mapping for model-returned reasoning/thinking summaries.

### 2. Signatures

- `ModelMap` accepts legacy string entries and object entries: `{ [alias: string]: string | { model: string; reasoningEffort?: string } }`.
- Reasoning effort presets are `none`, `low`, `medium`, `high`, `xhigh`, and `max`; custom non-empty values are allowed when they pass the shared schema.
- `CompleteSupervisorTurnResult` may include `thoughts?: { type: "thought"; title?: string; text: string }[]`.
- `SupervisorRunRecord.transcript[]` may include `{ id, kind: "thought", title?, text, at }`.

### 3. Contracts

- `none` means "do not request provider thinking" and must omit reasoning/thinking request fields upstream.
- Model-map consumers must resolve entries through shared helpers such as `resolveModelConfig`, `modelConfigModelId`, and `modelConfigReasoningEffort`; do not assume `provider.models[alias]` is a string.
- OpenAI Chat Completions uses top-level `reasoning_effort` for non-`none` configured effort. `reasoningEffort: "max"` maps to `reasoning_effort: "xhigh"` because mainstream OpenAI-compatible Chat gateways do not accept `max` as the highest effort label.
- OpenAI Responses uses `reasoning: { effort, summary: "auto" }` for non-`none` configured effort and may return visible reasoning summaries in output reasoning items.
- Anthropic Messages uses the provider-appropriate summarized thinking request shape for non-`none` configured effort and may return visible `thinking` content blocks.
- OpenAI Chat Completions visible thought output may arrive in `message.reasoning_content`, string or object `message.reasoning`, or `message.reasoning_details`. The supervisor adapter must extract those fields as `thoughts`; plain `message.content` remains assistant answer text.
- Chat Completions `usage.completion_tokens_details.reasoning_tokens` is hidden usage accounting only; it must not create transcript thought entries.
- The UI may display only provider-returned visible thought/reasoning summary text. It must not infer, fabricate, or expose hidden chain-of-thought.

### 4. Validation & Error Matrix

- Empty model alias or model id -> `VALIDATION_FAILED` / HTTP 400 through shared provider schemas.
- Empty or schema-invalid custom reasoning effort -> `VALIDATION_FAILED` / HTTP 400.
- Active route references an alias missing from the provider's model map -> `VALIDATION_FAILED` / HTTP 400.
- Upstream rejects an unsupported reasoning effort value -> `MODEL_GATEWAY_FAILED` / HTTP 502 with redacted bounded provider detail.
- Provider returns no visible thought summary -> no `thought` transcript entry is persisted.

### 5. Good/Base/Bad Cases

- Good: an existing provider with `models: { default: "claude-3-5-sonnet-latest" }` still parses, routes, and sends no thinking field.
- Good: a supervisor provider stores `models: { planner: { model: "gpt-5", reasoningEffort: "high" } }`; selecting `planner` sends Chat `reasoning_effort: "high"` or Responses `reasoning.effort: "high"` depending on the provider wire API.
- Good: an OpenAI Chat `reasoning_content`, OpenAI Responses reasoning summary, or Anthropic thinking block is persisted as a `thought` transcript entry and renders as an always-expanded informational conversation row.
- Base: a custom effort such as `minimal` can be stored and sent for compatible gateways even when it is not one of the Janus preset labels.
- Bad: reading `provider.models.default` as a string and serializing it directly into upstream `model`.
- Bad: displaying `reasoning_tokens` counts, provider-hidden reasoning, or locally generated explanations as a thought row.

### 6. Tests Required

- Shared schema tests: legacy string model entries, object model entries, custom reasoning effort, and `none` omission behavior.
- Adapter tests: Chat sends top-level `reasoning_effort`, maps `max` to `xhigh`, extracts visible reasoning fields, and does not synthesize thoughts from usage tokens; Responses sends `reasoning` and extracts summaries; Anthropic sends summarized thinking config and extracts thinking blocks.
- Workflow tests or focused coverage: returned `thoughts` are persisted as `kind: "thought"` transcript entries and blank thought text is ignored.
- Frontend mapper/render tests: `thought` transcript entries map to conversation items with `Thinking` fallback title and visible body text.

### 7. Wrong vs Correct

#### Wrong

```ts
const model = provider.models[alias] ?? provider.models.default;
body.model = model;
```

```ts
const tokens = response.usage.completion_tokens_details.reasoning_tokens;
transcript.push({ kind: "thought", text: `Reasoning tokens: ${tokens}` });
```

#### Correct

```ts
const config = resolveModelConfig(provider.models, alias);
body.model = modelConfigModelId(config);
if (shouldUseReasoningEffort(modelConfigReasoningEffort(config))) {
  body.reasoning_effort = modelConfigReasoningEffort(config);
}
```

```ts
for (const thought of response.thoughts ?? []) {
  transcript.push({ kind: "thought", text: thought.text, at: now });
}
```

The correct path keeps model alias configuration backward-compatible, centralizes model-config normalization, and limits visible reasoning UI to provider-returned summary/thinking text.

## Scenario: Supervisor Run Loop

### 1. Scope / Trigger

- Trigger: M2 adds a cross-layer supervisor run contract spanning shared DTOs, HTTP routes, run persistence, sandbox CLI dispatch, verification command execution, Git branch publishing, GitHub PR creation, activity events, and frontend state.
- Applies when extending plan/dispatch/verify, objective checks, repair iteration, branch/PR output, task-run request fields, supervisor bash validation, or the task-run UI.

### 2. Signatures

- `POST /api/supervisor-runs` starts one control-plane task run.
- `POST /api/supervisor-runs/:runId/cancel` requests cancellation for one non-terminal supervisor run.
- `GET /api/supervisor-runs/:runId` returns the persisted run state.
- `BackgroundTaskPort.run(task)` schedules the long-running supervisor loop after the initial run/session records are persisted.
- `SupervisorRunStorePort.saveSupervisorRun(run)`, `getSupervisorRun(runId)`, `listSupervisorRuns()`, and `listSupervisorRunsForSession(sessionId)` persist and read run records. Session-scoped UI/API paths must use `listSupervisorRunsForSession(sessionId)` so unrelated persisted rows are not decoded.
- `SupervisorRunCancellationPort.registerRun(runId, sessionId)` returns `{ signal, unregister }`; `cancelRun(runId, reason?)` aborts one active run; `cancelSession(sessionId, reason?)` aborts all active runs for a deleted session or requirement replacement. `reason` is one of `run_canceled` or `requirements_changed`.
- `SupervisorModelPort.completeTurn(...)`, `SandboxCommandPort.runCommand(...)`, and `CliSessionPort.dispatchInstruction(...)` accept an optional `signal`.
- `CliSessionPort.dispatchInstruction({ cli, sessionId, sandboxId, instruction, launch?, workspacePath?, signal?, onOutputLine? })` remains the subprocess boundary. `launch` is a typed allowlisted object, not raw argv.
- `VerificationPort.runCommand({ sessionId, sandboxId, command })` executes one objective check inside the session sandbox.
- `SandboxCommandPort.runCommand({ sessionId, sandboxId, command, workspacePath?, signal? })` executes one shell command. Docker adapters run inside `/workspace`; local-dev adapters use `workspacePath` as the host `cwd` when provided.
- Supervisor workspace tools are exposed to the model as `read_file`, `write_file`, `edit_file`, `bash`, `dispatch_claude_code`, `dispatch_codex`, and `read_cli_job`.
- `dispatch_claude_code({ instruction, description?, candidateCount?, launch? })` and `dispatch_codex({ instruction, description?, candidateCount?, launch? })` start asynchronous non-interactive CLI jobs and return job ids immediately. `description` is a short human-facing label for the job purpose. `candidateCount` defaults to `1` and may start a bounded parallel candidate set. `read_cli_job({ jobId })` reads the current same-session job snapshot; if the job is still running, it returns `status: running` without waiting for completion.
- `edit_file({ path, oldText, newText, replaceAll? })` applies an exact text replacement to one workspace file. `replaceAll` defaults to `false`.
- `GitPublisherPort.publishBranch({ project, branchName, gitToken })` publishes the current workspace branch using a control-plane Git token.
- `PullRequestPort.createPullRequest({ project, branchName, title, body, gitToken })` creates the PR through the control-plane GitHub boundary.

### 3. Contracts

- Start request fields: `projectId`, `task`, optional `sessionId`, optional `image`, and optional `supervisorModel`. The schema is strict; removed fields such as `permissionMode` must fail validation instead of being silently ignored.
- Start response fields: `run` and optional `diff`. The initial response should return the persisted `planning` run with `sessionId` before sandbox startup, CLI dispatch, verification, branch publishing, or PR creation completes.
- Run record fields: `id`, `projectId`, `sessionId`, `task`, `status`, `plan[]`, `verificationCommands[]`, `verificationResults[]`, `maxIterations`, `iteration`, optional `branchName`, optional `pullRequest`, timestamps, optional `lastError`.
- Async CLI job fields live on `SupervisorRunRecord.cliJobs[]`: `id`, `toolUseId`, `cli`, optional `description`, `instruction`, `launch`, `status` (`running`, `completed`, `failed`, `canceled`), `startedAt`, optional `completedAt`, optional `exitCode`, optional bounded `stdout`, optional bounded `stderr`, and optional `canceledReason` (`run_canceled` or `requirements_changed`).
- CLI launch option fields: optional `model` matching `^[A-Za-z0-9._:/+-]+$`, optional `effort`, and `access: "read-only" | "full-access"` defaulting to `full-access`. Claude Code accepts `effort: "low" | "medium" | "high" | "xhigh" | "max" | "ultracode"`; Codex accepts `effort: "low" | "medium" | "high" | "xhigh"`. The supervisor model never receives or supplies raw argv, shell syntax, secrets, host paths, `writePolicy`, or a generic `cli` field as launch configuration.
- Codex approval policy is a top-level Codex CLI flag, not an `exec` subcommand flag. Docker and local-dev Codex dispatch must build `codex -a never exec --json ... -s <sandbox> -- <instruction>` (or the Docker `docker exec <sandbox> codex -a never exec ...` equivalent). Placing `-a never` after `exec` makes current Codex fail before the job can run. `launch.access: "read-only"` maps to `-s read-only`; `full-access` maps to `-s danger-full-access`.
- Plan step fields: `id`, `index`, `title`, `instruction`, `status`, optional timestamps, optional `lastError`.
- Verification result fields: `id`, `commandId`, `command`, `status`, `exitCode`, bounded `stdout`, bounded `stderr`, timestamps.
- Successful finalization fields: `branchName`, `pullRequest.status: "created"`, `pullRequest.url`, `pullRequest.number`.
- Direct workspace file tools must use `WorkspaceReaderPort` / `WorkspaceWriterPort` with the opened `ProjectRecord.workspacePath`; they must not read or write through the sandbox container path.
- `read_file.path`, `write_file.path`, and `edit_file.path` are workspace-relative paths. Path traversal protection belongs to the workspace reader/writer adapter.
- `write_file` replaces the full file content. `edit_file` is for focused edits: `oldText` must be non-empty, must exist, and must be unique unless `replaceAll: true`.
- Supervisor `bash` tool commands are not a raw unrestricted terminal. They must pass a pure hard-deny validator before reaching `SandboxCommandPort`: no command substitution, variable expansion, host absolute paths (including Windows drive-qualified paths), backslash paths, `~`, parent-directory traversal, credential paths such as `.env` / `.ssh/*`, working-directory/git-dir overrides such as `-C`, `--cwd`, `--git-dir`, `--work-tree`, or `--prefix`, destructive `git` subcommands, `rm` / `rmdir`, background/heredoc syntax, container-control commands, or direct env/credential inspection commands. Non-hard-denied commands are allowed by default.
- Prompt text must not reveal the host workspace path to the model. Model-facing tool instructions and tool inputs use workspace-relative paths only; hard safety is enforced by validators/adapters, not by prompt wording alone.
- Process output returned to the supervisor model or persisted in supervisor tool transcript entries must virtualize exact project `workspacePath` occurrences as `/workspace`, including Windows backslash, Windows slash, and Git Bash/MSYS drive path variants such as `/c/Users/...`. This is a display/model boundary only; adapters still receive the real path for process execution.
- CLI job stdout/stderr returned through `read_cli_job`, automatic completion feedback, or run records must use the same workspace-path virtualization and bounded output policy. Incremental CLI stdout may create `cli_output` activity events through `onOutputLine`.
- The supervisor loop must not finalize while async CLI jobs are pending. If the model produces no tool calls while jobs are pending, the workflow waits for one completion, persists the completed job, feeds a user-message summary back to the model, and continues.
- Model-facing dispatch results and tool descriptions must steer the model away from polling. After dispatching CLI jobs, the model should stop its turn unless it has useful independent work; Janus resumes automatically when a job completes. If the model still calls `read_cli_job` for a running job, the workflow returns the current bounded snapshot once.
- Requirement changes are cancel-and-restart: when a new supervisor run reuses an active `sessionId`, the old active run is canceled with reason `requirements_changed`; its pending CLI jobs are recorded as `canceled` and stale results must not be fed back into the replacement run.
- Model-facing tool instructions must prefer `read_file` for file contents instead of advertising `cat`/`head`/`tail` as the normal file-read path. Final responses should read like a person talking to the user, not a report: no titles, no section headings at any level (`#`, `##`, `###`), no bold heading labels, and no heading-like lines such as `Summary:`, `Changes:`, `Verification:`, or `Next steps:`. Use concise paragraphs and only a few flat bullets when useful.
- Cancelling a supervisor run aborts the registered `AbortSignal`, propagates to in-flight model calls, sandbox shell commands, and dispatched coding CLI processes, preserves existing transcript entries, and records the run/session as `canceled` with a `session_canceled` activity event. Deleting a session must call `cancelSession(sessionId)` before deleting session records.
- Workspace tree listing is a working-tree view: it starts from `HEAD`, overlays `git status --porcelain=v1 -z --untracked-files=all`, includes untracked files/directories, and marks changed entries with the shared diff status values.
- Successful `write_file` and `edit_file` tool calls should attach the current workspace diff snapshot to the run record so the UI can show a patch before final run completion; the final session diff is still recorded through the normal `diff_recorded` event.
- The frontend may display friendly tool names (`Read`, `Write`, `Edit`, `Run`, `CLI`, `Best of N`), but transcript records keep the stable tool ids from `packages/shared`.
- Activity event types for this loop include `supervisor_planned`, `verification_started`, `verification_passed`, `verification_failed`, `supervisor_iterating`, `branch_published`, and `pull_request_created`.
- Branch publishing must commit current workspace changes before pushing. The adapter owns `git checkout -B <branch>`, `git status --porcelain`, `git add -A`, `git -c user.name=Janus -c user.email=janus@users.noreply.github.com commit -m <message>`, and `git push --set-upstream origin <branch>`.
- Real Git tokens and LLM keys stay in the control plane. They must not appear in run records, activity event messages, API responses, command arrays, frontend state, or error messages.

### 4. Validation & Error Matrix

- Missing or malformed run request -> `VALIDATION_FAILED` / HTTP 400.
- Missing project -> `PROJECT_NOT_FOUND` / HTTP 404.
- Missing LLM or Git credential alias -> `CREDENTIAL_NOT_FOUND` / HTTP 404.
- Missing run on `GET /api/supervisor-runs/:runId` -> `SUPERVISOR_RUN_NOT_FOUND` / HTTP 404.
- Missing run on `POST /api/supervisor-runs/:runId/cancel` -> `SUPERVISOR_RUN_NOT_FOUND` / HTTP 404.
- Cancelling a completed, canceled, or failed supervisor run -> no-op success.
- Cancelling an active supervisor run -> abort signal propagates; run/session reach terminal `canceled` state without a failure `lastError`.
- Reusing `sessionId` for a changed requirement -> cancel active runs for that session with `requirements_changed`, then start a replacement run with the new task.
- Invalid CLI launch option, including model strings with spaces or raw argv fragments -> tool input validation failure before subprocess dispatch.
- `read_cli_job` for an unknown `jobId` -> tool failure; the supervisor run may continue if the model repairs the job id.
- CLI job process returns non-zero -> job status `failed`; `dispatch_claude_code` / `dispatch_codex` itself still succeeds if the asynchronous job was started.
- CLI job cancellation -> job status `canceled`, `exitCode: 130`, and `canceledReason` set to the propagated cancellation reason.
- Run request containing removed fields such as `permissionMode` -> `VALIDATION_FAILED` / HTTP 400.
- Supervisor `bash` command with hard-denied shell syntax, credential path, host absolute path, `~`, parent traversal, cwd/git-dir override, destructive command, or direct env inspection -> tool failure with `VALIDATION_FAILED`; the run may continue if the model repairs the tool input.
- Sandbox startup failure after run/session persistence -> run `failed`, session `failed`, emit `session_failed`; do not leak raw Docker output.
- CLI dispatch startup failure -> async job status `failed` or tool failure depending on whether a job record was created; record bounded status, not raw secrets.
- Verification command non-zero exit -> verification result `failed`; this is an expected run outcome, not an HTTP error.
- Verification failure within budget -> run `iterating`; dispatch a bounded repair instruction.
- Verification failure after budget -> run `max_iterations_exhausted`, session `failed`.
- `edit_file.oldText` missing from the file -> tool failure with `VALIDATION_FAILED`; the run may continue if the model repairs the tool input.
- `edit_file.oldText` matches multiple locations and `replaceAll` is false -> tool failure with `VALIDATION_FAILED`; the model must include more context or set `replaceAll`.
- No workspace changes when branch publishing starts -> `WORKSPACE_SYNC_FAILED`; the run becomes `failed` and no PR is created.
- Branch publish or PR creation failure -> run `failed`; adapter errors must be redacted before propagation.

### 5. Good/Base/Bad Cases

- Good: a task run creates a plan, dispatches the persistent Claude Code session, runs checks in the sandbox, repairs once after a failed check, captures a diff, publishes a branch, and returns PR metadata without exposing secrets.
- Good: `POST /api/supervisor-runs` returns a `planning` run quickly, then the UI uses `GET /api/supervisor-runs/:runId`, session activity stream, and session diff polling to observe progress.
- Good: in local development mode, supervisor `bash` commands run in the opened project workspace via the injected `workspacePath` instead of returning a skipped-command placeholder.
- Good: a model request such as `echo $(cat ../AGENTS.md)`, `echo $PWD`, `cat C:/Users/...`, `cat ~/.ssh/config`, or `git -C .. status` is rejected before a subprocess starts.
- Good: the UI calls `POST /api/supervisor-runs/:runId/cancel`; the registered signal aborts an in-flight model or CLI process, the existing transcript remains visible, terminal state is `canceled`, and the background task unregisters the run in `finally`.
- Good: `dispatch_claude_code` or `dispatch_codex` returns `cli_job_started: <id>` before the CLI process exits; the supervisor can keep reasoning, stop and let automatic completion feedback resume it, or call `read_cli_job` once and receive the terminal result when that job completes.
- Good: local development mode dispatches real non-interactive CLIs from the project workspace using `claude --print ...` for Claude Code and `codex -a never exec --json ...` for Codex. Typed `launch.model`, `launch.effort`, and `launch.access` are mapped to each CLI's own flags by the adapter.
- Good: a changed user requirement reuses the session id, cancels stale pending CLI jobs as `requirements_changed`, and starts a replacement run rather than trying to mutate stdin for a non-interactive process.
- Good: the default supervisor bash path allows broader non-hard-denied commands such as `python -c "print(1)"`, while still blocking `cat .env`, `echo $JANUS_ACCESS_TOKEN`, `git clean -fd`, and `ls && rm -rf dist`.
- Good: deleting a running session first cancels all active supervisor runs for that session, then deletes the session-scoped rows.
- Good: a focused code change uses `edit_file` with enough `oldText` context to replace exactly one occurrence.
- Good: after `write_file` creates `generated/file.ts`, the run record carries a current diff snapshot and the workspace tree lists `generated/` plus `generated/file.ts` from the current filesystem before the final publish step.
- Good: workspace tree listing uses the current filesystem as the source of truth and uses `git status --porcelain=v1 -z --untracked-files=all` only to annotate changed entries. Deleted tracked files that no longer exist on disk must not remain visible just because they exist in `HEAD`.
- Base: checks fail and `maxIterations` is `0`; the run ends as `max_iterations_exhausted` without creating a branch or PR.
- Bad: using `write_file` for a tiny replacement when `edit_file` can express the change safely.
- Bad: relying on the system prompt to keep the model inside the workspace while still executing unvalidated `bash -lc` text.
- Bad: only changing the send button UI to "stop" without aborting the server-side model call and child process.
- Bad: awaiting `CliSessionPort.dispatchInstruction()` inside a dispatch tool before returning a tool result; this blocks the supervisor on long CLI work.
- Bad: exposing a raw `argv` or `args` string/object to the supervisor model for CLI launch control.
- Bad: building `codex exec ... -a never ...`; `-a` belongs before `exec`.
- Bad: trying to send changed requirements into an already-running non-interactive CLI process; cancel the stale job and start a new one instead.
- Bad: a usecase runs `Bun.spawn`, imports `adapters/*`, sends a Git token into the sandbox, stores raw unbounded verification logs, or returns the Git token in the run response.
- Bad: publishing a branch from dirty workspace state without committing first; this pushes the old HEAD and produces an empty or failing PR.

### 6. Tests Required

- Atom tests: plan derivation, branch-name derivation, verification pass/fail aggregation, iteration decision, repair-instruction construction.
- Atom tests: exact file edit replacement succeeds, rejects ambiguous matches by default, and supports explicit replace-all.
- Usecase tests with mock ports: pass path creates PR, failed verification dispatches a repair instruction, max-iteration stop does not publish.
- Usecase/workflow tests with mock ports: supervisor tool loop executes `read_file`, `write_file`, `edit_file`, and `bash` through injected ports and records bounded tool transcript entries.
- Usecase/workflow tests with mock ports: successful `write_file` / `edit_file` tool calls attach a non-empty diff snapshot to the running supervisor run record.
- Usecase/workflow tests with mock ports: `dispatch_claude_code` and `dispatch_codex` persist `running` CLI job records and return job ids before the mocked CLI promise resolves, including multi-candidate `candidateCount`.
- Usecase/workflow tests with mock ports: if the model tries to finish while CLI jobs are pending, the workflow waits for a job completion, persists the completed result, feeds it back to the model, and only then allows finalization.
- Usecase/workflow tests with mock ports: `read_cli_job` returns same-run and prior-run running snapshots, returns completed output, and updates persisted job state without exposing host workspace paths.
- Usecase/workflow tests with mock ports: changed requirements cancel active session runs with `requirements_changed` and mark pending CLI jobs `canceled`.
- Usecase tests with mock ports: starting a run returns before the captured background task executes; running the captured task advances persisted state to the terminal outcome.
- Atom/tool-input tests: CLI launch options default `access` to `full-access`, accept safe model ids, enforce per-CLI effort ranges, reject spaces/raw argv fragments, and reject removed/unknown launch fields such as `writePolicy`.
- Atom tests: supervisor bash validation allows non-hard-denied commands by default and rejects exactly hard-denied shell expansion/control syntax, credential paths, absolute/drive/home paths, parent traversal, cwd/git-dir overrides, destructive commands, and direct env inspection.
- Usecase/workflow tests with mock ports: cancelling a registered queued/running run aborts the workflow before the next model/tool operation, preserves transcript entries, persists run/session `canceled`, emits `session_canceled`, and unregisters the run.
- Usecase tests with mock ports: cancel-supervisor-run no-ops for terminal runs including `canceled`, aborts non-terminal registered runs, and delete-session calls `cancelSession(sessionId)` before deleting.
- Adapter tests: model, sandbox command, and coding CLI adapters pass `AbortSignal` to the underlying fetch/process runner so cancellation reaches the actual external work.
- Adapter tests: Docker Claude Code, Docker Codex, and local-dev `claude`/`codex` translate typed `launch.model`, `launch.effort`, and `launch.access` to each CLI's correct argv flags while keeping instruction text after `--`; Codex tests must assert `-a never` appears before `exec` and that `access: "read-only"` maps to `-s read-only`.
- Adapter tests: verification adapter command shape executes through the session sandbox; Git publish commits dirty workspace changes before push, rejects empty workspace changes, uses askpass/env rather than command-argument tokens; GitHub PR adapter parses `html_url` and `number` and redacts upstream failures.
- Adapter tests: workspace tree listing reads current filesystem entries, hides `.git`, excludes deleted tracked files that are absent on disk, includes untracked root files and nested untracked directories, and overlays `git status --porcelain=v1 -z --untracked-files=all` only for changed markers.
- Adapter tests: local-dev sandbox command adapter uses `workspacePath` as `cwd` when present and preserves the old skipped-command behavior when absent.
- API/contract tests: route payloads parse with `packages/shared` schemas; removed start-supervisor-run fields such as `permissionMode` fail validation; start-supervisor-run returns the initial `planning` run before the background loop completes; get-missing-run returns `SUPERVISOR_RUN_NOT_FOUND`.
- Quality scans: no adapter imports from `api/` or `usecases/`; no real key/token in run records, activity event messages, API responses, or frontend storage.

### 7. Wrong vs Correct

#### Wrong

```ts
await Bun.spawn(["bun", "test"], { cwd: project.workspacePath });
```

```ts
await cliSessionPort.dispatchInstruction({
  instruction: `Fix this with token ${gitToken}`,
});
```

```ts
const result = await cliSessionPort.dispatchInstruction({
  cli,
  sessionId,
  sandboxId,
  instruction,
  launch: { argv: ["--model", model, "--dangerously-bypass"] },
});
return result.stdout;
```

```ts
await sandboxCommandPort.runCommand({
  sessionId,
  sandboxId,
  command: "echo $(cat ../AGENTS.md)",
});
```

```ts
await startSupervisorRun({
  projectId,
  task,
  permissionMode: "guarded",
});
```

#### Correct

```ts
await startSupervisorRun({
  projectId,
  task,
});
```

```ts
await verificationPort.runCommand({
  sessionId,
  sandboxId,
  command: "bun test",
});
```

```ts
const edited = applyWorkspaceFileEdit({
  content: file.content,
  oldText,
  newText,
  replaceAll: false,
});
```

```ts
await gitPublisherPort.publishBranch({
  project,
  branchName,
  gitToken,
});
```

```ts
const cancellation = supervisorRunCancellationPort.registerRun(run.id, session.id);
backgroundTaskPort.run(async () => {
  try {
    await runSupervisorLoop({ signal: cancellation.signal });
  } finally {
    cancellation.unregister();
  }
});
```

```ts
validateSupervisorBashCommand(command);
await sandboxCommandPort.runCommand({
  sessionId,
  sandboxId,
  command,
  signal,
});
```

```ts
const job = startCliJob({
  cli: "codex",
  instruction,
  launch: { model, effort: "high", access: "full-access" },
});
return `cli_job_started: ${job.id}`;
```

The correct path keeps objective checks, long-running scheduling, cancellation, bash validation, and Git publishing behind injected ports. The supervisor usecase owns the retry/cancel decision and stores only bounded, user-visible run state.

## Scenario: Supervisor Run Attachments, Best-of-N, Ask, and Browser Tools

### 1. Scope / Trigger

- Trigger: supervisor runs now accept uploaded files and Best_of_N options, expose a blocking Ask tool, and expose headless browser automation. This is a cross-layer contract spanning `packages/shared`, HTTP, orchestrator usecases/workflows, workspace I/O ports, run-live SSE, and workspace conversation UI.
- Applies when changing `StartSupervisorRunRequest`, `SupervisorRunRecord`, supervisor tool definitions/inputs, Ask resolution routes, browser automation ports/adapters, session-run SSE, or conversation composer/pending Ask UI.

### 2. Signatures

- `POST /api/supervisor-runs` accepts optional `attachments?: SupervisorRunAttachmentInput[]` and `bestOfN?: { candidateCount?: 1..5 }`.
- `POST /api/supervisor-runs/:runId/asks/:askId/answer` accepts `{ answer }` and returns `{ run }`.
- `WorkspaceWriterPort.writeBinaryFile({ project, path, content })` writes uploaded binary content inside the session workspace.
- `SupervisorAskPort.waitForAnswer({ runId, askId, signal? })` blocks the tool loop until an answer arrives; `resolveAnswer({ runId, askId, answer, answeredAt })` resumes it.
- `BrowserAutomationPort.run({ workspacePath, url, actions, screenshotPath, signal? })` loads a page, applies bounded DOM actions, extracts text/structure, and writes a screenshot artifact.
- Supervisor tools include `ask_user({ question, context?, options? })` and `browser_action({ url, actions?, screenshotPath? })`.

### 3. Contracts

- Attachment input fields: `name` trimmed 1..240, optional `mediaType` 1..160, `sizeBytes` 0..`supervisorRunAttachmentMaxBytes`, and strict base64 `contentBase64`. Max attachment count per run is 10.
- Attachment record fields: `id`, original `name`, optional `mediaType`, `sizeBytes`, workspace-relative `path`, and `uploadedAt`. Do not store base64 content in run records.
- Uploaded files are written under `.janus/uploads/<runId>/<index>-<sanitizedName>` through `WorkspaceWriterPort.writeBinaryFile`; filenames must be sanitized and path-contained by the adapter.
- Initial supervisor model context must mention attached file metadata and workspace-relative paths so the model can read them through normal workspace tools.
- Best_of_N is a supervisor-run policy. `bestOfN.candidateCount` generates 1..5 candidate model turns, scores them deterministically in an atom, saves candidate records, and continues with the selected candidate before tool execution or final response handling.
- Ask requests are persisted in `SupervisorRunRecord.askRequests[]` with `pending`, `answered`, or `cancelled` status. Pending requests are delivered to the UI through the existing run-live event/query path, not a separate frontend-only state store.
- Ask answers must update the run record before resolving the in-process waiter so refreshed clients see answered state and the tool loop receives the same answer as tool output.
- Browser action inputs must be HTTP(S) URLs. Actions are bounded to click, type, scroll, wait, and snapshot. Screenshot paths are workspace-relative and must stay inside the workspace.
- Browser automation may fail with `CONFIGURATION_REQUIRED` when the runtime image lacks Playwright; do not add install commands or silently skip the tool.
- Real LLM keys, Git tokens, auth headers, and model session tokens must not appear in attachment metadata, browser output, Ask records, transcript output, errors, or frontend storage.

### 4. Validation & Error Matrix

- More than 10 attachments, invalid base64, oversized attachment, empty name, or size/content mismatch -> `VALIDATION_FAILED` / HTTP 400 before the run proceeds.
- Binary write path escaping the workspace or targeting a directory -> `VALIDATION_FAILED` / HTTP 400 from the workspace adapter.
- Missing run on Ask answer -> `SUPERVISOR_RUN_NOT_FOUND` / HTTP 404.
- Unknown ask id -> `VALIDATION_FAILED` / HTTP 404.
- Answering an already answered or cancelled Ask -> `VALIDATION_FAILED` / HTTP 409.
- Ask wait aborted by run cancellation -> request status becomes `cancelled`, and the run follows the normal cancellation path.
- Invalid browser URL, action shape, selector, timeout, or screenshot path -> tool failure with validation output; the run may continue if the model repairs the input.
- Browser runtime missing or invalid -> tool failure with `CONFIGURATION_REQUIRED`, without attempting an installation command.

### 5. Good/Base/Bad Cases

- Good: user attaches `notes.txt`, the file is stored in the session workspace under `.janus/uploads/...`, the run stores only metadata, and the first model message names the workspace-relative path.
- Good: Best_of_N generates three candidates, picks the one with valid tool use, executes only that candidate's tool calls, then applies the same policy to the next model turn.
- Good: `ask_user` persists a pending question, the UI renders an answer form from `SupervisorRunRecord.askRequests`, and answering resumes the original tool loop with a normal tool result.
- Good: `browser_action` loads an HTTPS page, clicks or types through bounded actions, writes `.janus/browser/<runId>/<toolUseId>.png`, and returns text plus structure to the model.
- Base: Playwright is absent in a local/dev runtime; the browser tool returns a clear configuration failure and the rest of the system remains usable.
- Bad: accepting multipart uploads by adding an unplanned dependency when shared JSON/base64 schemas cover the current single-user scope.
- Bad: storing uploaded file base64 in `SupervisorRunRecord` or frontend state.
- Bad: keeping pending Ask prompts only in React local state; refreshes and other tabs would lose the blocking question.
- Bad: importing a browser adapter directly into an orchestrator service instead of calling `BrowserAutomationPort`.

### 6. Tests Required

- Shared schema tests: attachments, Best_of_N options, Ask request/response records, and tool names parse and reject invalid payloads.
- Atom tests: attachment path/content preparation and deterministic Best_of_N scoring.
- Tool-input tests: `ask_user` trims/defaults fields; `browser_action` defaults snapshot actions, normalizes workspace screenshot paths, and rejects invalid actions.
- Usecase/workflow tests with mock ports: start-supervisor-run writes attachment bytes, stores metadata, includes attachment paths in the initial model context, and records Best_of_N candidates.
- Usecase tests with mock ports: resolving Ask updates the run and calls `SupervisorAskPort.resolveAnswer`; duplicate or missing Ask resolution fails.
- Tool tests/workflow coverage: Ask cancellation marks pending requests cancelled; browser tool calls only `BrowserAutomationPort` and records a bounded transcript entry.
- Frontend checks: composer sends shared attachment/Best_of_N payloads, conversation rows show attachment metadata, pending Ask cards derive from run query data, and answering invalidates `sessionRuns(sessionId)`.

### 7. Wrong vs Correct

#### Wrong

```ts
run.attachments = [{ name, contentBase64 }];
```

```tsx
const [pendingAsk, setPendingAsk] = useState(questionFromSse);
```

```ts
import { PlaywrightBrowserAutomationAdapter } from "../adapters/browser";
await new PlaywrightBrowserAutomationAdapter().run(request);
```

#### Correct

```ts
await workspaceWriterPort.writeBinaryFile({
  project: projectForSessionWorkspace(project, session),
  path: attachment.record.path,
  content: attachment.content,
});
```

```tsx
const pendingAsks = runs.flatMap((run) =>
  (run.askRequests ?? []).filter((ask) => ask.status === "pending"),
);
```

```ts
const result = await browserAutomationPort.run({
  workspacePath: project.workspacePath,
  url,
  actions,
  screenshotPath,
  signal,
});
```

The correct path keeps uploaded bytes in the workspace, keeps live Ask state in durable run records, applies Best_of_N as orchestrator policy, and keeps browser I/O behind a declared port.

## Scenario: Supervisor Autonomous Routing and Candidate Execution

### 1. Scope / Trigger

- Trigger: M4/MVP hardening extends the supervisor loop across shared DTOs, model-gateway routing, supervisor model planning, sandbox startup, CLI dispatch, git worktrees, tmux interactive sessions, candidate verification, and frontend run display.
- Applies when changing supervisor model planning/review/adjudication, supervisor routing decisions, dual CLI execution, Codex/OpenAI gateway behavior, best-of-N candidates, worktree isolation/cleanup, or tmux attach/control behavior.

### 2. Signatures

- `POST /api/supervisor-runs` still accepts task intent fields (`projectId`, `llmCredentialAlias`, `task`, `verificationCommands[]`, `maxIterations`, optional `image`, optional `supervisorModel` override); it must not require per-run CLI strategy or candidate-count selectors.
- `GET /api/supervisor-runs/:runId` returns optional `routingDecision`, `interactiveAttach`, `candidates[]`, and `selectedCandidateId` on the run record.
- `SupervisorModelPort.planAndRoute({ task, availableCliKinds, verificationCommands, maxIterations, maxCandidateCount, decidedAt, modelOverride? })` returns `{ plan, routing }`.
- `SupervisorModelPort.adjudicateCandidates({ task, candidates })` returns `{ selectedId, rationale }`.
- `SupervisorModelPort.reviewImplementation({ task, plan, diff, verificationResults })` returns `{ pass, rationale, repairHint? }`.
- `ALL /api/model-gateway/openai/*` proxies OpenAI-compatible Codex requests using the same session-scoped model gateway token pattern as Anthropic routing.
- `CliSessionPort.dispatchInstruction({ cli, sessionId, sandboxId, instruction })` dispatches a non-interactive CLI instruction for either `claude-code` or `codex`.
- `InteractiveCliPort.startInteractive/sendInput/captureOutput` controls tmux-backed interactive sessions inside the sandbox.
- `GitWorktreePort.createWorktree({ project, runId, candidateId })` creates an isolated candidate worktree without creating a session/candidate-owned branch and returns `{ workspacePath, branchName }`, where `branchName` is the repository's current/global branch metadata.
- `GitWorktreePort.removeWorktree({ project, workspacePath, branchName? })` removes the isolated candidate worktree only. It must not delete `branchName`, because sessions follow the shared repository branch rather than owning disposable branches.
- `SandboxSessionPort.startSessionSandbox(...)` may receive `openAiModelGatewayUrl`; sandbox startup writes Codex gateway config files.

### 3. Contracts

- Routing decision fields: `source` (`model` or `policy`), `cliKinds[]`, `entryMode` (`persistent`, `one-shot`, `interactive-tmux`), `executionShape` (`direct`, `best-of-n`), `candidateCount`, `rationale`, `decidedAt`.
- A configured supervisor model plans and routes first. Missing provider/key, invalid structured output, or model call failure falls back to `derivePlanSteps` + `chooseSupervisorRoute` with `source: "policy"`.
- Model-driven best-of-N adjudication selects the winner by `selectedId`; if adjudication fails or selects an unknown id, fallback selection is first passing candidate, then first candidate.
- Model review runs only after objective verification passes. A failed review becomes a bounded verification failure (`command: "supervisor model review"`) so the existing repair/max-iteration policy remains the single control path.
- Candidate fields: `id`, `sessionId`, `cli`, `entryMode`, `workspacePath`, optional `worktreeBranchName`, optional `sandboxId`, `status`, `verificationResults[]`, optional `diff`, optional `lastError`, optional `interactiveAttach`. `worktreeBranchName`, when present, is display/trace metadata for the shared current branch, not an ownership or cleanup token.
- Candidate worktrees must be removed in a workflow-level `finally` after publish/failure; candidate sandboxes and session tokens must be cleaned up in a candidate-level `finally`.
- Direct interactive runs store optional run-level `interactiveAttach`; best-of-N interactive runs store attach entries on the candidate that owns the tmux session.
- Interactive attach fields: `sandboxId`, `tmuxSessionName`, `attachCommand[]`. The command may identify a sandbox/tmux session, but must not include LLM keys, Git tokens, or model session token values.
- Provider records may include `client` (`claude-code` or `codex`) and `wireApi` (`responses` or `chat`). Missing `client` means legacy `claude-code`.
- OpenAI-compatible gateway fallback uses `session.llmCredentialAlias`, `https://api.openai.com`, and bearer auth. Configured Codex providers use provider credentials and rewrite the requested model through the selected alias, then `default`, then the first configured model.
- Sandbox startup may expose session gateway tokens as `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` to the sandbox. It must not write real keys into env, Docker args, `~/.codex/auth.json`, `~/.codex/config.toml`, logs, activity events, or API responses.
- Supervisor routing is autonomous. Prompt text can express constraints, but UI/API should display the decision rather than require manual per-run CLI/entry/fan-out selection.

### 4. Validation & Error Matrix

- Missing or malformed run request -> `VALIDATION_FAILED` / HTTP 400.
- Missing worktree or interactive port when the routing decision requires it -> `CONFIGURATION_REQUIRED` / HTTP 500.
- Supervisor model provider/key missing or model request fails -> policy fallback, not run failure.
- Supervisor model adjudication fails or references an unknown candidate -> policy fallback selection, not run failure.
- OpenAI proxy missing/invalid model session token -> `UNAUTHORIZED` / HTTP 401.
- OpenAI proxy valid token but missing session -> `SESSION_NOT_FOUND` / HTTP 404.
- OpenAI proxy unsafe path or invalid upstream base URL -> `MODEL_GATEWAY_FAILED` / HTTP 502 before upstream fetch or real provider auth headers are created.
- Candidate verification failure -> candidate `failed`; this is expected run state, not an HTTP route failure.
- No candidate produces a publishable diff -> run `failed`.
- No candidate passes verification -> run `max_iterations_exhausted`; no branch/PR is created.
- Tmux interactive start/send/capture command failure -> `CLI_DISPATCH_FAILED` / HTTP 500; do not synthesize an attach command as if the interactive entry succeeded.

### 5. Good/Base/Bad Cases

- Good: with a configured Claude-compatible provider, a normal task records an LLM-derived plan/routing decision with `source: "model"` and follows that route.
- Good: with no provider/key, a normal task records a policy fallback route and still completes through the legacy path.
- Good: a model chooses Codex/best-of-N; the supervisor creates isolated worktrees that follow the repository's current branch metadata, runs candidates, verifies each, asks the model adjudicator for a winner, publishes only that worktree, then removes all candidate worktrees without deleting the shared branch.
- Good: an interactive route starts tmux inside the Linux sandbox and records an attach command without exposing credentials.
- Base: no Codex provider route exists; OpenAI proxy falls back to the run/session LLM credential alias.
- Bad: adding `cliStrategy`, `entryMode`, or `candidateCount` as required user-facing run-start fields; this turns Janus into manual orchestration instead of supervisor-owned routing.
- Bad: treating the first passing candidate as the winner when a model adjudicator is configured and returns a valid candidate id.
- Bad: leaving `_worktrees/<project>/<candidate>` after a best-of-N run reaches a terminal state, or creating/deleting `janus/<run>/<candidate>` branches as if sessions owned their own branches.
- Bad: writing a real OpenAI key into `~/.codex/auth.json` in the sandbox; only the session gateway token may appear there.
- Bad: swallowing a failed `tmux new-session`, `send-keys`, or `capture-pane` command and still returning an attach command; this makes the UI display a dead interactive entry.

### 6. Tests Required

- Atom tests: routing policy chooses direct Claude default, Codex/best-of-N from prompt constraints, and interactive tmux from prompt constraints.
- Adapter tests: Codex command shape uses `codex exec --json`; tmux adapter starts/sends/captures via `docker exec tmux`; sandbox startup writes Codex config using env-provided session tokens without token literals in command args.
- Adapter tests: tmux command failures throw `CLI_DISPATCH_FAILED` without exposing raw process output.
- Adapter tests: git worktree paths stay inside the configured workspace root, use git worktree commands without `-B janus/<run>/<candidate>`, return the current/global branch metadata, and remove worktrees without deleting shared branches or accepting paths outside the workspace root.
- Usecase tests: model plan/route uses a fake `SupervisorModelPort`; model failures fall back to policy; legacy Claude run still passes; best-of-N creates separate candidate worktrees/sandboxes, stores candidate verification results, uses model adjudication when available, publishes only the selected workspace, and cleans up all candidate worktrees.
- Gateway tests: OpenAI fallback uses session credential; configured Codex provider rewrites `model`; unsafe paths are rejected before auth headers.
- Frontend checks: run display reads `routingDecision`, run-level `interactiveAttach`, and `candidates[]` from shared schemas and does not add required manual strategy selectors.

### 7. Wrong vs Correct

#### Wrong

```ts
await startSupervisorRun({
  task,
  cliStrategy: "codex",
  candidateCount: 3,
});
```

```ts
const routingDecision = chooseSupervisorRoute(...);
const selected = candidates.find((candidate) => passed(candidate));
```

```ts
await writeFile("/home/janus/.codex/auth.json", JSON.stringify({
  OPENAI_API_KEY: realOpenAiKey,
}));
```

```ts
await Bun.spawn(["tmux", "send-keys", instruction]);
```

#### Correct

```ts
const routingDecision = chooseSupervisorRoute({
  task,
  availableCliKinds: ["claude-code", "codex"],
  decidedAt,
});
```

```ts
const { plan, routing } =
  (await supervisorModelPort.planAndRoute(...).catch(() => undefined)) ??
  fallbackPlanAndRoute(task, decidedAt);
const selected =
  (await supervisorModelPort.adjudicateCandidates(...).catch(() => undefined)) ??
  selectCandidateByPolicy(candidates);
```

```ts
try {
  await runBestOfNCandidates(...);
} finally {
  await gitWorktreePort.removeWorktree({ project, workspacePath });
}
```

```ts
await sandboxSessionPort.startSessionSandbox({
  modelSessionToken: await issueModelSessionToken(deps, sessionId),
  modelGatewayUrl,
  openAiModelGatewayUrl,
});
```

```ts
await interactiveCliPort.sendInput({
  sandboxId,
  tmuxSessionName,
  input: instruction,
});
```

The correct path keeps routing policy in pure supervisor atoms, keeps Docker/git/tmux I/O behind ports, and gives the sandbox only session-scoped gateway credentials.

## Scenario: Workspace Project Terminal and Safe Shell Policy

### 1. Scope / Trigger

- Trigger: workspace terminal support adds a WebSocket protocol boundary, project-workspace subprocess I/O, cross-platform Bash resolution, and a shared safe-command policy consumed by frontend display compression.
- Applies when changing `GET /api/projects/:projectId/terminal`, `ProjectTerminalPort`, project terminal adapters, terminal UI connection handling, supervisor bash display compression, or safe shell command classification.

### 2. Signatures

- `GET /api/projects/:projectId/terminal?terminalId=<id>` upgrades to a WebSocket attachment for one project terminal. Missing or blank `terminalId` defaults to `default`.
- WebSocket client -> server messages are raw terminal input strings.
- WebSocket server -> client messages are raw terminal output chunks.
- `ProjectTerminalPort.openTerminal({ projectId, terminalId, workspacePath, onOutput })` returns a `ProjectTerminalSession` attachment.
- `ProjectTerminalSession.write(input)` forwards user input to the terminal session.
- `ProjectTerminalSession.dispose()` detaches the current output subscriber. It must not kill the underlying project terminal when the UI tab closes.
- `classifyShellCommand(command)` returns `{ compressible }` for the shared safe-command policy used by UI tool-call grouping.
- `SandboxCommandPort.runCommand({ sessionId, sandboxId, command, workspacePath? })` executes supervisor `bash` tool commands through an adapter-local workspace containment wrapper.

### 3. Contracts

- The terminal command language is Bash/Linux-style commands.
- Linux/macOS hosts use native `bash` from `PATH`.
- Windows hosts use Git Bash (`GIT_BASH`, common Git for Windows install paths, or `bash.exe`/`bash` on `PATH`); do not fall back to PowerShell or CMD.
- Commands run with `cwd` rooted in the connected project's `workspacePath`.
- Terminal identity is scoped by `projectId + terminalId`. Reopening the same id should reuse the same cwd, input buffer, running command state, and bounded output history for the current server process.
- Terminal persistence is in-process only; terminal sessions are not durable across server restarts unless a future contract explicitly adds storage.
- Closing a frontend tab or WebSocket must detach that client only. It must not dispose the terminal process/state.
- `cd` updates the session cwd only when the target stays inside the project workspace and exists.
- Terminal subprocesses inherit only the process environment allowlist from `runProcess` plus terminal display keys such as `TERM` and `COLORTERM`; Janus control-plane secrets must not be inherited implicitly.
- Supervisor sandbox commands run from the project workspace root. Docker adapters set `docker exec -w /workspace`; local dev adapters set `RunProcessRequest.cwd` to `project.workspacePath`.
- Supervisor sandbox command wrappers must pass the user command and workspace root as argv values to `bash -lc`; do not interpolate either value into the wrapper source. Local dev wrappers pass `.` as the workspace root so Git Bash does not need to parse a Windows host path.
- Supervisor sandbox command wrappers resolve the physical workspace root, install `DEBUG` and `EXIT` traps, and fail if the physical current directory leaves that root. Runtime containment is defense-in-depth on top of lexical command validation.
- Shared safe command families define which shell transcript entries may be visually grouped as low-risk/repetitive UI actions: `pwd`, `ls`, `cat`, `head`, `tail`, `dirname`, `basename`, `which`, `file`, `stat`, `du`, `df`, `grep`, `wc`, `sort`, `uniq`, `cut`, `rg`, `echo`, `printf`, `date`, `whoami`, `id`, `uname`, `find`, `git status`, `git diff`, `git log`, `git show`, `bun test`, `bun run`, package runner `run`/`test`, `node`, `tsc`, and `vitest`.
- Terminal-only or broader supervisor bash commands such as `sleep`, `npm install`, and `python -c "print(1)"` may be valid non-hard-denied runtime commands, but must not be marked `compressible` unless they fit the shared safe display policy.
- Safe command classification is conservative for UI grouping: command lines must tokenize cleanly, each command segment must be in the safe family, and hard-denied syntax/targets remain non-compressible. Pipes, control operators, and redirection may be compressible only when every segment/target remains inside the safe project-local policy.
- UI compression may use the shared `compressible` flag. Supervisor bash runtime validation is separate and uses the hard-deny policy, not the UI compression classifier.
- Supervisor bash hard-deny validation must reject commands that can weaken the containment wrapper or spawn a new uncontrolled shell, including nested shell executables and shell meta builtins such as `exec`, `trap`, `eval`, `command`, `builtin`, `enable`, `alias`, `unalias`, and `source`.

### 4. Validation & Error Matrix

- Missing project -> `PROJECT_NOT_FOUND` and the WebSocket closes after an error chunk.
- Missing project workspace directory -> `PROJECT_NOT_FOUND` and the WebSocket closes after an error chunk.
- Missing native Bash on Linux/macOS -> `CONFIGURATION_REQUIRED` and the WebSocket closes after an error chunk.
- Missing Git Bash on Windows -> `CONFIGURATION_REQUIRED` and the WebSocket closes after an error chunk.
- `cd` target outside the workspace -> terminal prints a bounded error and keeps the previous cwd.
- Supervisor sandbox command leaves the physical workspace during or after execution -> command returns non-zero with `Janus sandbox policy: command left the workspace.` on stderr.
- Active command cancellation -> command process is killed and the session remains usable unless the WebSocket closes.
- WebSocket close before terminal startup finishes -> detach the attachment after startup resolves; do not leave a listener writing to a closed socket.

### 5. Good/Base/Bad Cases

- Good: a Windows developer opens a terminal and runs `pwd`, `ls`, `git status`, and `docker compose ps` through Git Bash while the UI presents Linux command semantics.
- Good: Linux/macOS runs the same commands through native `bash` without platform-specific UI branches.
- Good: closing a Terminal editor tab removes only the tab; selecting the same terminal from the sidebar reattaches to the same terminal id.
- Good: UI tool-call compression groups safe repetitive commands such as `pwd`, `ls`, and `git status`, while supervisor bash validation still allows broader non-hard-denied commands through the default runtime path.
- Good: supervisor `bash` can run `cd apps/server && bun test` because the physical cwd remains under the workspace root.
- Base: WebSocket input sent before terminal startup is buffered and replayed once the terminal session is ready.
- Base: terminal output history is bounded and replayed on reattach; unbounded terminal logs are not retained in memory.
- Base: supervisor `bash` command output is formatted normally when the user command fails for project reasons but the cwd remains inside the workspace.
- Bad: falling back to PowerShell/CMD on Windows; this changes command semantics behind the user's back.
- Bad: marking `ls && rm -rf dist`, `echo secret > .env`, or `rg token | xargs rm` as safe because the first token is harmless.
- Bad: passing a host absolute `workspacePath` inside the shell source text, especially on Windows where Git Bash path parsing differs from Node's path model.
- Bad: allowing `trap`, `eval`, or nested `bash -lc` through supervisor command validation; those commands can weaken the wrapper's runtime checks.
- Bad: making React tab unmount the owner of the terminal process; tab lifecycle and terminal lifecycle must stay separate.
- Bad: running terminal subprocesses from `api/` or `usecases/`; subprocess I/O must stay in an adapter behind `ProjectTerminalPort`.

### 6. Tests Required

- Shared policy tests: every safe display command family returns `{ compressible: true }`; hard-denied, credential, host-path, traversal, variable-expansion, and unsafe target examples return `{ compressible: false }`.
- Supervisor atom tests: `validateSupervisorBashCommand` allows non-hard-denied commands by default and rejects exactly the hard-denied command set.
- Sandbox atom tests: command wrapper argv shape, physical cwd checks, and trap installation.
- Usecase tests with mock ports: opening a project terminal resolves `workspacePath` from `ProjectStorePort`, calls `ProjectTerminalPort`, and rejects missing projects.
- Adapter tests: Bash path resolution for Unix and Windows, cwd confinement, `cd` behavior, cancellation, detach/reattach without terminal disposal, and no implicit secret environment inheritance.
- Adapter tests: Docker and local dev sandbox command adapters execute through the workspace containment wrapper while preserving the adapter-owned cwd.
- API/web integration tests when available: WebSocket route upgrades only for authenticated clients, streams startup errors, and detaches the terminal attachment on close.

### 7. Wrong vs Correct

#### Wrong

```ts
app.get("/api/projects/:projectId/terminal", async () => {
  const child = Bun.spawn(["powershell.exe"]);
});
```

```ts
const safe = command.startsWith("ls");
```

```ts
if (classifyShellCommand(command).compressible) {
  validateSupervisorBashCommand(command);
}
```

```ts
await runProcess({
  command: ["bash", "-lc", `cd "${workspacePath}" && ${command}`],
});
```

#### Correct

```ts
const terminal = await openProjectTerminal.execute({
  projectId,
  terminalId,
  onOutput: (chunk) => ws.send(chunk),
});
```

```ts
const policy = classifyShellCommand(command);
if (policy.compressible) {
  // UI may group this low-risk shell transcript entry with adjacent actions.
}
```

```ts
validateSupervisorBashCommand(command);
await sandboxCommandPort.runCommand({ sessionId, sandboxId, command });
```

```ts
await runProcess({
  command: buildWorkspaceContainedShellCommand({
    shellExecutable: bashPath,
    workspaceRoot: ".",
    command,
  }),
  cwd: project.workspacePath,
});
```

The correct path keeps WebSocket protocol handling in `api/`, project lookup in a usecase, subprocess I/O in the terminal adapter, UI compression in the shared classifier, and supervisor runtime safety in the hard-deny validator.

## Scenario: Supervisor CLI Job Snapshot, Resume, and Terminal Control

### 1. Scope / Trigger

- Trigger: supervisor-dispatched Claude Code and Codex jobs are shown as terminal-like UI entries, can be inspected while running, and can be canceled from the terminal tab.
- Applies when changing supervisor CLI dispatch tools, `SupervisorRunRecord.cliJobs`, CLI adapter output streaming, same-session run context, run cancellation, or frontend terminal/job display.

### 2. Signatures

- `dispatch_claude_code({ instruction, description?, candidateCount?, launch? })` starts asynchronous Claude Code job(s).
- `dispatch_codex({ instruction, description?, candidateCount?, launch? })` starts asynchronous Codex job(s).
- `read_cli_job({ jobId })` returns the current stored `SupervisorCliJobRecord` snapshot for a running or completed job in the same session without waiting for completion.
- CLI adapters receive `DispatchCliInstructionRequest.onOutputLine?: (line: string) => void` and should call it for each stdout line as it arrives when the underlying CLI streams.
- `POST /api/supervisor-runs/:runId/cancel` is the cancellation boundary used by a running CLI terminal's kill action.
- `POST /api/supervisor-runs/:runId/deliver` requests delivery of one queued follow-up run into the currently running run for the same session. This is not a forceful interrupt and must not cancel the current run or pending CLI jobs.
- Starting a run with an existing `sessionId` loads previous runs for that session and passes bounded prior context into the supervisor model's initial messages.
- Same-session supervisor context must replay prior run transcript as role-preserving model messages: `user` text stays a user message, `assistant` text stays an assistant message, and prior tool entries replay as an assistant `tool_use` followed by the corresponding user `tool_result`. Do not collapse prior runs into a single synthetic "previous context" text block as the primary continuity mechanism.
- Tool replay is bounded: truncate model-facing prior tool outputs and transcript text, and select complete message groups so a `tool_result` is never replayed without its matching `tool_use`.
- Todo replay uses parsed/defaulted todo input and the corresponding todo tool output so later runs can continue item wording and statuses instead of recreating the checklist from memory.

### 3. Contracts

- `SupervisorCliJobRecord.description` is optional storage metadata used for terminal/status labels; when omitted, UI may fall back to a one-line instruction summary.
- Running CLI output is persisted to `SupervisorRunRecord.cliJobs[].stdout` from `onOutputLine`; completed job output replaces the final `stdout`/`stderr` with the CLI process result.
- CLI job storage and model tool output have separate bounded limits. `SupervisorRunRecord.cliJobs[].stdout/stderr` is the larger terminal snapshot and may set `stdoutTruncated/stderrTruncated`. Tool transcript output returned to the supervisor model remains smaller and may be shortened even when the stored terminal snapshot is complete.
- The supervisor tool loop has two distinct async paths:
  - `read_cli_job` is an immediate snapshot read for inspection.
  - When the model emits no tool calls while CLI jobs are pending, the loop waits for the next CLI completion and resumes the model with that completed result.
- `read_cli_job` lookup is session-scoped. It must check the current workflow's in-memory pending/completed jobs first, then persisted `SupervisorRunRecord.cliJobs` for the current run and prior runs in the same session. A follow-up run must be able to read a running job that an earlier run in the same session started.
- CLI terminal entries are derived from `SupervisorRunRecord.cliJobs`, include the owning `runId` and `sessionId`, and must not maintain a second frontend-only source of job truth.
- Killing a CLI terminal cancels the owning supervisor run. It must not be presented as a tab-close-only operation or as per-process cancellation unless a per-job backend port exists.
- `SupervisorRunRecord.deliveryRequestedAt` marks that a queued run should be delivered into the active run at the next safe workflow boundary. `deliveredToRunId` and `deliveredAt` record the completed delivery target and time.
- Delivery must wake a supervisor workflow that is waiting for asynchronous CLI or group-discussion completion, then inject the queued task as a user message before the CLI/discussion completes. It must not wait for `read_cli_job`, CLI completion, or model polling.
- Delivery cannot mutate an in-flight model request. If the model request is already in progress, delivery is applied at the next workflow checkpoint after the model returns.
- Codex non-interactive dispatch uses `codex exec --json ...`; `launch.access: "read-only"` maps to `-s read-only`, and full access maps to the configured full-access Codex sandbox mode. Do not pass the removed `-a never` flag.
- Same-session context is bounded by count and character limits and must not include hidden control-plane credentials or raw unbounded CLI logs.

### 4. Validation & Error Matrix

- Unknown CLI job id in `read_cli_job` -> tool failure output `CLI job was not found: <jobId>`.
- Running CLI job in `read_cli_job` -> successful tool result containing `status: running` and any currently stored output.
- Completed failed CLI job in `read_cli_job` -> failed tool result containing the job snapshot and failure status.
- Delivering an unknown run id -> `SUPERVISOR_RUN_NOT_FOUND` / HTTP 404.
- Delivering a run that is not queued, or was already delivered -> no-op response with the current run record.
- Run cancel from a CLI terminal -> supervisor run transitions through the existing cancellation path; pending CLI jobs are stored as `canceled` with bounded retained stdout and cancellation reason.
- CLI executable start failure in dev mode -> CLI result `exitCode: 127` with actionable stderr; no secret values in output.

### 5. Good/Base/Bad Cases

- Good: dispatching Codex creates a running `cliJobs[]` entry, opens a terminal tab, stores streamed stdout lines, and later replaces the job with completed output.
- Good: the supervisor calls `read_cli_job` once to inspect a running job and receives the current snapshot, then stops; Janus resumes automatically when the job completes.
- Good: a long completed Codex result appears fully in the CLI terminal snapshot while the model-facing `read_cli_job` transcript is bounded.
- Good: a second user message in the same session receives bounded role-preserving context from previous supervisor runs, including prior todo/tool results, without changing the visible user transcript.
- Good: a queued follow-up marked via "Send now" is delivered into the active run while a CLI job is still running, and the model can inspect that running job with `read_cli_job`.
- Base: Codex emits no stdout until process completion; the terminal shows a first-output placeholder until final stdout arrives.
- Base: delivery requested while a model request is in flight waits for that model response, then appends the queued user message at the next workflow checkpoint.
- Bad: implementing `read_cli_job` by awaiting the pending process; this makes it unusable for inspecting running jobs and duplicates the automatic resume path.
- Bad: polling `read_cli_job` repeatedly instead of letting the no-tool-call resume path wait for completion.
- Bad: naming queued-message delivery "interrupt" or presenting it as a forceful abort; true cancellation remains `/cancel` or `stop_cli_job`.
- Bad: waiting for async CLI completion before delivering a queued follow-up after `/deliver` has been requested.
- Bad: adding frontend-only job state that can drift from `SupervisorRunRecord.cliJobs`.
- Bad: flattening prior runs into one synthetic summary string; this loses tool-call structure and makes same-session prompts feel disconnected.
- Bad: replaying unbounded file reads, CLI output, or other tool results into every later run.

### 6. Tests Required

- Supervisor workflow tests: dispatch starts without waiting; `read_cli_job` returns same-run and prior-run running snapshots; no-tool-call turns auto-resume on completion; same-session runs include role-preserving prior user/assistant context and replay prior todo tool history.
- Delivery tests: `/deliver`/usecase sets `deliveryRequestedAt`; a workflow waiting on async CLI/group completion wakes immediately, delivers the queued message, and leaves pending CLI jobs running.
- Adapter tests: Codex command shape is `codex exec --json ...` and read-only launch access maps to `-s read-only`.
- Frontend mapper tests: CLI job views include `runId`, `sessionId`, status, description, and output fields from shared run records.
- Cancellation tests: canceling a run with pending CLI jobs stores canceled job state and does not leave terminal jobs running in UI data.

### 7. Wrong vs Correct

#### Wrong

```ts
const completed = await pendingJob.promise;
return formatCliJobForModel(completed);
```

```tsx
setCliJobs((jobs) => [...jobs, frontendOnlyJob]);
```

```ts
await cancelSupervisorRun(queuedRun.id);
```

#### Correct

```ts
const job = pendingJobs.get(jobId)?.job ?? completedJobs.get(jobId);
return formatCliJobForModel(job);
```

```tsx
const cliJobs = toCliJobViews(supervisorRuns);
```

```ts
await deliverQueuedSupervisorRun(queuedRun.id);
```

The correct path keeps job state in the supervisor run store, reserves blocking waits for the automatic no-tool-call resume path, and lets the terminal UI cancel through the existing run cancellation API.

## Scenario: Session Worktree Checkpoints and Branching

### 1. Scope / Trigger

- Trigger: session rewind/branching changes session workspace ownership, Git worktree I/O, checkpoint metadata storage, cross-layer shared DTOs, HTTP endpoints, and frontend conversation controls.
- Applies when changing session workspace creation, checkpoint recording, checkpoint listing, session branch/rewind APIs, conversation version navigation, or future merge/apply flows.

### 2. Signatures

- `SessionRecord.workspacePath?: string` stores the isolated session workspace path when a session owns one.
- `SessionRecord.workspaceBaseRef?: string` stores the Git ref or branch used to create the session workspace.
- `SessionCheckpointRecord` fields: `id`, `projectId`, `sessionId`, optional `runId`, optional `parentCheckpointId`, `ref`, `commitSha`, `title`, `origin`, `createdAt`.
- `GET /api/sessions/:sessionId/checkpoints` returns `{ checkpoints: SessionCheckpointRecord[] }`.
- `POST /api/sessions/:sessionId/branches` accepts `{ checkpointId?, runId?, origin? }` and returns `{ session, checkpoint?, copiedRunCount }`.
- `GitWorktreePort.createSessionWorktree({ project, sessionId, startRef? })` creates a persistent detached session worktree.
- `GitCheckpointPort.createCheckpoint({ project, session, runId, message })` records a Git-native checkpoint ref for a completed run.
- `SessionCheckpointStorePort` owns checkpoint metadata persistence.

### 3. Contracts

- Session runs must use `session.workspacePath` when present; the project main workspace remains the integration target and must not be mutated by ordinary session runs.
- Session worktrees live under the configured Janus workspace root, such as `_sessions/<projectId>/<sessionId>`, and must be path-contained by the Git adapter.
- A completed run creates a checkpoint ref under `refs/janus/checkpoints/<sessionId>/<runId>` and a matching `SessionCheckpointRecord`.
- Checkpoint Git commits use Janus identity and may create a commit only when the session worktree has staged or unstaged changes; a no-change checkpoint still updates the internal ref to `HEAD`.
- Checkpoint parentage is metadata, not inferred from visible transcript rows. Rewind/branch checkpoints use `origin: "rewind"` or `"branch"`; ordinary completed-run checkpoints use `origin: "run"`.
- Branch/rewind creates a new session worktree from the selected checkpoint ref, copies supervisor runs only up to the selected checkpoint, and rewrites copied run/session identifiers so frontend conversation mapping does not duplicate the generated initial user transcript entry.
- Frontend branch/version navigation is derived from checkpoint metadata and TanStack Query data; it must not maintain a second server-state source of truth.
- Merge/apply into the main workspace is a separate explicit workflow. Conflict resolution must happen in an isolated integration worktree before the main workspace is updated.

### 4. Validation & Error Matrix

- Missing source session -> `SESSION_NOT_FOUND` / HTTP 404.
- Missing source project -> `PROJECT_NOT_FOUND` / HTTP 404.
- Missing selected checkpoint -> `SESSION_CHECKPOINT_NOT_FOUND` / HTTP 404.
- Branch/rewind without configured `GitWorktreePort` -> `CONFIGURATION_REQUIRED` / HTTP 500.
- Git worktree/checkpoint subprocess failure -> `WORKSPACE_SYNC_FAILED` / HTTP 500 with a generic, secret-free message.
- Worktree path escaping the configured workspace root -> `VALIDATION_FAILED` / HTTP 400 before any Git subprocess call.

### 5. Good/Base/Bad Cases

- Good: a new session starts in its own worktree and completed runs produce retained Git refs plus checkpoint metadata.
- Good: editing a user message branches from that run checkpoint with `origin: "rewind"`, starts a new run in the new session, and shows version navigation at the rewind point.
- Good: branching copies the conversation into a new session without carrying a live sandbox id, completed timestamp, or last error from the source session.
- Base: an existing legacy session without `workspacePath` may continue to use the project workspace until migrated, but new sessions should receive session worktrees when the port is configured.
- Base: a no-op completed run records a checkpoint at the current `HEAD` so the conversation graph remains durable.
- Bad: running a session agent directly in `project.workspacePath` when a session worktree exists.
- Bad: storing checkpoint code state as Janus-only patch blobs while also relying on Git for merge/conflict semantics.
- Bad: copying supervisor runs without rewriting the generated initial user transcript id; the frontend will display duplicate user messages.

### 6. Tests Required

- Adapter tests: `createSessionWorktree` uses `git worktree add --detach <path> <startRef>` and keeps the path inside the workspace root.
- Adapter tests: `createCheckpoint` stages/commits only the session workspace when changes exist, updates `refs/janus/checkpoints/...`, and does not leak credentials into command arrays.
- Usecase tests: branch/rewind selects checkpoints by `checkpointId` or `runId`, creates a session worktree from the checkpoint ref, copies runs only through the checkpoint, rewrites copied run transcript ids, and saves branch/rewind checkpoint metadata.
- Store tests or smoke coverage: checkpoint rows survive process-local store round trips and are deleted with their owning session.
- Frontend checks: user message actions expose copy, branch, and edit; checkpoint version controls derive from checkpoint query data and do not duplicate server state.

### 7. Wrong vs Correct

#### Wrong

```ts
await runSupervisorRunWorkflow(deps, {
  project,
  session,
  workspacePath: project.workspacePath,
});
```

```ts
const copiedRun = { ...run, id: newRunId, sessionId: newSessionId };
```

#### Correct

```ts
const workspaceProject =
  session.workspacePath === undefined
    ? project
    : { ...project, workspacePath: session.workspacePath };
```

```ts
const copiedTranscript = run.transcript.map((entry) =>
  entry.kind === "user" && entry.id === `${run.id}-user-1`
    ? { ...entry, id: `${newRunId}-user-1` }
    : entry,
);
```

The correct path keeps session code state isolated in Git-native worktrees/checkpoints, preserves one source of truth for conversation history, and leaves main-workspace mutation to an explicit future merge/apply workflow.
