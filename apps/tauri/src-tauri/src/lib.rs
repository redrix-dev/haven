/// Placeholder command demonstrating the JS `invoke("ping")` round-trip.
/// This is where real backend-access commands will live later.
#[tauri::command]
fn ping(name: &str) -> String {
    format!("pong from Rust 🦀 — hello, {name}")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
