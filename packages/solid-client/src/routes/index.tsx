import {
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import { Navigate, useNavigate } from "@solidjs/router";
import type { RouteDefinition, RouteSectionProps } from "@solidjs/router";
import { SessionProvider, useSession } from "../contexts/SessionProvider";
import { parseAuthConfirmUrl } from "@shared/features/auth/domain/authConfirm";
import {
  ThemeProvider,
  applyStoredThemeToDocument,
} from "../contexts/ThemeProvider";
import { VoiceProvider } from "../contexts/VoiceProvider";
import {
  CommunitySidebar,
  CommunityView,
  CommunityHome,
  CommunityAccessView,
  RoleManagementView,
  CommunitySettingsPanel,
} from "../features/community";
import {
  SignInScreen,
  SignUpScreen,
  ForgotPasswordScreen,
  ResetPasswordScreen,
  AuthConfirmScreen,
} from "../features/auth";
import {
  AppearanceSettings,
  NotificationSettings,
  ProfileSettings,
} from "../features/settings";
import { DirectMessagesView } from "../features/direct-messages";
import { FriendsView } from "../features/friends";
import { NotificationsView } from "../features/notifications";
import { ModmailView, ModmailLoader } from "../features/moderation";
import {
  OnboardingScreen,
  getSolidOnboardingContext,
} from "../features/onboarding";
import { VoiceDock, VoicePopout } from "../features/voice";
import { useBridge } from "../contexts/BridgeProvider";
import { UpdaterProvider, useUpdater } from "../contexts/UpdaterProvider";
import { Titlebar } from "../components/ui/Titlebar";
import { CriticalUpdateOverlay } from "../components/ui/CriticalUpdateOverlay";
import { Toaster } from "../components/ui/Toaster";
import { ToastProvider, useToast } from "../contexts/ToastProvider";
import { requireHavenSolidCore } from "../core";
import {
  getNotificationSummary,
  getNotificationTitle,
} from "@shared/features/notifications/notificationCopy";
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
          <ToastProvider>
            <VoiceProvider>
              <WindowChrome>{props.children}</WindowChrome>
            </VoiceProvider>
          </ToastProvider>
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
  const { confirmAuthFromUrl } = useSession();
  const win = bridge.window;

  // Route incoming deep links (haven://…). Native windows only; the web shell
  // exposes no onDeepLink, so this no-ops in a browser. Auth confirmation /
  // recovery links are exchanged for a session (web does this via
  // detectSessionInUrl; desktop must do it here), then land on /auth/confirm.
  onMount(() => {
    const subscribe = bridge.onDeepLink;
    if (!subscribe) return;
    let dispose: (() => void) | undefined;
    void subscribe((url) => {
      if (parseAuthConfirmUrl(url)) {
        navigate("/auth/confirm");
        void confirmAuthFromUrl(url);
      } else {
        navigate(deepLinkToPath(url));
      }
    }).then((d) => {
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

/**
 * Watches the notification nexus for realtime arrivals and surfaces each as a
 * toast, plus renders the toast stack. Mounted in the authed layout, so `core`
 * is bootstrapped and the ToastProvider sits above it.
 */
function NotificationToastLayer() {
  const toast = useToast();
  const incoming = requireHavenSolidCore().notifications.incoming();
  let lastSeq = 0;

  createEffect(() => {
    const next = incoming();
    if (!next || next.seq === lastSeq) return;
    lastSeq = next.seq;
    toast.show({
      title: getNotificationTitle(next.item),
      body: getNotificationSummary(next.item),
    });
  });

  return <Toaster toasts={toast.toasts()} onDismiss={toast.dismiss} />;
}

/**
 * Gates the authed app behind any pending onboarding campaigns. On mount it
 * loads the user's campaigns; while loading it shows a spinner, on error a
 * retry, and if a campaign is pending it shows the onboarding screen instead of
 * the app. No campaigns → renders the app (the fallback). Server returns only
 * not-yet-completed campaigns, so most sessions fall straight through.
 */
function OnboardingGate(props: { children: JSX.Element }) {
  const core = requireHavenSolidCore();
  const bridge = useBridge();
  const context = getSolidOnboardingContext(bridge.window != null);
  const onboarding = core.onboarding;

  const load = () => {
    void onboarding
      .load(context)
      .catch((err) => console.warn("[OnboardingGate] load failed", err));
  };
  onMount(load);

  return (
    <Switch fallback={props.children}>
      <Match when={!onboarding.state.loaded || onboarding.state.loading}>
        <div class="flex h-full w-full items-center justify-center bg-background">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      </Match>
      <Match when={onboarding.state.error}>
        <div class="flex h-full w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
          <p class="text-sm text-muted-foreground">Onboarding couldn't load.</p>
          <button
            type="button"
            onClick={() => load()}
            class="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Retry
          </button>
        </div>
      </Match>
      <Match when={onboarding.state.campaigns[0]}>
        {(campaign) => (
          <OnboardingScreen
            campaign={campaign()}
            completing={
              onboarding.state.completingCampaignKey === campaign().key
            }
            error={onboarding.state.completionError}
            onComplete={() =>
              void core
                .completeOnboarding(campaign().key, context)
                .catch((err) =>
                  console.warn("[OnboardingGate] complete failed", err),
                )
            }
          />
        )}
      </Match>
    </Switch>
  );
}

// ── main-branch layout ───────────────────────────────────────────────────────

// Guards all routes under "/" — handles the three states of session():
//
//   undefined  Supabase hasn't resolved yet (getSession() is async). Show a
//              blank screen rather than flashing the sign-in redirect.
//   null       Confirmed no session. Redirect to /sign-in.
//   Session    Authenticated. Render the app layout with the sidebar.
function AppLayout(props: RouteSectionProps) {
  const { session, passwordRecoveryRequired } = useSession();

  return (
    <Switch>
      <Match when={session() === undefined}>
        {/* Still resolving — render nothing to avoid a flash redirect */}
        <div class="h-full w-full bg-background" />
      </Match>

      <Match when={session() === null}>
        <Navigate href="/sign-in" />
      </Match>

      {/* A recovery link signed the user in only to set a new password — gate
          the whole app on it until the new password is committed. */}
      <Match when={session() && passwordRecoveryRequired()}>
        <ResetPasswordScreen />
      </Match>

      <Match when={session()}>
        <OnboardingGate>
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
          <NotificationToastLayer />
          <ModmailLoader />
          <CommunitySettingsPanel />
        </OnboardingGate>
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
      { path: "/sign-up", component: SignUpScreen },
      { path: "/forgot-password", component: ForgotPasswordScreen },
      { path: "/auth/confirm", component: AuthConfirmScreen },
      {
        path: "/",
        component: AppLayout,
        children: [
          { path: "/", component: CommunityHome },
          { path: "/communities", component: CommunityAccessView },
          { path: "/invite/:inviteCode", component: CommunityAccessView },
          { path: "/friends", component: FriendsView },
          { path: "/notifications", component: NotificationsView },
          { path: "/modmail", component: ModmailView },
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
          {
            path: "/community/:communityId/roles",
            component: RoleManagementView,
          },
          { path: "/settings/appearance", component: AppearanceSettings },
          { path: "/settings/profile", component: ProfileSettings },
          {
            path: "/settings/notifications",
            component: NotificationSettings,
          },
        ],
      },
    ],
  },
];
