import { createSignal, Show } from "solid-js";
import type { HavenBridge } from "../bridge";

/**
 * Demonstrates the shell IPC convention end to end:
 *   Solid UI -> injected bridge.ping() -> Tauri invoke() -> #[tauri::command] in Rust.
 *
 * With no bridge (plain browser via `npm run dev:solid`) it explains why.
 */
export function PingPanel(props: { bridge?: HavenBridge }) {
  const [name, setName] = createSignal("Cody");
  const [reply, setReply] = createSignal<string>();
  const [pending, setPending] = createSignal(false);

  const send = async () => {
    if (!props.bridge) {
      setReply(
        "⚠ No native bridge — running in a plain browser. Run `npm run tauri:dev` to hit the real Rust command.",
      );
      return;
    }
    setPending(true);
    try {
      setReply(await props.bridge.ping(name()));
    } catch (err) {
      setReply(`error: ${String(err)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div class="ping-panel">
      <div class="ping-row">
        <input
          class="ping-input"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          placeholder="name"
        />
        <button class="ping-button" onClick={send} disabled={pending()}>
          {pending() ? "…" : "invoke ping →"}
        </button>
      </div>

      <Show when={reply()}>
        <pre class="ping-reply">{reply()}</pre>
      </Show>

      <p class="ping-hint">
        bridge: <b>{props.bridge ? "Tauri (native)" : "none (browser)"}</b>
      </p>
    </div>
  );
}
