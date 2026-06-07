# Rust/Node Hybrid Deployment

This document covers the optional Rust sidecars used by the hybrid backend. Node/Express remains the only public API entry point.

## Defaults

Rust services default by environment:

- `NODE_ENV=production`: `network-tools`, `audio-worker`, and `file-worker` are enabled when their `*_ENABLED` variables are unset.
- `NODE_ENV=development` or `NODE_ENV=test`: Rust services stay disabled when their `*_ENABLED` variables are unset.
- Explicit `RUST_NETWORK_TOOLS_ENABLED=false`, `RUST_AUDIO_WORKER_ENABLED=false`, or `RUST_FILE_WORKER_ENABLED=false` always disables the corresponding path.
- Docker production images include both Rust binaries. With `RUST_EMBEDDED_SERVICES_ENABLED=true`, the Node main process is the Rust supervisor: it starts the Rust child processes, waits for health checks, restarts them after unexpected exits, and terminates them when Node exits.

External Rust sidecars require a shared internal token whenever either Rust service is enabled:

```text
INTERNAL_SERVICE_TOKEN=<long-random-secret>
RUST_NETWORK_TOOLS_ENABLED=true
RUST_NETWORK_TOOLS_URL=http://127.0.0.1:4010
RUST_NETWORK_TOOLS_TIMEOUT_MS=5000
RUST_NETWORK_TOOLS_MAX_RESPONSE_BYTES=1048576
RUST_NETWORK_TOOLS_FALLBACK_ENABLED=true
RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS=true
RUST_AUDIO_WORKER_ENABLED=true
RUST_AUDIO_WORKER_URL=http://127.0.0.1:4020
RUST_AUDIO_WORKER_TIMEOUT_MS=30000
RUST_AUDIO_WORKER_MAX_BYTES=20971520
RUST_AUDIO_WORKER_OPERATIONS=passthrough,analyze
RUST_AUDIO_WORKER_FALLBACK_ENABLED=true
RUST_FILE_WORKER_ENABLED=true
RUST_FILE_WORKER_URL=http://127.0.0.1:4030
RUST_FILE_WORKER_TIMEOUT_MS=30000
RUST_FILE_WORKER_MAX_BYTES=52428800
RUST_FILE_WORKER_FALLBACK_ENABLED=true
```

Generate the token yourself and keep the same value in the Node app and every Rust sidecar. Do not commit it to the repository.
The value can change between coordinated full-stack restarts, but it must not be generated independently by each process. During one deployment, every Node instance and Rust sidecar must share the same token; otherwise internal calls fail with 401/403.
When embedded Rust is enabled and `INTERNAL_SERVICE_TOKEN` is unset, Node generates a per-start token and passes it to the child processes. That is suitable for a single app container, but not for external sidecars or multi-container Rust services.

PowerShell:

```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

When disabled explicitly, `/api/network/tcping`, `/api/network/portscan`, `/api/network/ping`, and `/api/network/speed` keep using the existing Node path and external API fallback behavior.
When audio worker processing is disabled explicitly, TTS writes the provider buffer exactly as before.
The file worker is an internal-only bytes inspection service. Node still owns upload authorization, quota checks, file accept/reject decisions, storage, and audit logging.

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

Docker Compose is production-oriented and starts Rust inside the app container by default. The Rust HTTP ports stay bound to localhost inside that container and are not published to the host. The `network-tools` and `audio-worker` services are only for the optional external-sidecar profile.

```bash
INTERNAL_SERVICE_TOKEN=replace-me \
docker compose up -d --build
```

The app container calls the sidecar through:

```text
RUST_NETWORK_TOOLS_URL=http://127.0.0.1:4010
RUST_AUDIO_WORKER_URL=http://127.0.0.1:4020
```

`network-tools` validates `X-Internal-Token` on `/healthz`, `/v1/network/tcping`, `/v1/network/portscan`, `/v1/network/ping`, `/v1/network/speed`, `/v1/network/dns`, `/v1/network/http-timing`, and `/v1/network/tls-timing`.

To disable a Rust path while leaving the binaries available:

```bash
INTERNAL_SERVICE_TOKEN=replace-me \
RUST_NETWORK_TOOLS_ENABLED=false \
RUST_AUDIO_WORKER_ENABLED=false \
docker compose up -d --build
```

To run Rust as separate sidecars instead, disable embedded services, point Node at the service names, and enable the sidecar profile:

```bash
INTERNAL_SERVICE_TOKEN=replace-me \
RUST_EMBEDDED_SERVICES_ENABLED=false \
RUST_NETWORK_TOOLS_URL=http://network-tools:4010 \
RUST_AUDIO_WORKER_URL=http://audio-worker:4020 \
RUST_FILE_WORKER_URL=http://file-worker:4030 \
docker compose --profile rust-sidecars up -d --build
```

`audio-worker` validates `X-Internal-Token` on `/healthz` and `/v1/audio/process`. It accepts only audio bytes already held by Node as `audioBase64`; it does not fetch URLs, choose filenames, write storage, update history, or send WebSocket events.
`file-worker` validates `X-Internal-Token` on `/healthz`, `/v1/file/inspect`, `/v1/file/hash`, `/v1/file/image/inspect`, `/v1/file/image/process`, and `/v1/file/archive/inspect`. It accepts only bytes already held by Node as `fileBase64`.

## Safety Limits

The Rust sidecar enforces:

- `timeoutMs` maximum: `10000` ms by default.
- `portscan` maximum port count: `128` by default.
- `portscan` maximum concurrency: `64` by default.
- HTTP timing and speed response read limit: `1048576` bytes by default.
- Empty, URL-like, malformed, private, loopback, link-local, multicast, documentation, and reserved targets are rejected when `RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS=true`.
- `audio-worker` maximum input size: `20971520` bytes by default.
- `audio-worker` default operations are `passthrough` and `analyze`. It also accepts operation-gated magic validation and MP3 ID3 metadata cleanup; encoder/DSP-backed operations return metadata warnings instead of silently transforming bytes.
- `file-worker` maximum input size: `52428800` bytes by default.
- `file-worker` detects magic MIME, SHA hashes, common image dimensions, JPEG EXIF cleanup, and ZIP archive risk from bytes. Image compression/WebP conversion return warnings unless an encoder backend is added later.

For controlled private-network diagnostics, set `RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS=false` on both Node and the sidecar.

## Fallback And Rollback

If Rust fails with an operational error and fallback is enabled, Node logs `node-fallback` and calls the existing external API path.

Fast rollback:

```text
RUST_NETWORK_TOOLS_ENABLED=false
RUST_AUDIO_WORKER_ENABLED=false
RUST_FILE_WORKER_ENABLED=false
```

This does not require removing the sidecar container. Configuration or validation failures such as missing token, invalid token, or blocked private targets do not fall back to the external API.
For TTS audio processing, Rust failures fall back to the original provider buffer when `RUST_AUDIO_WORKER_FALLBACK_ENABLED=true`.
