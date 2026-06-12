import { Router } from "@solidjs/router";
import type { RouteSectionProps } from "@solidjs/router";
import type { HavenBridge } from "./bridge";
import { BridgeProvider } from "./contexts/BridgeProvider";
import { SessionProvider } from "./contexts/SessionProvider";
import { ThemeProvider } from "./contexts/ThemeProvider";
import { VoiceProvider } from "./contexts/VoiceProvider";
import { routes } from "./routes";
import "./theme.css";

/**
 * The app shell: providers + router + (eventually) window chrome. Nothing
 * else, ever — screens live in features/ and register in routes/, so this
 * file gains a line only when a provider or chrome changes.
 * (docs/architecture/SOLID_CLIENT_SHAPE.md)
 *
 * Router mode note: this is standard history routing, which all current
 * surfaces support (browser dev/prod, Tauri dev via the Vite server). Whether
 * Tauri PRODUCTION reloads deep paths cleanly is a known-unknown tested at the
 * first `tauri:build` smoke test — see the shape doc § Routing for the
 * decision record and the contained fix if it 404s.
 */
export function App(props: { bridge?: HavenBridge }) {
  return (
    <Router
      root={(rootProps) => <AppRoot bridge={props.bridge} {...rootProps} />}
    >
      {routes}
    </Router>
  );
}

function AppRoot(props: RouteSectionProps & { bridge?: HavenBridge }) {
  return (
    <BridgeProvider bridge={props.bridge}>
      <SessionProvider>
        <ThemeProvider>
          <VoiceProvider>{props.children}</VoiceProvider>
        </ThemeProvider>
      </SessionProvider>
    </BridgeProvider>
  );
}
