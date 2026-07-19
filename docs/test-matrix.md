# Test Matrix

Maintainable entrypoints for authentic coverage without forcing every PR through live external systems.

## Layers

| Layer | Purpose | Entrypoint | Required secrets / services | Cadence |
| --- | --- | --- | --- | --- |
| Unit / contract (mocked) | Fast hermetic regressions | `pnpm run test --config jest.ci.config.js --ci --runInBand` | none | every PR (`tsc.yml`) |
| Critical auth/security slice | Smaller high-signal subset | `pnpm run test:critical` | none | local / optional CI |
| Governance rails | File-size, privacy map, bundle budget | `pnpm run check:ts-file-size` · `pnpm run check:privacy-contract` · `pnpm run check:frontend-bundle` | frontend build for bundle only | every PR (`quality-guardrails.yml`) |
| Mongo replica integration | Real sessions/transactions/TTL indexes | `pnpm run test:integration:mongo` | MongoDB replica set via `MONGO_REPLICA_URI` | every PR (service container) |
| Browser smoke | Cookie identity surface in a real browser | `pnpm run test:browser` | Playwright Chromium + lightweight cookie contract server | every PR |
| Nightly live APIs | Real deployment/API-dependent tests excluded from PR CI | `pnpm run test:nightly` | prepared live env vars | scheduled nightly / manual |

## What belongs where

### PR-required

- Jest CI suite (`jest.ci.config.js`)
- TypeScript/backend/frontend build already covered by `tsc.yml`
- TS size guard
- Privacy contract validation
- Frontend bundle budget (uses the built `frontend/dist`)
- Mongo replica integration
- Browser HttpOnly cookie smoke

### Nightly / manual only

These remain excluded from `jest.ci.config.js` and are intentionally re-enabled in the nightly job:

- `src/tests/logshare-mongodb.test.ts`
- `src/tests/policyApi.test.js`
- `src/tests/ipfs-upload.test.ts`
- `src/tests/network-apis.test.ts`
- `src/tests/media-social-life-apis.test.ts`
- `src/tests/ip-query.test.ts`
- `src/tests/yiyan-api.test.ts`

## Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `MONGO_REPLICA_URI` | Mongo integration | Example: `mongodb://127.0.0.1:27017/?replicaSet=rs0` |
| `TS_SIZE_BASE_REF` / `GITHUB_BASE_SHA` | TS size guard | Diff base for growth detection |
| `FRONTEND_ENTRY_MAX_GZIP_KB` | Bundle budget | default `220` |
| `FRONTEND_CHUNK_MAX_GZIP_KB` | Bundle budget | default `700` |
| `FRONTEND_TOTAL_MAX_GZIP_KB` | Bundle budget | default `2600` |
| Live API credentials | Nightly suite | repository secrets; job skips when unset |

## Adding a new authentic test

1. Prefer hermetic unit/contract tests first.
2. If the bug depends on Mongo index/session/transaction semantics, put it under `tests/integration/` and keep it free of the global Mongoose mock in `src/tests/setup.ts`.
3. If the bug depends on browser cookie/storage/navigation, put it under `tests/browser/`.
4. If the bug depends on a real external API or deployed stack, add it to the nightly path and keep it ignored by `jest.ci.config.js`.
5. Document the new entry in this file and, if needed, extend `.github/workflows/quality-guardrails.yml` or `nightly-test-matrix.yml`.

## Current known coverage gaps (tracked, not rewritten here)

- Cookie-only TTS submit/quota ownership end-to-end path still needs a dedicated integration once TTS auth helper reuse lands.
- Billing failure-injection suite is still placeholder-only under `src/services/billing/__tests__/`.
- Frontend component coverage remains thin relative to page count; prefer tests around extracted hooks/pure helpers as oversized pages are split.
