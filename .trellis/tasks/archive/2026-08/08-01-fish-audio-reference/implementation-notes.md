# Implementation Notes

## Data flow

`EnvManager` -> protected admin TTS provider update -> `mergeTtsProviderAdminUpdate` -> validated Fish catalog request stored under `TTS_PROVIDER` -> `/api/tts/fish-catalog` server proxy -> normalized safe records -> `TTSForm` Fish selector -> `voice` `_id` -> Fish `reference_id`.

## Safety boundary

Catalog curl input is restricted to HTTPS `api.fish.audio`, GET requests, expected endpoint paths, and an explicit request-header allowlist. Admin reads replace the Authorization value with `Bearer ***`; public responses omit all request metadata and upstream fields not needed to select or preview a voice. Upstream errors are replaced with a generic client message and logs redact Bearer values.

## Verification constraint

Local build/test execution was intentionally not performed because the repository instruction requires actual build and test commands to run only in GitHub Actions. Static checks completed: `git diff --check`, supplied credential scan, route/reference search, and manual cross-layer review.
