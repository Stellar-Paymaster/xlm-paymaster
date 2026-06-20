use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

#[derive(Debug)]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
    pub status: StatusCode,
}

#[derive(Serialize)]
struct ErrorBody {
    code: &'static str,
    error: String,
}

impl AppError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            status,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorBody {
                code: self.code,
                error: self.message,
            }),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_error_new_sets_fields() {
        let err = AppError::new(StatusCode::BAD_REQUEST, "BAD", "nope");
        assert_eq!(err.code, "BAD");
        assert_eq!(err.message, "nope");
        assert_eq!(err.status, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn into_response_preserves_status_code() {
        let res = AppError::new(StatusCode::FORBIDDEN, "AUTH_FAILED", "denied").into_response();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }
}
