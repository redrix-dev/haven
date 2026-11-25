use tauri::{Emitter, Manager};

// The native voice sidecar host is Linux-only: WebKitGTK ships without WebRTC,
// so Linux spawns the `haven-voice` sidecar while macOS/Windows run
// livekit-client in the webview (VoiceProvider gates on platform === "linux").
// Desktop no longer ships to Linux, so this is quarantined — compiled only when
// targeting Linux. To resurrect: restore the Linux release/CI lanes; the code
// below already comes back when the target is linux. See
// apps/tauri/haven-voice/QUARANTINE.md.
#[cfg(target_os = "linux")]
mod voice;

/// Placeholder command demonstrating the JS `invoke("ping")` round-trip.
/// This is where real backend-access commands will live later.
#[tauri::command]
fn ping(name: &str) -> String {
    format!("pong from Rust 🦀 — hello, {name}")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // Single-instance MUST be registered first. A second launch (including
        // an OS deep-link invocation on Windows/Linux) hands its args to the
        // already-running instance and exits — no duplicate process. We focus
        // the existing window and forward any `haven://` URL to the frontend.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            if let Some(url) = argv.iter().find(|arg| arg.starts_with("haven://")) {
                let _ = app.emit("deep-link-url", url.clone());
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Register the haven:// scheme at runtime so deep links work in dev
            // (production registers it via the installer). Best-effort.
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            Ok(())
        });

    // Linux-only: the native voice sidecar state + stdio commands. Quarantined
    // with `mod voice` above (desktop no longer ships to Linux). macOS/Windows
    // never invoke these — voice there runs via livekit-client in the webview.
    #[cfg(target_os = "linux")]
    let builder = builder
        .manage(voice::VoiceState::default())
        .invoke_handler(tauri::generate_handler![
            ping,
            voice::voice_join,
            voice::voice_send_command,
            voice::voice_leave
        ]);
    #[cfg(not(target_os = "linux"))]
    let builder = builder.invoke_handler(tauri::generate_handler![ping]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
