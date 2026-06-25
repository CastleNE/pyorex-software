/// Bridge between Tauri and the Python Analytics Service (JSON-RPC 2.0)
use serde::{Deserialize, Serialize};
use tauri::command;

const ANALYTICS_BASE_URL: &str = "http://127.0.0.1:5174";

#[derive(Debug, thiserror::Error)]
pub enum AnalyticsBridgeError {
    #[error("Analytics service unreachable: {0}")]
    ServiceUnreachable(String),
    #[error("Request error: {0}")]
    RequestError(#[from] reqwest::Error),
    #[error("JSON-RPC error [{code}]: {message}")]
    RpcError { code: i32, message: String },
}

impl Serialize for AnalyticsBridgeError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RpcRequest {
    jsonrpc: String,
    method: String,
    params: serde_json::Value,
    id: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RpcResponse {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
    id: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RpcError {
    code: i32,
    message: String,
}

/// Check if the Python analytics service is running.
/// Called on app startup and when UI needs to verify connectivity.
#[command]
pub async fn check_analytics_service() -> Result<bool, AnalyticsBridgeError> {
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{ANALYTICS_BASE_URL}/health"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .map_err(|e| AnalyticsBridgeError::ServiceUnreachable(e.to_string()))?;

    Ok(response.status().is_success())
}

const ALLOWED_RPC_METHODS: &[&str] = &[
    "health.ping",
    "data.preview", "data.import", "data.list", "data.rows", "data.delete", "data.export_kml",
    "analytics.pca", "analytics.descriptive", "analytics.clustering",
    "qaqc.report",
];

/// Send a JSON-RPC 2.0 request to the Python analytics service.
/// method: e.g. "analytics.pca", "preprocessing.quality_report"
/// params: JSON object with the request parameters
#[command]
pub async fn call_analytics(
    method: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, AnalyticsBridgeError> {
    if !ALLOWED_RPC_METHODS.contains(&method.as_str()) {
        return Err(AnalyticsBridgeError::RpcError {
            code: -32601,
            message: format!("Method not allowed: {method}"),
        });
    }
    let request_id = uuid_v4();
    let rpc_request = RpcRequest {
        jsonrpc: "2.0".to_string(),
        method: method.clone(),
        params,
        id: request_id,
    };

    let client = reqwest::Client::new();
    let response: RpcResponse = client
        .post(format!("{ANALYTICS_BASE_URL}/rpc"))
        .json(&rpc_request)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await?
        .json()
        .await?;

    if let Some(error) = response.error {
        return Err(AnalyticsBridgeError::RpcError {
            code: error.code,
            message: error.message,
        });
    }

    tracing::debug!("RPC {method} completed successfully");
    Ok(response.result.unwrap_or(serde_json::Value::Null))
}

/// Open a folder in Windows Explorer.
/// Uses explorer.exe directly — more reliable than plugin-shell open() for local paths.
#[command]
pub async fn open_in_explorer(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn uuid_v4() -> String {
    uuid::Uuid::new_v4().to_string()
}
