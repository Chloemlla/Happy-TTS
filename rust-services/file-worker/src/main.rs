mod auth;
mod config;
mod detection;
mod error;
mod http;
mod models;

#[cfg(test)]
#[path = "tests/file_contract_tests.rs"]
mod file_contract_tests;

use std::net::SocketAddr;

use config::FileWorkerConfig;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = match FileWorkerConfig::from_env() {
        Ok(config) => config,
        Err(error) => {
            tracing::error!(error = %error, "failed to load file-worker config");
            std::process::exit(1);
        }
    };

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
            tracing::error!(bind_addr = %bind_addr, error = %error, "failed to bind file-worker");
            std::process::exit(1);
        }
    };

    tracing::info!(bind_addr = %bind_addr, "file-worker listening");

    if let Err(error) = axum::serve(listener, http::build_router(config)).await {
        tracing::error!(error = %error, "file-worker server stopped");
    }
}
