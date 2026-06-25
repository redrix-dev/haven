import { createSignal, type JSX } from "solid-js";

/**
 * Click-to-reveal spoiler. The hidden state keeps the children mounted but
 * invisible (so the pill is sized to its content, like mobile/Discord) under
 * an opaque background.
 */
export function Spoiler(props: { children: JSX.Element }) {
  const [revealed, setRevealed] = createSignal(false);
  return (
    <span
      role="button"
      tabIndex={revealed() ? -1 : 0}
      aria-label={revealed() ? undefined : "Spoiler — activate to reveal"}
      onClick={() => setRevealed(true)}
      onKeyDown={(e) => {
        if (!revealed() && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setRevealed(true);
        }
      }}
      class="rounded px-0.5 transition-colors"
      classList={{
        "cursor-pointer select-none bg-surface-inset": !revealed(),
        "bg-surface-inset/50": revealed(),
      }}
    >
      <span classList={{ invisible: !revealed() }}>{props.children}</span>
    </span>
  );
}
