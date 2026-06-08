mod auth;
mod config;
mod error;
mod http;
mod ipc;
mod models;
mod processing;

#[cfg(test)]
#[path = "tests/security_contract_tests.rs"]
mod security_contract_tests;

use std::{env, net::SocketAddr, path::PathBuf, sync::Arc};

use config::SecurityWorkerConfig;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = match SecurityWorkerConfig::from_env() {
        Ok(config) => config,
        Err(error) => {
            tracing::error!(error = %error, "failed to load security-worker config");
            std::process::exit(1);
        }
    };

    if let Some(ipc_path) = ipc_path_from_env() {
        let size_bytes = ipc_channel_bytes_from_env();
        let config = Arc::new(config);
        if let Err(error) = ipc_runtime::serve(
            ipc_runtime::IpcServerOptions {
                service_name: "security-worker",
                path: ipc_path,
                size_bytes,
            },
            move |request| {
                let config = Arc::clone(&config);
                async move { ipc::handle_request(config, request).await }
            },
        )
        .await
        {
            tracing::error!(error = %error, "security-worker IPC server stopped");
            std::process::exit(1);
        }
        return;
    }

    let bind_addr: SocketAddr = match config.bind_addr.parse() {
        Ok(addr) => addr,
        Err(error) => {
            tracing::error!(bind_addr = %config.bind_addr, error = %error, "invalid bind address");
            std::process::exit(1);
        }
    };

    let listener = match tokio::net::TcpListener::bind(bind_addr).await {
        Ok(listener) => listener,
        Err(error) => {
            tracing::error!(bind_addr = %bind_addr, error = %error, "failed to bind security-worker");
            std::process::exit(1);
        }
    };

    tracing::info!(bind_addr = %bind_addr, "security-worker listening");

    if let Err(error) = axum::serve(listener, http::build_router(config)).await {
        tracing::error!(error = %error, "security-worker server stopped");
    }
}

fn ipc_path_from_env() -> Option<PathBuf> {
    env::var("RUST_IPC_PATH")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn ipc_channel_bytes_from_env() -> usize {
    env::var("RUST_IPC_CHANNEL_BYTES")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value >= 1024 * 1024)
        .unwrap_or(256 * 1024 * 1024)
}
