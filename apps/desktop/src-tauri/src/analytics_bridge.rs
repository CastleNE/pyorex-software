/// Bridge between Tauri and the Python Analytics Service (JSON-RPC 2.0)
use serde::{Deserialize, Serialize};
use tauri::command;

use crate::engine::EngineState;

/// One HTTP client for every call (keeps the local connection alive).
fn client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

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
pub async fn check_analytics_service(state: tauri::State<'_, EngineState>) -> Result<bool, AnalyticsBridgeError> {
    let base = state.base_url();
    let response = client()
        .get(format!("{base}/health"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .map_err(|e| AnalyticsBridgeError::ServiceUnreachable(e.to_string()))?;

    Ok(response.status().is_success())
}

// Debe reflejar exactamente las claves de METHOD_REGISTRY en
// services/analytics/app/routers/rpc.py + spectrometry_rpc.py — actualizar
// esta lista cada vez que se agregue un método RPC nuevo del lado Python,
// o el bridge lo rechaza con -32601 aunque el backend lo implemente.
const ALLOWED_RPC_METHODS: &[&str] = &[
    "geochemistry.catalog", "geochemistry.registry", "geochemistry.column_roles", "geochemistry.compute", "geochemistry.explore",
    "geochemistry.set_column_role", "geochemistry.diagram_preview", "maps.sample_map", "maps.section",
    // project.* (.orex project files)
    "project.save", "project.open", "project.inspect",
    // Andean Exploration Hub v0.1
    "hub.catalog", "hub.markets", "hub.archive.list", "hub.archive.save", "hub.archive.remove",
    "health.ping", "app.plan",
    // data.*
    "data.preview", "data.import", "data.list", "data.rows", "data.profile", "data.delete", "data.export_kml",
    "data.quality_report", "data.preview_formula", "data.apply_operation",
    "data.undo_operation", "data.redo_operation", "data.get_operations", "data.save_changes",
    "data.set_spatial_config",
    // analytics.*
    "analytics.descriptive", "analytics.pca",
    // qaqc.*
    "qaqc.calculate", "qaqc.control_chart", "qaqc.report",
    "qaqc.crm_library.list", "qaqc.crm_library.upsert",
    // spectrometry.*
    "spectrometry.project.create", "spectrometry.project.get", "spectrometry.project.list", "spectrometry.project.delete",
    "spectrometry.samples.list",
    "spectrometry.spectra.get", "spectrometry.spectra.list_for_sample",
    "spectrometry.import.preview_file", "spectrometry.import.native_spectra",
    "spectrometry.import.processed_table_preview", "spectrometry.import.processed_table",
    "spectrometry.import.mapping_presets.list", "spectrometry.import.mapping_presets.upsert",
    "spectrometry.preprocessing.preview", "spectrometry.preprocessing.apply_operation",
    "spectrometry.preprocessing.undo_operation", "spectrometry.preprocessing.redo_operation",
    "spectrometry.preprocessing.get_operations",
    "spectrometry.preprocessing.pipeline_presets.list", "spectrometry.preprocessing.pipeline_presets.save",
    "spectrometry.preprocessing.pipeline_presets.apply",
    "spectrometry.quality.report", "spectrometry.quality.set_status",
    "spectrometry.features.extract", "spectrometry.features.list", "spectrometry.features.presets.list",
    "spectrometry.indices.compute", "spectrometry.indices.list", "spectrometry.indices.preview_formula",
    "spectrometry.indices.presets.list", "spectrometry.indices.presets.save",
    "spectrometry.interpretation.create_manual", "spectrometry.interpretation.apply_rules",
    "spectrometry.interpretation.library_match", "spectrometry.interpretation.accept_match",
    "spectrometry.interpretation.confirm", "spectrometry.interpretation.list", "spectrometry.interpretation.history",
    "spectrometry.interpretation.rules.list", "spectrometry.interpretation.rules.upsert",
    "spectrometry.interpretation.library.list", "spectrometry.interpretation.library.upsert",
    "spectrometry.white_mica.analyze", "spectrometry.chlorite.analyze",
    "spectrometry.log.data",
    "spectrometry.export.to_dataset", "spectrometry.export.table",
    // lithogeochemistry.*
    "lithogeochemistry.tas.classify",
];

/// Send a JSON-RPC 2.0 request to the Python analytics service.
/// method: e.g. "analytics.pca", "preprocessing.quality_report"
/// params: JSON object with the request parameters
#[command]
pub async fn call_analytics(
    state: tauri::State<'_, EngineState>,
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

    let base = state.base_url();
    let response: RpcResponse = client()
        .post(format!("{base}/rpc"))
        .json(&rpc_request)
        // Large IDW grids, PCA or a big import can take a while on a laptop.
        .timeout(std::time::Duration::from_secs(180))
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
