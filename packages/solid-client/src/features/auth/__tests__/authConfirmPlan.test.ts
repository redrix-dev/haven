import { describe, expect, it } from "vitest";
import { planAuthConfirm } from "../authConfirmPlan";

const browser = (
  params: Record<string, string>,
  client: "web" | "desktop" | "ios" | null = "web",
  continueInBrowser = false,
) => planAuthConfirm({ client, params, shell: "browser", continueInBrowser });

describe("planAuthConfirm", () => {
  it("shows Supabase's own failure before anything else", () => {
    expect(
      browser({
        token_hash: "th",
        error: "access_denied",
        error_description: "Email link is invalid or has expired",
      }),
    ).toEqual({
      kind: "error",
      message: "Email link is invalid or has expired",
    });
  });

  it("falls back to the bare error code when there's no description", () => {
    expect(browser({ error: "access_denied" })).toEqual({
      kind: "error",
      message: "access_denied",
    });
  });

  it("asks before spending a token_hash — a scanner's fetch must not confirm", () => {
    expect(browser({ token_hash: "th", type: "signup" })).toEqual({
      kind: "confirm",
    });
  });

  it.each([
    ["desktop", "haven://auth/confirm/desktop?token_hash=th&type=recovery"],
    ["ios", "haven://auth/confirm/ios?token_hash=th&type=recovery"],
  ] as const)("hands a %s link to the installed app", (client, appLink) => {
    expect(browser({ token_hash: "th", type: "recovery" }, client)).toEqual({
      kind: "open_app",
      appLink,
    });
  });

  it("hands over today's implicit-token links too, until the templates move", () => {
    expect(
      browser(
        { access_token: "at", refresh_token: "rt", type: "signup" },
        "desktop",
      ),
    ).toEqual({
      kind: "open_app",
      appLink:
        "haven://auth/confirm/desktop?access_token=at&refresh_token=rt&type=signup",
    });
  });

  it("does not offer an app hand-off with nothing to hand over", () => {
    expect(browser({}, "ios")).toEqual({ kind: "working" });
  });

  it("confirms here when someone chooses to continue in the browser", () => {
    expect(browser({ token_hash: "th" }, "desktop", true)).toEqual({
      kind: "confirm",
    });
  });

  it("leaves Supabase's own web flows alone", () => {
    expect(browser({ access_token: "at", refresh_token: "rt" })).toEqual({
      kind: "working",
    });
    expect(browser({ code: "pkce" })).toEqual({ kind: "working" });
  });

  it("waits quietly on a bare reload of the page", () => {
    expect(browser({}, null)).toEqual({ kind: "working" });
  });

  it("never asks inside the desktop shell — it already exchanged the link", () => {
    expect(
      planAuthConfirm({
        client: "desktop",
        params: { token_hash: "th", type: "signup" },
        shell: "app",
      }),
    ).toEqual({ kind: "working" });
  });
});
