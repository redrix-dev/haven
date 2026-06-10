import type { RouteDefinition } from "@solidjs/router";
import { DevHarness } from "../components/DevLogin";

/**
 * The registration point: every screen the app can navigate to is one entry
 * here, pointing at a feature's public surface (its index barrel). Popout
 * windows are routes too — a Tauri window is just an OS viewport pointed at
 * an address. Contract: docs/architecture/SOLID_CLIENT_SHAPE.md.
 *
 * Adding a feature = its folder in features/ + one entry here. App.tsx does
 * not change.
 */
export const routes: RouteDefinition[] = [
  // Disposable dev harness (auth form + bootstrap panel + theme probe).
  // Replaced by the real playground feature in SOLID_REBUILD step 3.
  { path: "/", component: DevHarness },
];
