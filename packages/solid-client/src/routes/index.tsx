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
import { Navigate } from "@solidjs/router";
import type { RouteDefinition, RouteSectionProps } from "@solidjs/router";
import { SessionProvider, useSession } from "../contexts/SessionProvider";
import { LinkActionHost, UnrecognizedLinkView } from "../features/links";
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
  CommunityAccessLossHost,
  RoleManagementView,
  CommunitySettingsPanel,
  DirectMessagesView,
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
import { FriendLinkView, FriendsView } from "../features/friends";
import { NotificationsView } from "../features/notifications";
import { ModmailView, ModmailLoader } from "../features/moderation";
import { OnboardingScreen, TermsScreen } from "../features/onboarding";
import { VoiceDock, VoicePopout } from "../features/voice";
import { useBridge } from "../contexts/BridgeProvider";
import { PeopleProvider } from "../contexts/PeopleProvider";
import { UpdaterProvider, useUpdater } from "../contexts/UpdaterProvider";
import { Titlebar } from "../components/ui/Titlebar";
import { CriticalUpdateOverlay } from "../components/ui/CriticalUpdateOverlay";
import { Toaster } from "../components/ui/Toaster";
import { ToastProvider, useToast } from "../contexts/ToastProvider";
import { requireHavenSolidCore } from "../core";
import {
  accountLoaded,
  nextOnboarding,
  termsToAccept,
} from "@shared/collections/account/selectors";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
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
              {/* Incoming links, desktop and web: see features/links. */}
              <LinkActionHost />
              {/* One toast stack for the whole app, signed in or out. */}
              <AppToaster />
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
  const win = bridge.window;

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

/**
 * Shows each notification that arrives over realtime as a toast. Mounted in
 * the authed layout, under the ToastProvider. The stack itself is
 * AppToaster, in MainShell.
 */
function NotificationToastLayer() {
  const toast = useToast();
  const core = requireHavenSolidCore();
  createEffect(() => {
    const next = core.arrived();
    if (!next?.notification.in_app) return;
    toast.show({
      title: next.notification.title,
      body: next.notification.body,
    });
  });
  return null;
}

/**
 * The toast stack, mounted in MainShell rather than the authed layout so
 * signed-out screens get toasts too — e.g. the link pipeline's "sign in to use
 * this invite", which fires before anyone reaches the authed layout.
 */
function AppToaster() {
  const toast = useToast();
  return <Toaster toasts={toast.toasts()} onDismiss={toast.dismiss} />;
}

/**
 * Gates the authed app on what the account still asks for: the newest terms
 * first, then each introduction the database offers this build, in order.
 * Until the account has loaded this session the app shows as it was left;
 * a gate appears only once the database has said it applies.
 */
function AccountGate(props: { children: JSX.Element }) {
  const core = requireHavenSolidCore();
  const account = core.stores.account;
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(getErrorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const terms = () => (accountLoaded(account) ? termsToAccept(account) : null);
  const campaign = () =>
    accountLoaded(account) ? nextOnboarding(account) : null;

  return (
    <Switch fallback={props.children}>
      <Match when={terms()}>
        {(version) => (
          <TermsScreen
            version={version()}
            busy={busy()}
            error={error()}
            onAccept={() => void run(() => core.account.acceptTerms(version()))}
          />
        )}
      </Match>
      <Match when={campaign()}>
        {(next) => (
          <OnboardingScreen
            campaign={next()}
            busy={busy()}
            error={error()}
            onComplete={() =>
              void run(() => core.answerOnboarding(next().key, "completed"))
            }
            onSkip={() =>
              void run(() => core.answerOnboarding(next().key, "skipped"))
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
        <PeopleProvider>
          <AccountGate>
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
            <CommunityAccessLossHost />
            <CommunitySettingsPanel />
          </AccountGate>
        </PeopleProvider>
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
      // The client that asked for the email is named in the path, so the page
      // knows whether to confirm here or hand the link to an installed app.
      { path: "/auth/confirm", component: AuthConfirmScreen },
      { path: "/auth/confirm/:client", component: AuthConfirmScreen },
      {
        path: "/",
        component: AppLayout,
        children: [
          { path: "/", component: CommunityHome },
          { path: "/communities", component: CommunityAccessView },
          { path: "/invite/:inviteCode", component: CommunityAccessView },
          { path: "/friends", component: FriendsView },
          { path: "/friend/:code", component: FriendLinkView },
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
      // Any address nothing above handles — a broken link, or one from a newer build.
      { path: "/*all", component: UnrecognizedLinkView },
    ],
  },
];
