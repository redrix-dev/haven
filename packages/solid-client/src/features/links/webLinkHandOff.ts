import { buildHavenSchemeLink, parseHavenLink } from "@shared/features/links";
import { linkFromPageUrl } from "./linkActions";

/**
 * A link the web shell loaded with, and — when an installed app might take it —
 * the `haven://` form to offer first. `appLink: null` means go straight to the
 * web pipeline.
 */
export type WebLinkHandOff = { link: string; appLink: string | null };

export type BrowserDevice = { userAgent: string; maxTouchPoints: number };

/**
 * Phones and tablets skip the hand-off: iOS opens claimed https links in the
 * app before the browser loads (Universal Links), and there's no Android app.
 * iPadOS reports a Mac user agent, so a touch-capable "Mac" counts as a tablet.
 */
export function isHandheldBrowser(device: BrowserDevice): boolean {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(device.userAgent) ||
    (/Macintosh/.test(device.userAgent) && device.maxTouchPoints > 1)
  );
}

/**
 * What the web shell should do with the address it loaded with. Destinations
 * (invite, community, channel, DM, friends, notifications) are offered to the
 * installed desktop app first; the person decides in the browser's own
 * "Open Haven?" prompt, and can tick "Always allow" to skip this next time.
 * Auth links are not: their landing page (`/auth/confirm/:client`) makes that
 * choice itself, from the client that asked for the email.
 *
 * The page can't detect whether the app is installed, or what the person
 * chose in the prompt — so the caller always keeps "Continue in browser".
 */
export function planWebLinkHandOff(
  href: string,
  origin: string,
  device: BrowserDevice,
): WebLinkHandOff | null {
  const link = linkFromPageUrl(href, origin);
  if (!link) return null;

  const intent = parseHavenLink(link, { appOrigins: [origin] });
  switch (intent.kind) {
    case "unsupported":
    case "home":
    case "auth_confirm":
      return { link, appLink: null };
    default:
      return {
        link,
        appLink: isHandheldBrowser(device)
          ? null
          : buildHavenSchemeLink(intent),
      };
  }
}
