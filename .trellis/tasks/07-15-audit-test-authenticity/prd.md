# Improve Test Authenticity and Reduce Over-Mocking

## Goal

Make CI test results a more trustworthy signal by reducing reliance on `forceExit`, global infrastructure mocks, and mock-only route tests for critical auth/rate-limit/TTS paths.

## What I Already Know

* Audit finding (P1/Medium): Jest scripts/config enable `forceExit` while also detecting open handles; this can hide leaks.
* Global setup mocks Mongoose, rate limiters, config, and storage broadly.
* Representative `authRoutes` tests mock controllers/middleware into noops and mostly assert helpers.
* Recommended direction: layered tests (unit / Express supertest integration / memory Mongo / Rust contract) and a non-`forceExit` critical suite.

## Assumptions

* Removing `forceExit` globally in one step may temporarily turn CI red due to historical leaks; phased approach is acceptable.
* Project forbids local test execution; implementation should still leave runnable workflow-oriented config/scripts.
* No new testing frameworks or dependency installs.

## Requirements

* Inventory current Jest config and npm test scripts that pass `--forceExit`.
* Introduce a phased plan in code:
  * keep some unit suites mock-friendly
  * create or mark a critical integration suite that avoids `forceExit` and minimizes global mocks
* Improve at least one high-value suite (prefer auth route wiring or rate-limit/auth middleware integration) so it exercises real middleware/controller wiring instead of pure mock graph shape.
* Ensure teardown hooks exist for resources introduced/touched by the improved suite.
* Document residual suites still requiring `forceExit` and why.
* Do not weaken assertions just to keep green under forceExit removal.

## Acceptance Criteria

* [ ] Test config/scripts clearly distinguish mock unit tests vs higher-authenticity suites.
* [ ] At least one critical path has a more authentic test (realer wiring, fewer noops).
* [ ] A path exists to run a non-`forceExit` critical suite in CI (job can start non-blocking if needed).
* [ ] Open-handle risks are acknowledged with teardown improvements where practical.
* [ ] Changes committed and pushed.

## Definition of Done

* Testing authenticity measurably improved for selected critical coverage.
* Remaining forceExit debt documented.
* Conventional commit pushed.

## Technical Approach

1. Read `jest.config.js`, `src/tests/setup.ts`, package test scripts.
2. Add suite selection via config projects/testPathPattern or dedicated script without installing tools.
3. Upgrade one auth/security suite toward authentic wiring.
4. Leave global cleanup incremental rather than boiling the ocean.

## Decision (ADR-lite)

**Context**: Instant full removal of mocks/`forceExit` is high churn and may block all CI.

**Decision**: Phase the authenticity upgrade: structure + one critical suite first; global forceExit removal is progressive.

**Consequences**: Immediate signal quality gains without requiring a perfect green integration world on day one.

## Out of Scope

* Mutation testing, full coverage gates, browser e2e framework introduction.
* Rewriting all existing tests.
* Local test execution in the agent environment.

## Technical Notes

* Files: `package.json` test scripts, `jest.config.js`, `src/tests/setup.ts`, `src/tests/authRoutes.test.ts`, related security tests
* Audit refs: finding "测试基础设施用 forceExit 掩盖开放句柄"; fix-before-release item 5
