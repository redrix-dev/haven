import {
  Match,
  Show,
  Switch,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import { Navigate, useNavigate } from "@solidjs/router";
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
import { DirectMessagesView } from "../features/direct-messages";
import { FriendsView } from "../features/friends";
import { VoiceDock, VoicePopout } from "../features/voice";
import { useBridge } from "../contexts/BridgeProvider";
import { UpdaterProvider, useUpdater } from "../contexts/UpdaterProvider";
import { Titlebar } from "../components/ui/Titlebar";
import { CriticalUpdateOverlay } from "../components/ui/CriticalUpdateOverlay";
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

/** Full app stack: session bootstrap → theme (profile-synced) → voice session.
 *  Wraps content in custom window chrome on native (Tauri) windows. */
function MainShell(props: RouteSectionProps) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <UpdaterProvider>
          <VoiceProvider>
            <WindowChrome>{props.children}</WindowChrome>
          </VoiceProvider>
        </UpdaterProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

/**
 * Custom frameless chrome for the native main window: a titlebar with window
 * controls plus the updater surface — version, a dismissible "update ready"
 * pill, and a blocking prompt for critical updates. In a plain browser the
 * bridge exposes no window controls, so content passes through untouched (the
 * browser keeps its own chrome). Popout windows use PopoutLiteShell and never
 * reach this.
 */
function WindowChrome(props: { children: JSX.Element }) {
  const bridge = useBridge();
  const updater = useUpdater();
  const navigate = useNavigate();
  const win = bridge.window;

  // Route incoming deep links (haven://…). Native windows only; the web shell
  // exposes no onDeepLink, so this no-ops in a browser.
  onMount(() => {
    const subscribe = bridge.onDeepLink;
    if (!subscribe) return;
    let dispose: (() => void) | undefined;
    void subscribe((url) => navigate(deepLinkToPath(url))).then((d) => {
      dispose = d;
    });
    onCleanup(() => dispose?.());
  });

  if (!win) return <>{props.children}</>;

  // Track maximize state so the titlebar can show maximize vs restore.
  const [maximized, setMaximized] = createSignal(false);
  onMount(() => {
    void win.isMaximized().then(setMaximized);
    let dispose: (() => void) | undefined;
    void win.onMaximizeChange(setMaximized).then((d) => {
      dispose = d;
    });
    onCleanup(() => dispose?.());
  });

  const pending = () => updater.update();
  const isCritical = () => pending()?.critical === true;
  const pillVersion = () => {
    const u = pending();
    return u && !u.critical && !updater.dismissed() ? u.version : null;
  };

  return (
    <div class="flex h-full w-full flex-col">
      <Titlebar
        version={updater.version()}
        updateVersion={pillVersion()}
        applying={updater.applying()}
        maximized={maximized()}
        platform={bridge.platform}
        onMinimize={() => void win.minimize()}
        onToggleMaximize={() => void win.toggleMaximize()}
        onClose={() => void win.close()}
        onApplyUpdate={() => void updater.apply()}
        onDismissUpdate={() => updater.dismiss()}
      />
      <div class="min-h-0 flex-1">{props.children}</div>
      <Show when={isCritical()}>
        <CriticalUpdateOverlay
          version={pending()!.version}
          notes={pending()!.notes}
          applying={updater.applying()}
          onApply={() => void updater.apply()}
        />
      </Show>
    </div>
  );
}

/** Lite popout shell: themed viewport, zero session machinery. */
function PopoutLiteShell(props: RouteSectionProps) {
  applyStoredThemeToDocument();
  return <div class="h-full w-full bg-background">{props.children}</div>;
}

/** `haven://community/x/channel/y` → `/community/x/channel/y`. */
function deepLinkToPath(url: string): string {
  const stripped = url.replace(/^haven:\/\//i, "").replace(/^\/+/, "");
  return "/" + stripped;
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
          { path: "/friends", component: FriendsView },
          { path: "/direct-messages", component: DirectMessagesView },
          {
            path: "/direct-messages/:conversationId",
            component: DirectMessagesView,
          },
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
