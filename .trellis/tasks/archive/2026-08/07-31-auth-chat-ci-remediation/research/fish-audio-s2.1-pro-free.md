# Fish Audio S2.1 Pro Free API contract

Source: https://fish.audio/zh-CN/blog/s2-1-pro-free-api/

Reviewed on 2026-07-31 for the runtime TTS provider implementation.

## Request contract

- Method and URL: `POST https://api.fish.audio/v1/tts`
- Authentication: `Authorization: Bearer <API_KEY>`
- Content type: `application/json`
- Free model identifier: `s2.1-pro-free`
- JSON fields used by Synapse:
  - `text`: required input text
  - `reference_id`: optional Fish Audio voice/model reference identifier
  - `format`: requested audio format, such as `mp3`

## Implementation constraints

- Keep the persisted Fish model value as an extensible string instead of a closed database enum.
- Read the active provider and model for each synthesis request so an administrator change takes effect without restart.
- Treat a missing Fish API key as a disabled capability and return `TTS_PROVIDER_NOT_CONFIGURED`; it must not prevent HTTP startup.
- Never return or log the API key or authorization header.
