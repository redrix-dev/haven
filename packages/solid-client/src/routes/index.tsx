import { Match, Switch } from "solid-js";
import { Navigate } from "@solidjs/router";
import type { RouteDefinition, RouteSectionProps } from "@solidjs/router";
import { SessionProvider, useSession } from "../contexts/SessionProvider";
import {
  ThemeProvider,
  applyStoredThemeToDocument,
} from "../contexts/ThemeProvider";
import { VoiceProvider } from "../contexts/VoiceProvider";
import {
  CommunitySidebar,
  CommunityView,
  CommunityHome,
} from "../features/community";
import { SignInScreen } from "../features/auth";
import { AppearanceSettings } from "../features/settings";
import { VoiceDock, VoicePopout } from "../features/voice";
/**
 * The registration point: every screen the app can navigate to is one entry
 * here, pointing at a feature's public surface (its index barrel). Popout
 * windows are routes too — a Tauri window is just an OS viewport pointed at
 * an address. Contract: docs/architecture/SOLID_CLIENT_SHAPE.md.
 *
 * Adding a feature = its folder in features/ + one entry here. App.tsx does
 * not change.
 *
 * SHELL WEIGHT IS A ROUTE DECISION. The main branch mounts the full provider
 * stack (session bootstrap, realtime, voice session). The /popout branch
 * mounts only what its surfaces need:
 *
 *   - PopoutLiteShell — theme + nothing else. For mirror surfaces (voice)
 *     whose state arrives over the cross-window sync channel. No session
 *     boot, no second realtime subscription, no idle VoiceProvider.
 *   - A future data-backed popout (e.g. watching a channel's messages in its
 *     own window) registers under /popout with its own shell that mounts
 *     SessionProvider (+ whatever it needs) — the seam is "add a shell
 *     component + a child route," never special window code.
 */

// ── shells ───────────────────────────────────────────────────────────────────

/** Full app stack: session bootstrap → theme (profile-synced) → voice session. */
function MainShell(props: RouteSectionProps) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <VoiceProvider>{props.children}</VoiceProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

/** Lite popout shell: themed viewport, zero session machinery. */
function PopoutLiteShell(props: RouteSectionProps) {
  applyStoredThemeToDocument();
  return <div class="h-full w-full bg-background">{props.children}</div>;
}

// ── main-branch layout ───────────────────────────────────────────────────────

// Guards all routes under "/" — handles the three states of session():
//
//   undefined  Supabase hasn't resolved yet (getSession() is async). Show a
//              blank screen rather than flashing the sign-in redirect.
//   null       Confirmed no session. Redirect to /sign-in.
//   Session    Authenticated. Render the app layout with the sidebar.
function AppLayout(props: RouteSectionProps) {
  const { session } = useSession();

  return (
    <Switch>
      <Match when={session() === undefined}>
        {/* Still resolving — render nothing to avoid a flash redirect */}
        <div class="h-full w-full bg-background" />
      </Match>

      <Match when={session() === null}>
        <Navigate href="/sign-in" />
      </Match>

      <Match when={session()}>
        <div class="flex h-full w-full overflow-hidden bg-surface-app">
          <div class="flex h-full flex-col">
            <div class="min-h-0 flex-1">
              <CommunitySidebar />
            </div>
            <VoiceDock />
          </div>
          <main class="flex flex-1 flex-col overflow-hidden">
            {props.children}
          </main>
        </div>
      </Match>
    </Switch>
  );
}

// ── route table ──────────────────────────────────────────────────────────────

export const routes: RouteDefinition[] = [
  // Popout windows — lightest shell per surface (see header comment).
  {
    path: "/popout",
    component: PopoutLiteShell,
    children: [{ path: "/voice", component: VoicePopout }],
  },

  // Everything else runs the full stack; AppLayout guards the authed tree.
  {
    path: "/",
    component: MainShell,
    children: [
      { path: "/sign-in", component: SignInScreen },
      {
        path: "/",
        component: AppLayout,
        children: [
          { path: "/", component: CommunityHome },
          { path: "/community/:communityId", component: CommunityView },
          {
            path: "/community/:communityId/channel/:channelId",
            component: CommunityView,
          },
          { path: "/settings/appearance", component: AppearanceSettings },
        ],
      },
    ],
  },
];
