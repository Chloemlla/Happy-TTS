# Fish Audio model reference configuration and TTS rendering

## Goal

Allow administrators to configure the Fish Audio model-list request from the environment manager and let the public TTS generation page load and render the returned Fish Audio voice models. Selecting a model should provide its Fish Audio reference ID to the existing Fish TTS generation flow without exposing the configured authorization token to browser storage or application logs.

## What I already know

* The repository already supports OpenAI and Fish Audio as TTS providers.
* `frontend/src/components/env-manager/TtsProviderConfigSection.tsx` currently configures Fish Base URL, a single Reference ID, and an API Key.
* `frontend/src/components/TTSForm.tsx` loads `/api/tts/provider-config` and currently renders a static provider voice configuration; Fish uses the administrator-configured reference ID.
* The supplied Fish Audio model-library request is `GET https://api.fish.audio/model/web` with pagination/filter/sort query parameters and several authorization/workspace headers.
* The supplied Fish Audio default-voice request is `GET https://api.fish.audio/model/default-voices?language=zh` with the same authorization/workspace header pattern.
* The supplied model-library response is a paginated object containing model records with `_id`, `title`, `description`, `cover_image`, `languages`, `tags`, `samples`, counts, and `author` data, plus `has_more`.
* The supplied default-voice response is a plain array of the same model-record shape, currently containing English default voices despite the `language=zh` query.
* Runtime TTS settings are persisted by `RuntimeConfigService` under the `TTS_PROVIDER` key, while administrator configuration is protected by the existing admin route.
* The repository instructions prohibit local build/test execution and dependency installation; verification must be performed through GitHub Actions.

## Assumptions (temporary)

* The raw curl command is an administrator-only configuration input and must be normalized before persistence; the browser should call a same-origin backend endpoint to retrieve model metadata.
* Fish model metadata is used for voice/reference selection; the existing Fish TTS generation endpoint remains the source of audio generation.
* The API token and other sensitive headers must never be returned by public configuration endpoints or rendered in the public page.

## Requirements (evolving)

* Add administrator configuration for both Fish Audio model-library and default-voice requests.
* Parse/validate the configured requests and preserve the required query parameters and headers needed by Fish Audio.
* Add protected backend proxy/read endpoints for fetching both Fish Audio sources, without exposing upstream credentials.
* Normalize both the paginated model-library response and the plain default-voice array into safe frontend records.
* Render Fish Audio model cards in the TTS generation page with title, author, description/tags, language, and an optional sample preview.
* Selecting a Fish Audio model or default voice uses its `_id` as the generation `reference_id` while retaining the existing request contract.
* Handle loading, empty, malformed, unauthorized, and upstream failure states without breaking OpenAI or the existing Fish fallback behavior.
* Redact API tokens from API responses, logs, and user-visible errors.

## Acceptance Criteria (evolving)

* [ ] An administrator can save the supplied Windows curl commands for both endpoints in the environment manager and reload them without losing non-secret request data.
* [ ] Invalid or unsafe curl input is rejected with a clear validation message.
* [ ] The public TTS page can request both configured Fish sources through the backend and receives only safe model metadata.
* [ ] Fish model/default-voice titles and reference IDs from both supplied response shapes are visible/selectable in the TTS page.
* [ ] Selecting a model or default voice results in a generation request using that record's Fish reference ID.
* [ ] API credentials are not present in browser-visible public config, rendered markup, logs, or error messages.
* [ ] Existing OpenAI and manually configured Fish flows remain compatible.
* [ ] GitHub workflow lint/type-check/tests are green.

## Definition of Done (team quality bar)

* Tests added or updated for request normalization, secret redaction, backend proxy behavior, and the Fish selector UI/data flow where the repository test setup supports it.
* GitHub Actions verification is configured/green; no local build or test commands are run.
* No new dependency is installed.
* A conventional commit is created after implementation, without including unrelated worktree files.

## Out of Scope

* Editing or deleting Fish Audio models.
* Replacing the existing TTS audio generation provider implementation.
* Persisting all upstream model metadata in the local database.
* Exposing the Fish API token or upstream request headers to public clients.

## Technical Notes

* Relevant files: `frontend/src/components/env-manager/TtsProviderConfigSection.tsx`, `frontend/src/components/TTSForm.tsx`, `frontend/src/utils/ttsProviderConfig.ts`, `src/controllers/ttsProviderController.ts`, `src/routes/admin/config.ts`, `src/routes/ttsRoutes.ts`, and `src/services/runtimeConfigService.ts`.
* Frontend and backend specs: `.trellis/spec/frontend/index.md` and `.trellis/spec/backend/index.md`.
* The provided authorization value is treated as a secret example and must not be committed.

## Decision (ADR-lite)

**Context**: Fish Audio exposes two useful voice sources with different response shapes, and the browser must not receive the upstream authorization/workspace headers.

**Decision**: The environment manager accepts the raw Windows curl commands for both endpoints. The backend parses and validates them, stores the endpoint/query/header configuration in the existing runtime configuration mechanism, and proxies each request. The public frontend receives only normalized, safe voice metadata. The two sources are presented as separate Fish Audio sections so users can distinguish curated model-library voices from default voices.

**Consequences**: The implementation must include a constrained curl parser and secret redaction. Upstream response changes are isolated in the backend normalization layer. The frontend does not need Fish credentials, but catalog availability depends on the configured backend request remaining valid.
