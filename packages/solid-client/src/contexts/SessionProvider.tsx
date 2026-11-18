import { createSignal, onCleanup, createContext, useContext } from "solid-js";
import { requireHavenSolidCore } from "@solid-client/core";
import { useBridge } from "@solid-client/contexts/BridgeProvider";
import type { JSX } from "solid-js";
import type { Accessor } from "solid-js";
import type { Session } from "@supabase/supabase-js";
import type { CorePhase } from "@shared/collections/core/havenCore";
import type { AccountRestriction } from "@shared/lib/backend/records";
import {
  STAFF_ACCOUNT_MESSAGE,
  isStaffAccountToken,
} from "@shared/lib/backend/staffAccount";

function restrictionNotice(
  restriction: Pick<AccountRestriction, "ends_at">,
): string {
  return restriction.ends_at
    ? `Haven staff restricted this account until ${new Date(restriction.ends_at).toLocaleString()}.`
    : "Haven staff restricted this account.";
}
import {
  SolidAuthResult,
  confirmAuthLink,
  requestPasswordReset,
  signInWithPassword,
  signOutFromAuth,
  signUpWithPassword,
  updateRecoveryPassword,
} from "@solid-client/auth/solidAuthService";
type SessionValue = {
  session: Accessor<Session | null | undefined>;
  /** signed_out, loading (what the device kept is showing), or ready. */
  phase: Accessor<CorePhase>;
  /**
   * Why the app signed the account out (restricted by staff, or a staff
   * account), shown on the sign-in screen; null otherwise.
   */
  signedOutNotice: Accessor<string | null>;
  /** True while a recovery email link is establishing a set-new-password session. */
  passwordRecoveryRequired: Accessor<boolean>;
  signIn: (email: string, password: string) => Promise<SolidAuthResult>;
  signOut: () => Promise<void>;
  signUp: (input: {
    email: string;
    password: string;
    username: string;
    acceptedLegal: boolean;
  }) => Promise<SolidAuthResult>;
  requestPasswordReset: (email: string) => Promise<SolidAuthResult>;
  updateRecoveryPassword: (password: string) => Promise<SolidAuthResult>;
  /** Exchange an auth email link's params for a session. */
  confirmAuthLink: (
    params: Readonly<Record<string, string>>,
  ) => Promise<SolidAuthResult>;
  /** Why the last auth link failed, or null. Read by the confirm screen. */
  authConfirmError: Accessor<string | null>;
};

const SessionContext = createContext<SessionValue>();

export function SessionProvider(props: { children: JSX.Element }) {
  const core = requireHavenSolidCore();
  const supabase = core.client;
  // Auth emails name the client that asked; the desktop shell is the one with a
  // deep-link bridge (the page origin can't tell — see authConfirmRedirect.ts).
  const emailClient = useBridge().onDeepLink ? "desktop" : "web";

  const [session, setSession] = createSignal<Session | null | undefined>(
    undefined,
  );
  const [passwordRecoveryRequired, setPasswordRecoveryRequired] =
    createSignal(false);

  const phase = () => core.stores.core.phase;
  const [signedOutNotice, setSignedOutNotice] = createSignal<string | null>(
    null,
  );

  // Haven staff restricted the account: end the session, and say why on the
  // sign-in screen.
  core.listen({
    restricted: (next) => {
      setSignedOutNotice(restrictionNotice(next));
      void signOutFromAuth();
    },
  });

  // The one place a Supabase session becomes the core's session. Supabase
  // fires getSession, INITIAL_SESSION and SIGNED_IN with the same user;
  // signing in again as the same person is the same session.
  const sync = (next: Session | null) => {
    // A staff account never opens the app: sign it out before anything loads.
    if (next && isStaffAccountToken(next.access_token)) {
      setSignedOutNotice(STAFF_ACCOUNT_MESSAGE);
      void signOutFromAuth();
      next = null;
    }
    setSession(next);
    const userId = next?.user?.id ?? null;
    if (userId) {
      setSignedOutNotice(null);
      void core.signIn(userId);
    } else if (core.userId !== null) {
      core.signOut();
    }
    // Links wait for the session to be known; signing in opens a remembered one.
    core.links.setSession(userId);
  };

  void supabase.auth.getSession().then(({ data }) => {
    sync(data.session ?? null);
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, next) => {
    // A recovery link lands as a PASSWORD_RECOVERY event carrying a short-lived
    // session — gate the app on a set-new-password screen until it's used.
    if (event === "PASSWORD_RECOVERY") setPasswordRecoveryRequired(true);
    else if (event === "SIGNED_OUT") setPasswordRecoveryRequired(false);
    sync(next ?? null);
  });
  onCleanup(() => subscription.unsubscribe());

  const signIn = signInWithPassword;
  const signOut = signOutFromAuth;
  // Clear the recovery gate once the new password is committed.
  const updateRecoveryPasswordAndClear = async (password: string) => {
    const result = await updateRecoveryPassword(password);
    if (!result.error) setPasswordRecoveryRequired(false);
    return result;
  };

  const [authConfirmError, setAuthConfirmError] = createSignal<string | null>(
    null,
  );
  // Desktop exchanges auth links itself. An implicit-flow recovery link goes
  // through setSession, which reports SIGNED_IN rather than PASSWORD_RECOVERY,
  // so the recovery gate is raised from the link — before the exchange, so the
  // app never flashes ahead of the set-new-password screen.
  const confirmAuthLinkAndTrack = async (
    params: Readonly<Record<string, string | undefined>>,
  ): Promise<SolidAuthResult> => {
    const isRecovery = params.type?.toLowerCase() === "recovery";
    setAuthConfirmError(null);
    if (isRecovery) setPasswordRecoveryRequired(true);
    const result = await confirmAuthLink(params);
    if (result.error) {
      if (isRecovery) setPasswordRecoveryRequired(false);
      setAuthConfirmError(
        result.error instanceof Error && result.error.message
          ? result.error.message
          : "Couldn't confirm that link.",
      );
    }
    return result;
  };

  const value: SessionValue = {
    session,
    phase,
    signedOutNotice,
    passwordRecoveryRequired,
    signIn,
    signOut,
    signUp: (input) => signUpWithPassword(input, emailClient),
    requestPasswordReset: (email) => requestPasswordReset(email, emailClient),
    updateRecoveryPassword: updateRecoveryPasswordAndClear,
    confirmAuthLink: confirmAuthLinkAndTrack,
    authConfirmError,
  };

  return (
    <SessionContext.Provider value={value}>
      {props.children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
