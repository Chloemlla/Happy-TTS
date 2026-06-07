# Rust/Node Hybrid Deployment

This document covers the first deployment phase: the optional `network-tools` Rust sidecar. Node/Express remains the only public API entry point.

## Defaults

Rust network tools are disabled by default:

```text
RUST_NETWORK_TOOLS_ENABLED=false
RUST_NETWORK_TOOLS_URL=http://127.0.0.1:4010
RUST_NETWORK_TOOLS_TIMEOUT_MS=5000
RUST_NETWORK_TOOLS_FALLBACK_ENABLED=true
RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS=true
INTERNAL_SERVICE_TOKEN=
```

When disabled, `/api/network/tcping` and `/api/network/portscan` keep using the existing Node path and external API fallback behavior.

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

The Compose sidecar is behind the `rust-network-tools` profile and does not publish a host port.

```bash
INTERNAL_SERVICE_TOKEN=replace-me \
RUST_NETWORK_TOOLS_ENABLED=true \
docker compose --profile rust-network-tools up -d --build
```

The app container calls the sidecar through:

```text
RUST_NETWORK_TOOLS_URL=http://network-tools:4010
```

`network-tools` validates `X-Internal-Token` on `/healthz`, `/v1/network/tcping`, and `/v1/network/portscan`.

## Safety Limits

The Rust sidecar enforces:

- `timeoutMs` maximum: `10000` ms by default.
- `portscan` maximum port count: `128` by default.
- `portscan` maximum concurrency: `64` by default.
- Empty, URL-like, malformed, private, loopback, link-local, multicast, documentation, and reserved targets are rejected when `RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS=true`.

For controlled private-network diagnostics, set `RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS=false` on both Node and the sidecar.

## Fallback And Rollback

If Rust fails with an operational error and fallback is enabled, Node logs `node-fallback` and calls the existing external API path.

Fast rollback:

```text
RUST_NETWORK_TOOLS_ENABLED=false
```

This does not require removing the sidecar container. Configuration or validation failures such as missing token, invalid token, or blocked private targets do not fall back to the external API.

