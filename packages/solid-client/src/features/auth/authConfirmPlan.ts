import {
  buildHavenSchemeLink,
  type AuthConfirmClient,
} from "@shared/features/links";

/**
 * What the auth landing page (`/auth/confirm/:client`) should do with the link
 * that opened it.
 *
 * The page never signs anyone in on load (checklist D2): a link scanner that
 * fetches the URL must not spend the token, and a link opened on the wrong
 * device must be able to reach the right one. A person's click is what acts.
 */
export type AuthConfirmPlan =
  /** Supabase said no (expired, already used, wrong link). Show it straight away. */
  | { kind: "error"; message: string }
  /** The link was requested by an installed app: hand it over. */
  | { kind: "open_app"; appLink: string }
  /** Ours to complete here, on a click. */
  | { kind: "confirm" }
  /** Nothing to ask: the shell or Supabase is already exchanging, or this is a bare reload. */
  | { kind: "working" };

export type AuthConfirmInput = {
  client: AuthConfirmClient | null;
  params: Readonly<Record<string, string>>;
  /** `app` is the desktop shell, which exchanges the deep link itself. */
  shell: "app" | "browser";
  /** The "Continue in browser" escape hatch on the hand-off screen. */
  continueInBrowser?: boolean;
};

const value = (
  params: Readonly<Record<string, string>>,
  key: string,
): string | null => {
  const raw: string | undefined = params[key];
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
};

export function planAuthConfirm(input: AuthConfirmInput): AuthConfirmPlan {
  const { params, client } = input;

  const failure = value(params, "error_description") ?? value(params, "error");
  if (failure) return { kind: "error", message: failure };

  // The desktop shell routes here only after its pipeline has the link.
  if (input.shell === "app") return { kind: "working" };

  const tokenHash = value(params, "token_hash");
  const implicit =
    value(params, "access_token") && value(params, "refresh_token");
  const hasCredentials = Boolean(
    tokenHash || implicit || value(params, "code"),
  );
  const addressedToApp = client === "desktop" || client === "ios";

  // Until the templates move to `token_hash` (Phase 5), an app's link still
  // arrives as implicit tokens in the hash. Hand those over too, so the app's
  // own confirmation works from the browser it landed in.
  if (addressedToApp && hasCredentials && !input.continueInBrowser) {
    return {
      kind: "open_app",
      appLink: buildHavenSchemeLink({
        kind: "auth_confirm",
        client,
        params: { ...params },
      }),
    };
  }

  if (tokenHash) return { kind: "confirm" };

  // `access_token` / `code` on the web: Supabase's `detectSessionInUrl` owns
  // them. Nothing at all: someone reloaded the page after it was used.
  return { kind: "working" };
}
