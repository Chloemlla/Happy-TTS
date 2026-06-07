# Rust/Node Hybrid Deployment

This document covers the optional Rust sidecars used by the hybrid backend. Node/Express remains the only public API entry point.

## Defaults

Rust services default by environment:

- `NODE_ENV=production`: `network-tools` and `audio-worker` are enabled when their `*_ENABLED` variables are unset.
- `NODE_ENV=development` or `NODE_ENV=test`: both services stay disabled when their `*_ENABLED` variables are unset.
- Explicit `RUST_NETWORK_TOOLS_ENABLED=false` or `RUST_AUDIO_WORKER_ENABLED=false` always disables the corresponding path.

Production requires a shared internal token whenever either Rust service is enabled:

```text
INTERNAL_SERVICE_TOKEN=<long-random-secret>
RUST_NETWORK_TOOLS_ENABLED=true
RUST_NETWORK_TOOLS_URL=http://127.0.0.1:4010
RUST_NETWORK_TOOLS_TIMEOUT_MS=5000
RUST_NETWORK_TOOLS_FALLBACK_ENABLED=true
RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS=true
RUST_AUDIO_WORKER_ENABLED=true
RUST_AUDIO_WORKER_URL=http://127.0.0.1:4020
RUST_AUDIO_WORKER_TIMEOUT_MS=30000
RUST_AUDIO_WORKER_MAX_BYTES=20971520
RUST_AUDIO_WORKER_FALLBACK_ENABLED=true
```

Generate the token yourself and keep the same value in the Node app and every Rust sidecar. Do not commit it to the repository.

PowerShell:

```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

When disabled explicitly, `/api/network/tcping` and `/api/network/portscan` keep using the existing Node path and external API fallback behavior.
When audio worker processing is disabled explicitly, TTS writes the provider buffer exactly as before.

## Local Sidecar

Run the Rust sidecar with an internal token:

```bash
INTERNAL_SERVICE_TOKEN=replace-me RUST_BIND_ADDR=127.0.0.1:4010 cargo run --manifest-path rust-services/network-tools/Cargo.toml
```

Then start Node with:

```bash
RUST_NETWORK_TOOLS_ENABLED=true
RUST_NETWORK_TOOLS_URL=http://127.0.0.1:4010
INTERNAL_SERVICE_TOKEN=replace-me
```

Health checks require the same token:

```bash
curl -H "X-Internal-Token: replace-me" http://127.0.0.1:4010/healthz
```

## Docker Compose

Docker Compose is production-oriented and starts both Rust sidecars by default. Neither sidecar publishes a host port.

```bash
INTERNAL_SERVICE_TOKEN=replace-me \
docker compose up -d --build
```

The app container calls the sidecar through:

```text
RUST_NETWORK_TOOLS_URL=http://network-tools:4010
```

`network-tools` validates `X-Internal-Token` on `/healthz`, `/v1/network/tcping`, and `/v1/network/portscan`.

To disable a Rust path while leaving the sidecar container available:

```bash
INTERNAL_SERVICE_TOKEN=replace-me \
RUST_NETWORK_TOOLS_ENABLED=false \
RUST_AUDIO_WORKER_ENABLED=false \
docker compose up -d --build
```

The app container calls it through:

```text
RUST_AUDIO_WORKER_URL=http://audio-worker:4020
```

`audio-worker` validates `X-Internal-Token` on `/healthz` and `/v1/audio/process`. It accepts only audio bytes already held by Node as `audioBase64`; it does not fetch URLs, choose filenames, write storage, update history, or send WebSocket events.

## Safety Limits

The Rust sidecar enforces:

- `timeoutMs` maximum: `10000` ms by default.
- `portscan` maximum port count: `128` by default.
- `portscan` maximum concurrency: `64` by default.
- Empty, URL-like, malformed, private, loopback, link-local, multicast, documentation, and reserved targets are rejected when `RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS=true`.
- `audio-worker` maximum input size: `20971520` bytes by default.
- `audio-worker` first version supports `passthrough` and `analyze`; it returns processed bytes as `audioBase64` and leaves the file naming and persistence decisions to Node.

For controlled private-network diagnostics, set `RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS=false` on both Node and the sidecar.

## Fallback And Rollback

If Rust fails with an operational error and fallback is enabled, Node logs `node-fallback` and calls the existing external API path.

Fast rollback:

```text
RUST_NETWORK_TOOLS_ENABLED=false
RUST_AUDIO_WORKER_ENABLED=false
```

This does not require removing the sidecar container. Configuration or validation failures such as missing token, invalid token, or blocked private targets do not fall back to the external API.
For TTS audio processing, Rust failures fall back to the original provider buffer when `RUST_AUDIO_WORKER_FALLBACK_ENABLED=true`.
