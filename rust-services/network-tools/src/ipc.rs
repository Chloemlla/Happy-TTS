use std::sync::Arc;

use ipc_runtime::IpcRequest;
use serde_json::{json, Value};

use crate::{
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

pub async fn handle_request(config: Arc<NetworkToolsConfig>, request: IpcRequest) -> Value {
    if let Err(error) = require_internal_token(&request.token, &config) {
        return error_json(error);
    }

    if request.path == "/healthz" {
        return json!({
          "success": true,
          "data": {
            "status": "ok",
            "service": "network-tools",
            "source": "rust-network-tools"
          }
        });
    }

    if !request.method.eq_ignore_ascii_case("POST") {
        return error_json(AppError::BadRequest("IPC route requires POST".to_string()));
    }

    match request.path.as_str() {
        "/v1/network/tcping" => match parse_body::<TcpingRequest>(request.body) {
            Ok(payload) => endpoint_json(tcping(&config, payload).await),
            Err(error) => error_json(error),
        },
        "/v1/network/portscan" => match parse_body::<PortScanRequest>(request.body) {
            Ok(payload) => endpoint_json(portscan(&config, payload).await),
            Err(error) => error_json(error),
        },
        "/v1/network/ping" => match parse_body::<PingRequest>(request.body) {
            Ok(payload) => endpoint_json(ping(&config, payload).await),
            Err(error) => error_json(error),
        },
        "/v1/network/speed" => match parse_body::<SpeedRequest>(request.body) {
            Ok(payload) => endpoint_json(speed(&config, payload).await),
            Err(error) => error_json(error),
        },
        "/v1/network/dns" => match parse_body::<DnsRequest>(request.body) {
            Ok(payload) => endpoint_json(dns(&config, payload).await),
            Err(error) => error_json(error),
        },
        "/v1/network/http-timing" => match parse_body::<HttpTimingRequest>(request.body) {
            Ok(payload) => endpoint_json(http_timing(&config, payload).await),
            Err(error) => error_json(error),
        },
        "/v1/network/tls-timing" => match parse_body::<TlsTimingRequest>(request.body) {
            Ok(payload) => endpoint_json(tls_timing(&config, payload).await),
            Err(error) => error_json(error),
        },
        _ => error_json(AppError::BadRequest(format!(
            "unknown IPC route {}",
            request.path
        ))),
    }
}

async fn tcping(
    config: &NetworkToolsConfig,
    payload: TcpingRequest,
) -> Result<TcpingData, AppError> {
    let address = validation::normalize_address(&payload.address, config.block_private_targets)?;
    let port = validation::normalize_port(payload.port)?;
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, config)?;
    let resolved = validation::resolve_target(&address, port, config.block_private_targets).await?;
    let probe =
        probes::tcping::probe_socket_addrs(&resolved, validation::duration_from_ms(timeout_ms))
            .await;

    Ok(TcpingData {
        address,
        port,
        reachable: probe.reachable,
        latency_ms: probe.latency_ms,
        source: "rust-network-tools",
    })
}

async fn portscan(
    config: &NetworkToolsConfig,
    payload: PortScanRequest,
) -> Result<PortScanData, AppError> {
    let address = validation::normalize_address(&payload.address, config.block_private_targets)?;
    let ports = validation::normalize_ports(&payload.ports, config)?;
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, config)?;
    let concurrency = validation::normalize_concurrency(payload.concurrency, config)?;

    validation::resolve_target(&address, ports[0], config.block_private_targets).await?;

    let results = probes::portscan::scan_ports(
        address.clone(),
        ports.clone(),
        validation::duration_from_ms(timeout_ms),
        concurrency,
        config.block_private_targets,
    )
    .await?;
    let open_ports = results
        .iter()
        .filter(|result| result.open)
        .map(|result| result.port)
        .collect();

    Ok(PortScanData {
        address,
        scanned_ports: ports,
        open_ports,
        results,
        source: "rust-network-tools",
    })
}

async fn ping(config: &NetworkToolsConfig, payload: PingRequest) -> Result<PingData, AppError> {
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, config)?;
    let timeout = validation::duration_from_ms(timeout_ms);

    if let Some(port) = payload.port {
        let address = validation::normalize_address(&payload.target, config.block_private_targets)?;
        let port = validation::normalize_port(port)?;
        let resolved =
            validation::resolve_target(&address, port, config.block_private_targets).await?;
        let probe = probes::tcping::probe_socket_addrs(&resolved, timeout).await;

        return Ok(PingData {
            target: address,
            reachable: probe.reachable,
            method: "tcp".to_string(),
            port: Some(port),
            latency_ms: probe.latency_ms,
            error: None,
            source: "rust-network-tools",
        });
    }

    if !payload.target.trim().contains("://") {
        let address = validation::normalize_address(&payload.target, config.block_private_targets)?;

        for port in DEFAULT_PING_PORTS {
            let resolved =
                validation::resolve_target(&address, *port, config.block_private_targets).await?;
            let probe = probes::tcping::probe_socket_addrs(&resolved, timeout).await;

            if probe.reachable {
                return Ok(PingData {
                    target: address,
                    reachable: true,
                    method: "tcp-default".to_string(),
                    port: Some(*port),
                    latency_ms: probe.latency_ms,
                    error: None,
                    source: "rust-network-tools",
                });
            }
        }

        return Ok(PingData {
            target: address,
            reachable: false,
            method: "tcp-default".to_string(),
            port: None,
            latency_ms: None,
            error: Some("target did not accept TCP connections on default ping ports".to_string()),
            source: "rust-network-tools",
        });
    }

    let target = validation::normalize_http_url(
        &payload.target,
        Some("http"),
        config.block_private_targets,
    )?;
    let probe =
        probes::http_timing::probe_url(&target, "HEAD", timeout, 1, config.block_private_targets)
            .await?;

    Ok(PingData {
        target: target.url,
        reachable: probe.status_code.is_some(),
        method: "http-head".to_string(),
        port: Some(target.port),
        latency_ms: probe.ttfb_ms.or(Some(probe.total_ms)),
        error: None,
        source: "rust-network-tools",
    })
}

async fn speed(config: &NetworkToolsConfig, payload: SpeedRequest) -> Result<SpeedData, AppError> {
    let target =
        validation::normalize_http_url(&payload.url, Some("https"), config.block_private_targets)?;
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, config)?;
    let max_bytes = validation::normalize_max_response_bytes(payload.max_bytes, config)?;
    let probe = probes::http_timing::probe_url(
        &target,
        "GET",
        validation::duration_from_ms(timeout_ms),
        max_bytes,
        config.block_private_targets,
    )
    .await?;
    let throughput_bytes_per_sec = if probe.total_ms > 0 {
        Some((probe.bytes_read as f64) / (probe.total_ms as f64 / 1000.0))
    } else {
        None
    };

    Ok(SpeedData {
        url: target.url,
        status_code: probe.status_code,
        bytes_read: probe.bytes_read,
        total_ms: probe.total_ms,
        ttfb_ms: probe.ttfb_ms,
        throughput_bytes_per_sec,
        truncated: probe.truncated,
        source: "rust-network-tools",
    })
}

async fn dns(config: &NetworkToolsConfig, payload: DnsRequest) -> Result<DnsData, AppError> {
    let address = validation::normalize_address(&payload.address, config.block_private_targets)?;
    let record_types = validation::normalize_dns_record_types(payload.record_types.as_deref())?;
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, config)?;
    let records = probes::dns::resolve_records(
        &address,
        &record_types,
        validation::duration_from_ms(timeout_ms),
    )
    .await?;

    Ok(DnsData {
        address,
        records,
        source: "rust-network-tools",
    })
}

async fn http_timing(
    config: &NetworkToolsConfig,
    payload: HttpTimingRequest,
) -> Result<HttpTimingData, AppError> {
    let target =
        validation::normalize_http_url(&payload.url, Some("https"), config.block_private_targets)?;
    let method = validation::normalize_http_method(payload.method.as_deref())?;
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, config)?;
    let max_bytes = validation::normalize_max_response_bytes(payload.max_bytes, config)?;
    let probe = probes::http_timing::probe_url(
        &target,
        &method,
        validation::duration_from_ms(timeout_ms),
        max_bytes,
        config.block_private_targets,
    )
    .await?;

    Ok(HttpTimingData {
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
    })
}

async fn tls_timing(
    config: &NetworkToolsConfig,
    payload: TlsTimingRequest,
) -> Result<TlsTimingData, AppError> {
    let address = validation::normalize_address(&payload.address, config.block_private_targets)?;
    let port = validation::normalize_port(payload.port.unwrap_or(443))?;
    let server_name = match payload.server_name {
        Some(server_name) => validation::normalize_address(&server_name, false)?,
        None => address.clone(),
    };
    let timeout_ms = validation::normalize_timeout_ms(payload.timeout_ms, config)?;
    probes::tls_timing::probe_tls(
        &address,
        port,
        &server_name,
        validation::duration_from_ms(timeout_ms),
        config.block_private_targets,
    )
    .await
}

fn require_internal_token(token: &str, config: &NetworkToolsConfig) -> Result<(), AppError> {
    if token.trim().is_empty() {
        return Err(AppError::Unauthorized);
    }
    if token != config.internal_token {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

fn parse_body<T>(body: Value) -> Result<T, AppError>
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_value(body)
        .map_err(|error| AppError::BadRequest(format!("invalid IPC body: {error}")))
}

fn endpoint_json<T>(result: Result<T, AppError>) -> Value
where
    T: serde::Serialize,
{
    match result {
        Ok(data) => serde_json::to_value(SuccessEnvelope::ok(data)).unwrap_or_else(|error| {
            json!({
                "success": false,
                "error": format!("failed to serialize IPC response: {error}")
            })
        }),
        Err(error) => error_json(error),
    }
}

fn error_json(error: AppError) -> Value {
    json!({
        "success": false,
        "error": error.to_string()
    })
}
