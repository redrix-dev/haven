import { render } from "solid-js/web";
import { App } from "@solid-client/App";
import { tauriBridge } from "./bridge";

// Tauri v2 exposes this on the window when running inside the native shell.
const isTauri = "__TAURI_INTERNALS__" in window;

render(
  () => <App bridge={isTauri ? tauriBridge : undefined} />,
  document.getElementById("root")!,
);
