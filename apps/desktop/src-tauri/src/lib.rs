use tauri::Manager;

mod analytics_bridge;

pub use analytics_bridge::AnalyticsBridgeError;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("pyorex=debug".parse().unwrap()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            analytics_bridge::check_analytics_service,
            analytics_bridge::call_analytics,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            tracing::info!("PyOrex starting up");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PyOrex");
}
