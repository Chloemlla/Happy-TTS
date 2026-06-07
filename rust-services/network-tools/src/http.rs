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
    models::{PortScanData, PortScanRequest, SuccessEnvelope, TcpingData, TcpingRequest},
    probes, validation,
};

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
