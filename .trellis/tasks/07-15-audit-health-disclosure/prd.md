# Reduce Health Endpoint Info Disclosure

## Goal

Shrink the unauthenticated health endpoint response to the minimum required for liveness/readiness checks, preventing reconnaissance via uptime, dependency inventory, WebSocket counts, and startup diagnostics detail.

## What I Already Know

* Current `src/routes/healthRoutes.ts` `GET /` returns:
  * `status`, `uptime`, `mongo`, `wsConnections`
  * full `startupReadiness` summary
  * full `dependencies` list from startup diagnostics
  * timestamp
* Status becomes `degraded` with HTTP 503 when Mongo is down or required startup failures exist.
* This is useful for operators but over-exposes internal topology to any caller that can hit the health route.
* Project already has richer admin/startup diagnostics elsewhere that can remain authenticated or internal.

## Assumptions

* Public/liveness clients only need a coarse status (and maybe minimal mongo/ready boolean).
* Detailed dependency reports should require auth, internal network restriction, or a separate protected route.
* Existing monitors that only check HTTP status code will keep working; monitors parsing rich JSON may need a documented compatibility choice.

## Requirements

* Split or reshape health responses into:
  * public/minimal health (status + optional safe fields)
  * detailed diagnostics (auth-protected or explicitly internal)
* Remove or gate: dependency inventory, startup failure details, websocket connection counts, and other environment fingerprinting fields from the public payload.
* Keep readiness usefulness: unhealthy states should still surface as non-200 when core dependencies fail.
* Document the final public contract so deploy probes are not guesswork.
* Do not break route registration/middleware order unexpectedly; keep rate limiting expectations intact if present.

## Acceptance Criteria

* [ ] Unauthenticated health response no longer includes full dependency/startup diagnostics inventory.
* [ ] Core up/down or ready/degraded signal remains reliable for probes.
* [ ] Detailed diagnostics remain available through a safer channel (auth/admin/internal) or are intentionally removed with rationale.
* [ ] Route behavior and status codes are documented in code comments or ops docs as needed.
* [ ] Changes committed and pushed.

## Definition of Done

* Public disclosure reduced without losing operational probe value.
* Static review of health route + consumers complete.
* Conventional commit pushed.

## Technical Approach

1. Inspect current health route consumers in frontend/deploy configs.
2. Reduce public payload; move details behind auth or a dedicated internal path if needed.
3. Ensure degraded/503 semantics remain correct.
4. Note any probe JSON field removals in docs.

## Decision (ADR-lite)

**Context**: Health checks need to stay simple, but the current payload is an unauthenticated architecture map.

**Decision**: Prefer minimal public health and protected detailed diagnostics over deleting health entirely.

**Consequences**: Operators with privileged access still get deep diagnostics; anonymous scanners get only coarse status.

## Out of Scope

* Building full Prometheus/APM stack.
* Changing non-health observability middleware.
* Broad WAF/route policy redesign.

## Technical Notes

* Primary file: `src/routes/healthRoutes.ts`
* Related: `src/config/startupDiagnostics`, `wsService`, route index registration
* Specs: `.trellis/spec/backend/security-boundary-contracts.md`
