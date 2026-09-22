import { describe, expect, it } from "vitest";
import { planWebLinkHandOff } from "../webLinkHandOff";

const ORIGIN = "https://haven.redrixx.com";

const EDGE_WINDOWS = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  maxTouchPoints: 0,
};
const SAFARI_MAC = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  maxTouchPoints: 0,
};
// iPadOS Safari asks for desktop sites, so it sends the Mac user agent.
const SAFARI_IPAD = { ...SAFARI_MAC, maxTouchPoints: 5 };
const SAFARI_IPHONE = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  maxTouchPoints: 5,
};
const CHROME_ANDROID = {
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  maxTouchPoints: 5,
};

describe("planWebLinkHandOff", () => {
  it.each([
    ["Edge on Windows", EDGE_WINDOWS],
    ["Safari on a Mac", SAFARI_MAC],
  ])("offers an invite to the installed app first in %s", (_, device) => {
    expect(
      planWebLinkHandOff(`${ORIGIN}/invite/E5B0C39FD3`, ORIGIN, device),
    ).toEqual({
      link: `${ORIGIN}/invite/E5B0C39FD3`,
      appLink: "haven://invite/E5B0C39FD3",
    });
  });

  it.each([
    ["an iPad", SAFARI_IPAD],
    ["an iPhone", SAFARI_IPHONE],
    ["an Android phone", CHROME_ANDROID],
  ])("goes straight to the web app on %s", (_, device) => {
    expect(
      planWebLinkHandOff(`${ORIGIN}/invite/E5B0C39FD3`, ORIGIN, device),
    ).toEqual({ link: `${ORIGIN}/invite/E5B0C39FD3`, appLink: null });
  });

  it("leaves auth links to their own landing page", () => {
    const href = `${ORIGIN}/auth/confirm/desktop?token_hash=abc&type=recovery`;
    expect(planWebLinkHandOff(href, ORIGIN, EDGE_WINDOWS)).toEqual({
      link: href,
      appLink: null,
    });
  });

  it.each([`${ORIGIN}/`, `${ORIGIN}/sign-in`, `${ORIGIN}/settings/profile`])(
    "ignores an ordinary page: %s",
    (href) => {
      expect(planWebLinkHandOff(href, ORIGIN, EDGE_WINDOWS)).toBeNull();
    },
  );
});
