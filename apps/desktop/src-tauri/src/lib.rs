#[cfg(debug_assertions)]
use tauri::Manager;

mod analytics_bridge;
mod engine;

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
        .manage(engine::EngineState::default())
        .invoke_handler(tauri::generate_handler![
            engine::engine_info,
            analytics_bridge::check_analytics_service,
            analytics_bridge::call_analytics,
            analytics_bridge::open_in_explorer,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            tracing::info!("PyOrex starting up");
            engine::start(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building PyOrex")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                engine::stop(app);
            }
        });
}
