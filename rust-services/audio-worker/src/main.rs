mod auth;
mod config;
mod error;
mod http;
mod models;
mod processing;

#[cfg(test)]
#[path = "tests/audio_contract_tests.rs"]
mod audio_contract_tests;

use std::net::SocketAddr;

use config::AudioWorkerConfig;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = match AudioWorkerConfig::from_env() {
        Ok(config) => config,
        Err(error) => {
            tracing::error!(error = %error, "failed to load audio-worker config");
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
            tracing::error!(bind_addr = %bind_addr, error = %error, "failed to bind audio-worker");
            std::process::exit(1);
        }
    };

    tracing::info!(bind_addr = %bind_addr, "audio-worker listening");

    if let Err(error) = axum::serve(listener, http::build_router(config)).await {
        tracing::error!(error = %error, "audio-worker server stopped");
    }
}
