import { render } from "solid-js/web";
import { App } from "@solid-client/App";
import { tauriBridge } from "./bridge";
import { createTauriHavenCore } from "./bootstrap/createTauriHavenCore";
import { isTauriRuntime } from "./lib/isTauriRuntime";

async function boot(): Promise<void> {
  // Build + register the core BEFORE App evaluates anything that needs it.
  const core = await createTauriHavenCore();

  // Dev affordance: poke the live caches from the console, e.g.
  //   __haven.communities.getCommunityIds()
  (window as Window & { __haven?: unknown }).__haven = core;

  // Solid's render() appends into the container — clear the index.html boot
  // splash first or it stays mounted above the app.
  document.querySelector(".boot-splash")?.remove();

  render(
    () => <App bridge={isTauriRuntime() ? tauriBridge : undefined} />,
    document.getElementById("root")!,
  );
}

void boot();
