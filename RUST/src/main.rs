mod parser;

use axum::{
    extract::State,
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::{get, post},
    Json, Router,
};
use parser::{parse_notas_text, ParseRequest};
use serde::Serialize;
use std::net::SocketAddr;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
struct AppState {
    version: &'static str,
}

#[derive(Serialize)]
struct HealthResponse {
    ok: bool,
    service: &'static str,
    version: &'static str,
    port: u16,
}

#[derive(Serialize)]
struct ErrorResponse {
    ok: bool,
    error: &'static str,
    message: String,
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    Json(HealthResponse {
        ok: true,
        service: "api-danfe-rust",
        version: state.version,
        port: 3030,
    })
}

async fn home() -> Html<&'static str> {
    Html(
        r#"<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>API DANFE Rust</title>
    <style>body{font-family:Arial,sans-serif;margin:40px;color:#14213d}code{background:#eef2f6;padding:3px 6px;border-radius:4px}</style>
  </head>
  <body>
    <h1>API DANFE Rust online</h1>
    <p>O servico Rust esta funcionando na porta <code>3030</code>.</p>
    <p>Health check: <a href="/api/health">/api/health</a></p>
  </body>
</html>"#,
    )
}

async fn parse_text(Json(request): Json<ParseRequest>) -> impl IntoResponse {
    if request.text.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                ok: false,
                error: "texto_vazio",
                message: "Envie o texto das notas para leitura.".to_string(),
            }),
        )
            .into_response();
    }

    Json(parse_notas_text(&request.text)).into_response()
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let state = AppState { version: "0.1.0" };
    let app = Router::new()
        .route("/", get(home))
        .route("/api/health", get(health))
        .route("/api/microservico/parse-texto", post(parse_text))
        .route("/api/parse-texto", post(parse_text))
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let address = SocketAddr::from(([127, 0, 0, 1], 3030));
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("API DANFE Rust em http://{address}");
    axum::serve(listener, app).await?;

    Ok(())
}
