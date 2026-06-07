import { For } from "solid-js";

export function Sidebar(props: {
  channels: string[];
  active: string;
  onSelect: (channel: string) => void;
}) {
  return (
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-name">Haven</span>
        <span class="brand-badge">Tauri · Solid</span>
      </div>

      <div class="section-label">Channels</div>
      <nav class="channel-list">
        <For each={props.channels}>
          {(channel) => (
            <button
              type="button"
              class="channel-item"
              classList={{ active: channel === props.active }}
              onClick={() => props.onSelect(channel)}
            >
              <span class="hash">#</span>
              <span>{channel}</span>
            </button>
          )}
        </For>
      </nav>

      <div class="sidebar-footer">spike build · not wired to @shared</div>
    </aside>
  );
}
