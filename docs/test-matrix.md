# Test Matrix

CI entrypoints are split by ownership so pull requests get broad, reproducible coverage while live systems remain isolated.

## Layers

| Layer | Purpose | Entrypoint | Required services | Cadence |
| --- | --- | --- | --- | --- |
| Backend unit / contract | Hermetic Jest suite plus broad backend coverage | `pnpm run test:ci` | none | every PR (`tsc.yml`) |
| Frontend unit / component | Vitest suite plus broad frontend coverage | `pnpm --dir frontend run test:ci` | none | every PR (`tsc.yml`) |
| Critical auth/security slice | Smaller high-signal subset | `pnpm run test:critical` | none | local / optional CI |
| Governance rails | File size, privacy map, bundle budget | `pnpm run check:ts-file-size` · `pnpm run check:privacy-contract` · `pnpm run check:frontend-bundle` | frontend build for bundle only | every PR (`quality-guardrails.yml`) |
| Mongo replica integration | Real sessions, transactions, and TTL indexes | `pnpm run test:integration:mongo` | MongoDB replica set via `MONGO_REPLICA_URI` | every PR (service container) |
| Browser smoke | Cookie identity surface in a real browser | `pnpm run test:browser` | Playwright Chromium and cookie contract server | every PR |
| Nightly Mongo contracts | Real app and Mongo persistence contracts | `pnpm run test:nightly:core` | MongoDB | scheduled nightly / manual |
| Nightly external APIs | Network and third-party API probes | `pnpm run test:nightly:external` | outbound network; `IP_QUERY_KEY` only for strict IP assertions | scheduled nightly / manual |

`pnpm run test:nightly` runs both nightly layers for a fully prepared manual environment.

## Coverage gates

Coverage is collected from production scope, including files that no test imports. Test files, declarations, and generated/build output are excluded.

| Surface | Statements | Functions | Branches | Lines |
| --- | ---: | ---: | ---: | ---: |
| Backend `src/**/*.{ts,tsx}` | 8% | 7% | 5% | 8% |
| Frontend `frontend/src/**/*.{ts,tsx}` | 1% | 0.8% | 0.5% | 1% |

These are phase-one non-zero baselines for a large legacy surface. Raising them should accompany new focused tests; narrowing collection to already-tested files is not acceptable. The Node verification workflow uploads backend and frontend coverage artifacts on every run.

The frontend uses `frontend/vitest.coverage-provider.mjs`, a repository-local Istanbul provider backed by the Istanbul libraries already shipped in the root Jest dependency graph. No additional install step is required in CI.

## Mock ownership

`src/tests/setup.ts` only establishes test environment defaults, directories, seed data, timeout, and registered cleanup tasks. It must not mock database, authentication, IP, tamper, rate-limit, console, or process boundaries globally.

Tests that intentionally cross an Express route while bypassing infrastructure import the relevant helper explicitly from `src/tests/helpers/`. Nightly and integration tests must not import those helpers when they are intended to verify real MongoDB or live network behavior.

## Nightly ownership

### Always-run Mongo core

- `src/tests/logshare-mongodb.test.ts`
- `src/tests/policyApi.test.ts`

The policy test is a real Jest/Supertest contract and asserts version reporting, consent record/check/revoke behavior, and invalid-checksum rejection.

### External matrix

- `src/tests/ipfs-upload.test.ts`
- `src/tests/network-apis.test.ts`
- `src/tests/media-social-life-apis.test.ts`
- `src/tests/ip-query.test.ts`
- `src/tests/yiyan-api.test.ts`

The scheduled workflow always runs the credential-free external probes. Strict IP-query assertions are skipped only when `IP_QUERY_KEY` is unavailable; the workflow maps the existing `IP_QUERY_API_KEY` repository secret to that runtime variable. Missing unrelated secrets no longer turn the whole external layer into a successful no-op.

## Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `MONGO_REPLICA_URI` | Mongo integration | Example: `mongodb://127.0.0.1:27017/?replicaSet=rs0` |
| `MONGO_URI` | Nightly Mongo core | The workflow starts a local MongoDB container |
| `TEST_ADMIN_PASSWORD` | LogShare nightly contract | Must match `ADMIN_PASSWORD` |
| `IP_QUERY_KEY` | Strict external IP-query tests | Workflow maps repository secret `IP_QUERY_API_KEY`; only those assertions skip when absent |
| `TS_SIZE_BASE_REF` / `GITHUB_BASE_SHA` | TypeScript size guard | Diff base for growth detection |
| `FRONTEND_ENTRY_MAX_GZIP_KB` | Bundle budget | Default `220` |
| `FRONTEND_CHUNK_MAX_GZIP_KB` | Bundle budget | Default `700` |
| `FRONTEND_TOTAL_MAX_GZIP_KB` | Bundle budget | Default `2600` |

## Adding an authentic test

1. Prefer a hermetic unit or contract test first and mock only the boundary owned by that test.
2. Put Mongo index/session/transaction semantics under `tests/integration/` or the nightly Mongo config without persistence mocks.
3. Put browser cookie/storage/navigation behavior under `tests/browser/`.
4. Put real external API or deployed-stack behavior in the optional nightly config, not PR Jest.
5. Update this matrix and the owning workflow whenever a test changes layers.
