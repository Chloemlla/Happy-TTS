use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("missing internal token")]
    Unauthorized,
    #[error("invalid internal token")]
    Forbidden,
    #[error("{0}")]
    BadRequest(String),
    #[error("network probe failed")]
    ProbeFailed,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                "missing internal token".to_string(),
            ),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "invalid internal token".to_string()),
            AppError::BadRequest(message) => (StatusCode::BAD_REQUEST, message),
            AppError::ProbeFailed => (StatusCode::BAD_GATEWAY, "network probe failed".to_string()),
        };

        (status, Json(json!({ "success": false, "error": message }))).into_response()
    }
}
