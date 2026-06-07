import { For } from "solid-js";
import type { HavenBridge } from "../bridge";
import { PingPanel } from "./PingPanel";

const PLACEHOLDER_MESSAGES = [
  { author: "redrixx", body: "This view is placeholder Solid composition." },
  { author: "owl", body: "Components run once. State is signals, not hooks." },
  { author: "you", body: "Backend access will be injected, just like mobile." },
];

export function ChannelView(props: { channel: string; bridge?: HavenBridge }) {
  return (
    <main class="channel">
      <header class="channel-header">
        <span class="hash">#</span> {props.channel}
      </header>

      <div class="messages">
        <For each={PLACEHOLDER_MESSAGES}>
          {(msg) => (
            <div class="message">
              <div class="avatar">{msg.author[0].toUpperCase()}</div>
              <div class="message-body">
                <div class="message-author">{msg.author}</div>
                <div class="message-text">{msg.body}</div>
              </div>
            </div>
          )}
        </For>
      </div>

      <PingPanel bridge={props.bridge} />
    </main>
  );
}
