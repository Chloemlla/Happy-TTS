# Repository Governance Guardrails

Sustainable quality rails for the audit findings around oversized TypeScript modules, frontend bundle weight, authentic test coverage, and fingerprint/IP privacy contracts.

These rails intentionally avoid a big-bang rewrite of the existing oversized modules. They stop the debt from growing and make the critical checks runnable in CI.

## Guardrails

| Check | Command | What it enforces |
| --- | --- | --- |
| TypeScript size | `pnpm run check:ts-file-size` | New `.ts/.tsx` files must stay ≤ 800 lines. Existing oversized files are grandfathered only while they do not grow. |
| Frontend bundle budget | `pnpm run check:frontend-bundle` | After a production frontend build, entry/chunk/total gzip budgets and isolated heavy-dependency chunks must hold. |
| Privacy contract | `pnpm run check:privacy-contract` | `docs/privacy-data-map.json` is complete, evidence files exist, and retention/delete/export fields are present. |
| Unit/critical CI | `pnpm run test --config jest.ci.config.js --ci --runInBand` | Existing self-contained Jest suite. |
| Mongo replica integration | `pnpm run test:integration:mongo` | Real replica-set transaction + TTL index semantics when `MONGO_REPLICA_URI` is set. |
| Browser cookie smoke | `pnpm run test:browser` | Playwright verifies HttpOnly `synapse_token` cookie set/read/clear. |
| Nightly live APIs | `pnpm run test:nightly` | Live-environment tests excluded from PR CI. |

## TypeScript size policy

- Soft product limit: **800 lines** for application `.ts/.tsx` files.
- Existing files above the limit may remain until intentionally split.
- CI fails if:
  - a **new** file is added above 800 lines, or
  - a **previously compliant** file crosses 800, or
  - a **legacy oversized** file grows further.
- Preferred split order for debt paydown: pure helpers → API hooks/services → section components → route metadata tables.

Current known oversized hotspots (do not rewrite in this change set):

- `frontend/src/utils/integrityCheck.ts`
- `frontend/src/components/EnvManager.tsx`
- `frontend/src/components/CDKStoreManager.tsx`
- `frontend/src/components/LibreChatPage.tsx`
- `frontend/src/components/LogShare.tsx`
- `frontend/src/components/UserProfile.tsx`
- `src/services/ecoEnchantsService.ts`
- `src/controllers/adminController.ts`
- `src/services/dataCollectionService.ts`
- `src/routes/index.ts`
- `frontend/src/App.tsx`

## Frontend bundle policy

Heavy runtime libraries must stay route/feature-isolated:

- documents: `docx`, `jszip`
- pdf: `jspdf`, `html2canvas`, `canvg`
- diagrams: `mermaid`, `katex`
- charts: `chart.js`, `react-chartjs-2`
- code highlight: `react-syntax-highlighter` / `prismjs`
- fingerprint: `@fingerprintjs/fingerprintjs` (dynamic import)

Budget defaults (gzip):

- entry JS ≤ `FRONTEND_ENTRY_MAX_GZIP_KB` (default 220)
- any single JS chunk ≤ `FRONTEND_CHUNK_MAX_GZIP_KB` (default 1800)
- total JS/CSS ≤ `FRONTEND_TOTAL_MAX_GZIP_KB` (default 4525)

The checker also requires the named heavy chunks above to be present in `frontend/dist`.
Production obfuscation uses a fixed non-zero seed so equivalent builds have reproducible hashes and gzip measurements.

## Test matrix

See [`docs/test-matrix.md`](./test-matrix.md) for unit / integration / browser / nightly ownership and CI entrypoints.

## Privacy contract

See:

- [`docs/privacy-data-map.json`](./privacy-data-map.json)
- [`docs/privacy-fingerprint-ip-contract.md`](./privacy-fingerprint-ip-contract.md)

## Local non-build checks

These can run without compiling the app:

```bash
pnpm run check:ts-file-size
pnpm run check:privacy-contract
pnpm run test --config jest.ci.config.js --ci --runInBand --testPathPatterns=authCookieSession
```

Build-backed checks (CI or explicit local builds only):

```bash
pnpm --dir frontend run build
pnpm run check:frontend-bundle
pnpm run test:browser
MONGO_REPLICA_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true' pnpm run test:integration:mongo
```
