//! Native voice bridge for Linux desktop.
//!
//! WebKitGTK ships without WebRTC, so `livekit-client` can't run in the Linux
//! webview. Instead we spawn the `haven-voice` sidecar (native LiveKit + cpal
//! + echo cancellation) as a child process and talk to it over stdio:
//!
//!   we write  : mute | unmute | leave   (to its stdin)
//!   it writes : connected | ready | disconnected | error <msg>  (its stdout)
//!
//! Each stdout line is forwarded to the frontend as a `voice://event` event.
//! The token is minted server-side (voice-token edge function) and passed in —
//! the API secret never touches the client.

use std::process::Stdio;

use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct VoiceState(Mutex<Option<VoiceProc>>);

struct VoiceProc {
    child: Child,
    stdin: ChildStdin,
}

/// Resolve the haven-voice binary. `HAVEN_VOICE_BIN` overrides; otherwise look
/// next to the app under apps/tauri/haven-voice/target/{debug,release}.
fn voice_bin() -> std::path::PathBuf {
    if let Ok(p) = std::env::var("HAVEN_VOICE_BIN") {
        return std::path::PathBuf::from(p);
    }
    if let Ok(exe) = std::env::current_exe() {
        // exe = .../apps/tauri/src-tauri/target/<profile>/haven-tauri
        // ancestors: [1]=<profile> [2]=target [3]=src-tauri [4]=apps/tauri
        if let Some(apps_tauri) = exe.ancestors().nth(4) {
            for profile in ["debug", "release"] {
                let candidate = apps_tauri
                    .join("haven-voice")
                    .join("target")
                    .join(profile)
                    .join("haven-voice");
                if candidate.exists() {
                    return candidate;
                }
            }
        }
    }
    std::path::PathBuf::from("haven-voice")
}

/// Spawn (or restart) the sidecar and join the room described by `token`.
#[tauri::command]
pub async fn voice_join(
    app: AppHandle,
    state: State<'_, VoiceState>,
    url: String,
    token: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    // Tear down any existing session first.
    if let Some(mut prev) = guard.take() {
        let _ = prev.stdin.write_all(b"leave\n").await;
        let _ = prev.child.kill().await;
    }

    let mut child = Command::new(voice_bin())
        .env("LIVEKIT_URL", &url)
        .env("LIVEKIT_TOKEN", &token)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("failed to spawn haven-voice: {e}"))?;

    let stdin = child.stdin.take().ok_or("no stdin on haven-voice")?;
    let stdout = child.stdout.take().ok_or("no stdout on haven-voice")?;

    // Forward each sidecar line to the frontend, then signal disconnect on EOF.
    let emit_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = emit_app.emit("voice://event", line);
        }
        let _ = emit_app.emit("voice://event", "disconnected".to_string());
    });

    *guard = Some(VoiceProc { child, stdin });
    Ok(())
}

/// Send a control command (`mute` | `unmute` | `leave`) to the sidecar.
#[tauri::command]
pub async fn voice_send_command(
    state: State<'_, VoiceState>,
    command: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    if let Some(proc) = guard.as_mut() {
        let line = format!("{}\n", command.trim());
        proc.stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        proc.stdin.flush().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Leave the room and stop the sidecar.
#[tauri::command]
pub async fn voice_leave(state: State<'_, VoiceState>) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    if let Some(mut proc) = guard.take() {
        let _ = proc.stdin.write_all(b"leave\n").await;
        let _ = proc.stdin.flush().await;
        let _ = proc.child.kill().await;
    }
    Ok(())
}
