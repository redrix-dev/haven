import { render } from "solid-js/web";
import { App } from "@solid-client/App";
import { createWebHavenCore } from "./createWebHavenCore";
import { buildInfo } from "./buildInfo";

function boot(): void {
  // Surface the web build identity (SHA + build time) — the web analog of the
  // desktop updater version. Inspectable in-app via the DOM + console.
  document.documentElement.dataset.havenBuild = buildInfo.stamp;
  console.info(`[Haven web] ${buildInfo.stamp} · built ${buildInfo.buildTime}`);

  // Build + register the core BEFORE App evaluates anything that needs it.
  const core = createWebHavenCore();

  // Dev affordance: poke the live caches from the console, e.g.
  //   __haven.communities.getCommunityIds()
  (window as Window & { __haven?: unknown; __havenBuild?: unknown }).__haven =
    core;
  (window as Window & { __havenBuild?: unknown }).__havenBuild = buildInfo;

  // Solid's render() appends into the container — clear the index.html boot
  // splash first or it stays mounted above the app.
  document.querySelector(".boot-splash")?.remove();

  // No bridge: solid-client runs in its portable browser mode (useBridge()
  // falls back to web equivalents per capability).
  render(() => <App />, document.getElementById("root")!);
}

boot();
