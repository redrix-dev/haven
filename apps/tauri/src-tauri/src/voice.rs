//! Native voice bridge for Linux desktop.
//!
//! WebKitGTK ships without WebRTC, so `livekit-client` can't run in the Linux
//! webview. Instead we spawn the `haven-voice` sidecar (native LiveKit + cpal
//! + echo cancellation) as a child process and talk to it over stdio using a
//! newline-delimited JSON protocol (one object per line — the sidecar's
//! protocol.rs is the wire contract; the TS mirror is `VoiceEvent` in
//! BridgeProvider):
//!
//!   we write  : {"type":"mute"} | {"type":"setMemberVolume",…} | … (stdin)
//!   it writes : {"type":"connected"} | {"type":"devices",…} | …   (stdout)
//!
//! Each stdout line is forwarded verbatim to the frontend as a `voice://event`
//! event; the bridge parses it there.
//! The token is minted server-side (voice-token edge function) and passed in —
//! the API secret never touches the client.

use std::process::Stdio;
use std::time::Duration;

use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

/// The sidecar's `Command::Leave` on the wire. Commands are tagged JSON
/// (protocol.rs); a bare `leave` is rejected as a bad command.
const LEAVE_LINE: &[u8] = b"{\"type\":\"leave\"}\n";

/// How long a leaving sidecar gets to close the room before it's killed.
const LEAVE_GRACE: Duration = Duration::from_secs(2);

#[derive(Default)]
pub struct VoiceState(Mutex<Option<VoiceProc>>);

struct VoiceProc {
    child: Child,
    stdin: ChildStdin,
}

/// Stop a sidecar: ask it to leave, give it a moment to close the room (so the
/// other participants see us go at once rather than after LiveKit's timeout),
/// then kill it if it's still running.
async fn stop(mut proc: VoiceProc) {
    let _ = proc.stdin.write_all(LEAVE_LINE).await;
    let _ = proc.stdin.flush().await;
    if tokio::time::timeout(LEAVE_GRACE, proc.child.wait())
        .await
        .is_err()
    {
        let _ = proc.child.kill().await;
    }
}

/// Resolve the haven-voice binary, in priority order:
///  1. `HAVEN_VOICE_BIN` env override (standalone / `cargo run` testing).
///  2. Bundled sidecar next to the app exe — Tauri strips the target-triple
///     suffix from the `externalBin` entry in packaged builds (see
///     tauri.linux.conf.json), so it lands as plain `haven-voice`.
///  3. Dev tree: the sidecar's own cargo target dir (a plain `cargo build` in
///     apps/tauri/haven-voice, which is how we build it during development).
///  4. Bare name, relying on PATH.
fn voice_bin() -> std::path::PathBuf {
    if let Ok(p) = std::env::var("HAVEN_VOICE_BIN") {
        return std::path::PathBuf::from(p);
    }
    let exe_name = if cfg!(windows) {
        "haven-voice.exe"
    } else {
        "haven-voice"
    };
    if let Ok(exe) = std::env::current_exe() {
        // 2. Bundled sidecar: sits directly beside the app executable.
        if let Some(dir) = exe.parent() {
            let bundled = dir.join(exe_name);
            if bundled.exists() {
                return bundled;
            }
        }
        // 3. Dev tree.
        // exe = .../apps/tauri/src-tauri/target/<profile>/haven-tauri
        // ancestors: [1]=<profile> [2]=target [3]=src-tauri [4]=apps/tauri
        if let Some(apps_tauri) = exe.ancestors().nth(4) {
            for profile in ["debug", "release"] {
                let candidate = apps_tauri
                    .join("haven-voice")
                    .join("target")
                    .join(profile)
                    .join(exe_name);
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
    if let Some(prev) = guard.take() {
        stop(prev).await;
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
        // Must be the JSON wire shape — the bridge JSON.parses every event and
        // silently drops malformed lines, so a bare string here would make a
        // sidecar crash invisible to the UI.
        let _ = emit_app.emit("voice://event", r#"{"type":"disconnected"}"#.to_string());
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
    if let Some(proc) = guard.take() {
        stop(proc).await;
    }
    Ok(())
}
