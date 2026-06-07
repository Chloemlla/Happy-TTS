use std::sync::Arc;

use axum::{
    extract::State,
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;

use crate::{
    auth,
    config::NetworkToolsConfig,
    error::AppError,
    models::{
        DnsData, DnsRequest, HttpTimingData, HttpTimingRequest, PingData, PingRequest,
        PortScanData, PortScanRequest, SpeedData, SpeedRequest, SuccessEnvelope, TcpingData,
        TcpingRequest, TlsTimingData, TlsTimingRequest,
    },
    probes, validation,
};

const DEFAULT_PING_PORTS: &[u16] = &[443, 80, 22, 8080, 8443];

#[derive(Clone)]
struct AppState {
    config: Arc<NetworkToolsConfig>,
}

pub fn build_router(config: NetworkToolsConfig) -> Router {
    let state = AppState {
        config: Arc::new(config),
    };

    Router::new()
        .route("/healthz", get(healthz))
        .route("/v1/network/tcping", post(tcping))
        .route("/v1/network/portscan", post(portscan))
        .route("/v1/network/ping", post(ping))
        .route("/v1/network/speed", post(speed))
        .route("/v1/network/dns", post(dns))
        .route("/v1/network/http-timing", post(http_timing))
        .route("/v1/network/tls-timing", post(tls_timing))
        .with_state(state)
}

async fn healthz(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    Ok(Json(json!({
      "success": true,
      "data": {
        "status": "ok",
        "service": "network-tools",
        "source": "rust-network-tools"
      }
    })))
}

async fn tcping(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TcpingRequest>,
) -> Result<Json<SuccessEnvelope<TcpingData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let address =
        validation::normalize_address(&payload.address, state.config.block_private_targets)?;
    let port = validation::normalize_port(payload.port)?;
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, &state.config)?;
    let resolved =
        validation::resolve_target(&address, port, state.config.block_private_targets).await?;
    let probe =
        probes::tcping::probe_socket_addrs(&resolved, validation::duration_from_ms(timeout_ms))
            .await;

    Ok(Json(SuccessEnvelope::ok(TcpingData {
        address,
        port,
        reachable: probe.reachable,
        latency_ms: probe.latency_ms,
        source: "rust-network-tools",
    })))
}

async fn portscan(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PortScanRequest>,
) -> Result<Json<SuccessEnvelope<PortScanData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let address =
        validation::normalize_address(&payload.address, state.config.block_private_targets)?;
    let ports = validation::normalize_ports(&payload.ports, &state.config)?;
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, &state.config)?;
    let concurrency = validation::normalize_concurrency(payload.concurrency, &state.config)?;

    validation::resolve_target(&address, ports[0], state.config.block_private_targets).await?;

    let results = probes::portscan::scan_ports(
        address.clone(),
        ports.clone(),
        validation::duration_from_ms(timeout_ms),
        concurrency,
        state.config.block_private_targets,
    )
    .await?;
    let open_ports = results
        .iter()
        .filter(|result| result.open)
        .map(|result| result.port)
        .collect();

    Ok(Json(SuccessEnvelope::ok(PortScanData {
        address,
        scanned_ports: ports,
        open_ports,
        results,
        source: "rust-network-tools",
    })))
}

async fn ping(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PingRequest>,
) -> Result<Json<SuccessEnvelope<PingData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, &state.config)?;
    let timeout = validation::duration_from_ms(timeout_ms);

    if let Some(port) = payload.port {
        let address =
            validation::normalize_address(&payload.target, state.config.block_private_targets)?;
        let port = validation::normalize_port(port)?;
        let resolved =
            validation::resolve_target(&address, port, state.config.block_private_targets).await?;
        let probe = probes::tcping::probe_socket_addrs(&resolved, timeout).await;

        return Ok(Json(SuccessEnvelope::ok(PingData {
            target: address,
            reachable: probe.reachable,
            method: "tcp".to_string(),
            port: Some(port),
            latency_ms: probe.latency_ms,
            error: None,
            source: "rust-network-tools",
        })));
    }

    if !payload.target.trim().contains("://") {
        let address =
            validation::normalize_address(&payload.target, state.config.block_private_targets)?;

        for port in DEFAULT_PING_PORTS {
            let resolved =
                validation::resolve_target(&address, *port, state.config.block_private_targets)
                    .await?;
            let probe = probes::tcping::probe_socket_addrs(&resolved, timeout).await;

            if probe.reachable {
                return Ok(Json(SuccessEnvelope::ok(PingData {
                    target: address,
                    reachable: true,
                    method: "tcp-default".to_string(),
                    port: Some(*port),
                    latency_ms: probe.latency_ms,
                    error: None,
                    source: "rust-network-tools",
                })));
            }
        }

        return Ok(Json(SuccessEnvelope::ok(PingData {
            target: address,
            reachable: false,
            method: "tcp-default".to_string(),
            port: None,
            latency_ms: None,
            error: Some("target did not accept TCP connections on default ping ports".to_string()),
            source: "rust-network-tools",
        })));
    }

    let target = validation::normalize_http_url(
        &payload.target,
        Some("http"),
        state.config.block_private_targets,
    )?;
    let probe = probes::http_timing::probe_url(
        &target,
        "HEAD",
        timeout,
        1,
        state.config.block_private_targets,
    )
    .await?;

    Ok(Json(SuccessEnvelope::ok(PingData {
        target: target.url,
        reachable: probe.status_code.is_some(),
        method: "http-head".to_string(),
        port: Some(target.port),
        latency_ms: probe.ttfb_ms.or(Some(probe.total_ms)),
        error: None,
        source: "rust-network-tools",
    })))
}

async fn speed(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SpeedRequest>,
) -> Result<Json<SuccessEnvelope<SpeedData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let target = validation::normalize_http_url(
        &payload.url,
        Some("https"),
        state.config.block_private_targets,
    )?;
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, &state.config)?;
    let max_bytes = validation::normalize_max_response_bytes(payload.max_bytes, &state.config)?;
    let probe = probes::http_timing::probe_url(
        &target,
        "GET",
        validation::duration_from_ms(timeout_ms),
        max_bytes,
        state.config.block_private_targets,
    )
    .await?;
    let throughput_bytes_per_sec = if probe.total_ms > 0 {
        Some((probe.bytes_read as f64) / (probe.total_ms as f64 / 1000.0))
    } else {
        None
    };

    Ok(Json(SuccessEnvelope::ok(SpeedData {
        url: target.url,
        status_code: probe.status_code,
        bytes_read: probe.bytes_read,
        total_ms: probe.total_ms,
        ttfb_ms: probe.ttfb_ms,
        throughput_bytes_per_sec,
        truncated: probe.truncated,
        source: "rust-network-tools",
    })))
}

async fn dns(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<DnsRequest>,
) -> Result<Json<SuccessEnvelope<DnsData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let address =
        validation::normalize_address(&payload.address, state.config.block_private_targets)?;
    let record_types = validation::normalize_dns_record_types(payload.record_types.as_deref())?;
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, &state.config)?;
    let records = probes::dns::resolve_records(
        &address,
        &record_types,
        validation::duration_from_ms(timeout_ms),
    )
    .await?;

    Ok(Json(SuccessEnvelope::ok(DnsData {
        address,
        records,
        source: "rust-network-tools",
    })))
}

async fn http_timing(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<HttpTimingRequest>,
) -> Result<Json<SuccessEnvelope<HttpTimingData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let target = validation::normalize_http_url(
        &payload.url,
        Some("https"),
        state.config.block_private_targets,
    )?;
    let method = validation::normalize_http_method(payload.method.as_deref())?;
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, &state.config)?;
    let max_bytes = validation::normalize_max_response_bytes(payload.max_bytes, &state.config)?;
    let probe = probes::http_timing::probe_url(
        &target,
        &method,
        validation::duration_from_ms(timeout_ms),
        max_bytes,
        state.config.block_private_targets,
    )
    .await?;

    Ok(Json(SuccessEnvelope::ok(HttpTimingData {
        url: target.url,
        status_code: probe.status_code,
        dns_ms: probe.dns_ms,
        connect_ms: probe.connect_ms,
        tls_ms: probe.tls_ms,
        ttfb_ms: probe.ttfb_ms,
        total_ms: probe.total_ms,
        bytes_read: probe.bytes_read,
        truncated: probe.truncated,
        source: "rust-network-tools",
    })))
}

async fn tls_timing(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TlsTimingRequest>,
) -> Result<Json<SuccessEnvelope<TlsTimingData>>, AppError> {
    auth::require_internal_token(&headers, &state.config)?;

    let address =
        validation::normalize_address(&payload.address, state.config.block_private_targets)?;
    let port = validation::normalize_port(payload.port.unwrap_or(443))?;
    let server_name = match payload.server_name {
        Some(server_name) => validation::normalize_address(&server_name, false)?,
        None => address.clone(),
    };
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, &state.config)?;
    let result = probes::tls_timing::probe_tls(
        &address,
        port,
        &server_name,
        validation::duration_from_ms(timeout_ms),
        state.config.block_private_targets,
    )
    .await?;

    Ok(Json(SuccessEnvelope::ok(result)))
}
