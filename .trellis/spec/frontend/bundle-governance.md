# Frontend Bundle Governance

## 1. Scope / Trigger

Apply this contract when changing frontend runtime dependencies, Vite chunking/minification, production obfuscation, or bundle-budget defaults.

## 2. Signatures

- CI build: `cd frontend && pnpm run build`
- Budget gate: `pnpm run check:frontend-bundle`
- Budget environment keys:
  - `FRONTEND_ENTRY_MAX_GZIP_KB` (default `220`)
  - `FRONTEND_CHUNK_MAX_GZIP_KB` (default `1800`)
  - `FRONTEND_TOTAL_MAX_GZIP_KB` (default `4525`)
- Production obfuscation: both `JavaScriptObfuscator.obfuscate(...)` calls receive the same non-zero `OBFUSCATION_SEED`.

## 3. Contracts

- The checker reads `frontend/dist/.vite/manifest.json` after the production build.
- It measures every emitted `.js` and `.css` asset with gzip level 9.
- Entry, individual chunk, and aggregate limits are enforced independently.
- `documents`, `pdf`, `diagrams`, `charts`, and `fingerprint` must remain isolated chunks.
- Budget defaults in the checker, `docs/repository-governance.md`, and `docs/test-matrix.md` must stay synchronized.
- Obfuscation must be reproducible: seed `0` or an omitted seed is forbidden because equivalent builds can produce different hashes and gzip totals.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Manifest missing or has no entry | Fail with an actionable build prerequisite |
| Entry exceeds 220 KiB gzip | Fail the entry budget |
| Any JS chunk exceeds 1800 KiB gzip | Fail the chunk budget |
| Total JS/CSS exceeds 4525 KiB gzip | Fail the aggregate budget |
| Required heavy chunk is absent | Fail the isolation contract |
| Obfuscator seed is zero/omitted | Reject in review as nondeterministic governance |

## 5. Good / Base / Bad Cases

- Good: a feature adds justified runtime code, the deterministic measured baseline is documented, and only the necessary budget receives narrow headroom.
- Base: chunk names or hashes change while all three budgets and required isolation still pass.
- Bad: lazy-load or split code solely to address an aggregate failure; the checker sums every emitted asset, so total gzip does not materially decrease.

## 6. Tests Required

- Run the `Frontend bundle budget` GitHub Actions job; local production builds are prohibited by repository policy.
- Assert the job reports the expected entry/chunk/total defaults and zero violations.
- After changing obfuscation settings, compare repeated workflow builds of the same tree; hashes and gzip totals must be stable.
- When changing a budget default, search all documentation references and assert they match the checker.

## 7. Wrong vs Correct

### Wrong

```ts
JavaScriptObfuscator.obfuscate(code, {
  stringArray: true,
});
```

### Correct

```ts
const OBFUSCATION_SEED = "synapse-production-v1";

JavaScriptObfuscator.obfuscate(code, {
  seed: OBFUSCATION_SEED,
  stringArray: true,
});
```

The fixed non-zero seed keeps the security-through-obscurity transform reproducible; it is not a security boundary.
