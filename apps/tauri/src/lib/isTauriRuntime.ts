/** True when the Solid bundle runs inside the native Tauri shell (not Vite browser-only dev). */
export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window
  );
}
