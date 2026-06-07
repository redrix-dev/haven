import { createSignal } from "solid-js";
import type { HavenBridge } from "./bridge";
import { Sidebar } from "./components/Sidebar";
import { ChannelView } from "./components/ChannelView";
import "./styles.css";

const CHANNELS = ["general", "design", "engineering", "voice-lounge"];

/**
 * Placeholder Haven shell rendered with Solid. No `@shared` wiring yet — this
 * exists to evaluate Solid composition + the Tauri shell. The optional `bridge`
 * is injected by whatever host renders this (Tauri shell, or nothing in a
 * plain browser).
 */
export function App(props: { bridge?: HavenBridge }) {
  const [active, setActive] = createSignal(CHANNELS[0]);

  return (
    <div class="app-shell">
      <Sidebar channels={CHANNELS} active={active()} onSelect={setActive} />
      <ChannelView channel={active()} bridge={props.bridge} />
    </div>
  );
}
