import { buildHavenLink } from "@shared/features/links";

/** Which client asked for an auth email — the shell, not the page's address. */
export type AuthEmailClient = "web" | "desktop";

/**
 * Where Supabase sends the confirmation/recovery email link: always an https
 * page on the app domain, with the client that asked for it named in the path
 * (`/auth/confirm/web`, `/auth/confirm/desktop`). The page then confirms in the
 * browser or hands the link to the installed app — so a desktop link opened on
 * a phone still works. Web uses its own origin so previews and local dev land
 * on themselves; desktop has no web origin of its own, so it uses the canonical
 * one. Every pattern must be allow-listed in the Supabase Auth redirect
 * settings; an unlisted one silently falls back to the Site URL root, which
 * drops the token.
 *
 * `client` must come from the shell (the bridge), never from `origin`: on
 * Windows the Tauri webview's origin is `http://tauri.localhost`, which looks
 * like a web origin.
 */
export function authConfirmRedirectUrl(
  client: AuthEmailClient,
  origin: string,
): string {
  return client === "desktop"
    ? buildHavenLink({ kind: "auth_confirm", client: "desktop", params: {} })
    : buildHavenLink(
        { kind: "auth_confirm", client: "web", params: {} },
        origin,
      );
}
