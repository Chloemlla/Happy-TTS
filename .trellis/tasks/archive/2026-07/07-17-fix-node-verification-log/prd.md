# Fix Node verification log (TS6 Jest bootstrap)

## Goal
Unblock GitHub Actions **Node verification** job so Jest suites can load under TypeScript 6.

## Failure (from test-data/1_Node verification.txt)
- All 89 suites fail before any test runs
- Root error:
  `TS5107: Option 'moduleResolution=node10' is deprecated ... Specify compilerOption "ignoreDeprecations": "6.0"`
- Cause: `tsconfig.jest.json` uses `"moduleResolution": "node"` (alias of node10) with `typescript@6.0.3`

## Fix
- Add `"ignoreDeprecations": "6.0"` to `tsconfig.jest.json` so Jest can continue using CommonJS + classic resolution without TS5107 hard-fail.

## Out of Scope
- Migrating the whole Jest suite to Node16/ESM module resolution
- Fixing unrelated individual test assertion failures after suites load

## Acceptance
- [x] tsconfig.jest.json silences TS5107 for moduleResolution=node under TS 6
- [ ] Commit + push for CI re-run
