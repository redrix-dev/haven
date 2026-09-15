import { describe, expect, it, vi } from "vitest";
import {
  confirmAuthFromParams,
  type AuthLinkExchanger,
} from "../confirmAuthParams";

function fakeAuth() {
  const auth = {
    setSession: vi.fn(async () => ({ error: null as unknown })),
    exchangeCodeForSession: vi.fn(async () => ({ error: null as unknown })),
    verifyOtp: vi.fn(async () => ({ error: null as unknown })),
  };
  return auth satisfies AuthLinkExchanger;
}

const expectNoSupabaseCalls = (auth: ReturnType<typeof fakeAuth>) => {
  expect(auth.setSession).not.toHaveBeenCalled();
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(auth.verifyOtp).not.toHaveBeenCalled();
};

describe("confirmAuthFromParams", () => {
  it("signs in from implicit-flow tokens — what Supabase sends desktop today", async () => {
    const auth = fakeAuth();
    const result = await confirmAuthFromParams(
      { access_token: "at", refresh_token: "rt", type: "signup" },
      auth,
    );
    expect(result).toEqual({ error: null });
    expect(auth.setSession).toHaveBeenCalledTimes(1);
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("establishes the recovery session a password reset needs", async () => {
    const auth = fakeAuth();
    await confirmAuthFromParams(
      { access_token: "at", refresh_token: "rt", type: "recovery" },
      auth,
    );
    expect(auth.setSession).toHaveBeenCalledTimes(1);
  });

  it("exchanges a PKCE code", async () => {
    const auth = fakeAuth();
    await confirmAuthFromParams({ code: "pkce-code" }, auth);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
  });

  it("verifies a token_hash with a supported type", async () => {
    const auth = fakeAuth();
    await confirmAuthFromParams({ token_hash: "th", type: "Recovery" }, auth);
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "th",
    });
  });

  it("rejects a token_hash with an unknown type without calling Supabase", async () => {
    const auth = fakeAuth();
    const result = await confirmAuthFromParams(
      { token_hash: "th", type: "bogus" },
      auth,
    );
    expect(result.error).toBeInstanceOf(Error);
    expectNoSupabaseCalls(auth);
  });

  it("surfaces Supabase's error_description immediately", async () => {
    const auth = fakeAuth();
    const result = await confirmAuthFromParams(
      {
        error: "access_denied",
        error_description: "Email link is invalid or has expired",
      },
      auth,
    );
    expect((result.error as Error).message).toBe(
      "Email link is invalid or has expired",
    );
    expectNoSupabaseCalls(auth);
  });

  it("reports a link with no sign-in details instead of silently succeeding", async () => {
    const auth = fakeAuth();
    const result = await confirmAuthFromParams({}, auth);
    expect(result.error).toBeInstanceOf(Error);
    expectNoSupabaseCalls(auth);
  });

  it("passes Supabase's own failure through", async () => {
    const auth = fakeAuth();
    const failure = new Error("Invalid Refresh Token");
    auth.setSession.mockResolvedValueOnce({ error: failure });
    const result = await confirmAuthFromParams(
      { access_token: "at", refresh_token: "rt" },
      auth,
    );
    expect(result.error).toBe(failure);
  });
});
