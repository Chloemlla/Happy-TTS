# Fix wsService ESM import extension

## Goal

Fix the TypeScript TS2835 error in `src/services/wsService.ts` so the backend compiles with Node16 ECMAScript module resolution.

## Requirements

* Add the required `.js` extension to the relative dynamic import of `configurationNoticeService`.
* Do not change runtime behavior or unrelated files.

## Acceptance Criteria

* [ ] The dynamic import resolves as `./configurationNoticeService.js` in source TypeScript.
* [ ] The change is limited to the requested import-path compatibility fix.
* [ ] CI type-check is expected to pass; local build/test commands are not run per repository instructions.

## Definition of Done

* Code change reviewed against backend conventions.
* A conventional commit is created for the change.

## Technical Approach

Use the Node16-compatible emitted-runtime extension `.js` in the TypeScript relative dynamic import. TypeScript resolves this to the corresponding `.ts` source during compilation and preserves `.js` for runtime output.

## Out of Scope

* Updating unrelated extensionless imports.
* Running builds or tests locally.
* Modifying existing uncommitted user changes.

## Technical Notes

* Error location: `src/services/wsService.ts:236`.
* Compiler configuration uses `module` and `moduleResolution` set to `Node16`.
