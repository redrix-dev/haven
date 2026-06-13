import { render } from "solid-js/web";
import { App } from "@solid-client/App";
import { tauriBridge } from "./bridge";
import { createTauriHavenCore } from "./bootstrap/createTauriHavenCore";

// Tauri v2 exposes this on the window when running inside the native shell.
const isTauri = "__TAURI_INTERNALS__" in window;

// Build + register the core BEFORE App evaluates anything that needs it.
const core = createTauriHavenCore();

// Dev affordance: poke the live caches from the console, e.g.
//   __haven.communities.getCommunityIds()
(window as Window & { __haven?: unknown }).__haven = core;

// Solid's render() appends into the container — clear the index.html boot
// splash first or it stays mounted above the app.
document.querySelector(".boot-splash")?.remove();

render(
  () => <App bridge={isTauri ? tauriBridge : undefined} />,
  document.getElementById("root")!,
);
