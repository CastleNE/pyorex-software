//! The Python analytics engine as part of the installed app.
//!
//! Release builds start the bundled engine (`resources/engine/pyorex-engine(.exe)`, built with PyInstaller from
//! `services/analytics/pyorex-engine.spec`) on a free 127.0.0.1 port, with the user's data folder and a log file,
//! and stop it when the app exits. The engine also watches its stdin and quits by itself if the app dies.
//!
//! Debug builds (`pnpm dev`) do not start anything: they use the engine the developer runs by hand on
//! 127.0.0.1:5174, as before. `PYOREX_ENGINE_URL` overrides the address in both modes (e.g. to point a release build
//! at a development engine).
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};

pub const DEV_ENGINE_URL: &str = "http://127.0.0.1:5174";

#[derive(Default)]
pub struct EngineState {
    base_url: Mutex<Option<String>>,
    child: Mutex<Option<Child>>,
    info: Mutex<EngineInfo>,
}

#[derive(Clone, Default, Serialize)]
pub struct EngineInfo {
    /// "bundled" (started by the app), "external" (dev engine or PYOREX_ENGINE_URL) or "missing" (not found / failed).
    pub mode: String,
    pub base_url: String,
    pub data_dir: Option<String>,
    pub log_file: Option<String>,
    pub error: Option<String>,
}

impl EngineState {
    pub fn base_url(&self) -> String {
        self.base_url.lock().ok().and_then(|u| u.clone()).unwrap_or_else(|| DEV_ENGINE_URL.to_string())
    }
}

fn engine_exe(app: &AppHandle) -> Option<PathBuf> {
    let name = if cfg!(windows) { "pyorex-engine.exe" } else { "pyorex-engine" };
    let dir = app.path().resource_dir().ok()?;
    [dir.join("engine").join(name), dir.join("resources").join("engine").join(name)]
        .into_iter()
        .find(|p| p.is_file())
}

fn free_port() -> std::io::Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

/// Start (or locate) the engine. Never fails the app: problems are reported through `engine_info`.
pub fn start(app: &AppHandle) {
    let state = app.state::<EngineState>();
    let set = |info: EngineInfo| {
        *state.base_url.lock().unwrap() = Some(info.base_url.clone());
        *state.info.lock().unwrap() = info;
    };

    if let Ok(url) = std::env::var("PYOREX_ENGINE_URL") {
        set(EngineInfo { mode: "external".into(), base_url: url, ..Default::default() });
        return;
    }
    if cfg!(debug_assertions) {
        set(EngineInfo { mode: "external".into(), base_url: DEV_ENGINE_URL.into(), ..Default::default() });
        return;
    }

    let Some(exe) = engine_exe(app) else {
        tracing::error!("bundled engine not found in the resources folder");
        set(EngineInfo { mode: "missing".into(), base_url: DEV_ENGINE_URL.into(), error: Some("No se encontró el motor de cálculo instalado (engine/pyorex-engine). Reinstala PyOreX.".into()), ..Default::default() });
        return;
    };
    let data_dir = app.path().app_local_data_dir().map(|d| d.join("data")).unwrap_or_else(|_| PathBuf::from("data"));
    let log_dir = app.path().app_log_dir().unwrap_or_else(|_| data_dir.join("logs"));
    let _ = std::fs::create_dir_all(&data_dir);
    let _ = std::fs::create_dir_all(&log_dir);
    let log_file = log_dir.join("engine.log");
    let port = match free_port() {
        Ok(p) => p,
        Err(e) => {
            set(EngineInfo { mode: "missing".into(), base_url: DEV_ENGINE_URL.into(), error: Some(format!("Sin puerto local libre: {e}")), ..Default::default() });
            return;
        }
    };

    let mut cmd = Command::new(&exe);
    cmd.arg("--port").arg(port.to_string())
        .arg("--data-dir").arg(&data_dir)
        .arg("--log-file").arg(&log_file)
        .arg("--watch-stdin")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Some(dir) = exe.parent() {
        cmd.current_dir(dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let info = EngineInfo {
        mode: "bundled".into(),
        base_url: format!("http://127.0.0.1:{port}"),
        data_dir: Some(data_dir.display().to_string()),
        log_file: Some(log_file.display().to_string()),
        error: None,
    };
    match cmd.spawn() {
        Ok(child) => {
            tracing::info!("engine started (pid {}) on port {port}", child.id());
            *state.child.lock().unwrap() = Some(child);
            set(info);
        }
        Err(e) => {
            tracing::error!("could not start the engine: {e}");
            set(EngineInfo { mode: "missing".into(), error: Some(format!("No se pudo iniciar el motor de cálculo: {e}")), ..info });
        }
    }
}

/// Stop the bundled engine (app exit). Closing stdin lets it shut down cleanly; kill after a short grace period.
pub fn stop(app: &AppHandle) {
    let state = app.state::<EngineState>();
    let Some(mut child) = state.child.lock().unwrap().take() else { return };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.flush();
        drop(stdin);
    }
    for _ in 0..20 {
        if let Ok(Some(_)) = child.try_wait() {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Where the engine runs and where its data and log live (shown on the start-up screen when something fails).
#[tauri::command]
pub fn engine_info(state: tauri::State<'_, EngineState>) -> EngineInfo {
    let mut info = state.info.lock().unwrap().clone();
    // Report an engine that exited on its own (e.g. a missing library in a broken install).
    if info.mode == "bundled" {
        if let Ok(mut guard) = state.child.lock() {
            if let Some(child) = guard.as_mut() {
                if let Ok(Some(status)) = child.try_wait() {
                    info.mode = "missing".into();
                    info.error = Some(format!("El motor de cálculo se cerró ({status}). Revisa el registro."));
                }
            }
        }
    }
    info
}
