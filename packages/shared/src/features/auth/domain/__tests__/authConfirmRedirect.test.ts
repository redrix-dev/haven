import { describe, expect, it } from "vitest";
import { authConfirmRedirectUrl } from "../authConfirmRedirect";

describe("authConfirmRedirectUrl", () => {
  // Windows serves the Tauri webview from http://tauri.localhost; the redirect
  // must still name the desktop client on the canonical https origin, or
  // Supabase rejects it and the email lands on the Site URL root with no token.
  it.each([
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
  ])(
    "sends desktop requests to the canonical desktop page from %s",
    (origin) => {
      expect(authConfirmRedirectUrl("desktop", origin)).toBe(
        "https://haven.redrixx.com/auth/confirm/desktop",
      );
    },
  );

  it("keeps web requests on the page's own origin", () => {
    expect(authConfirmRedirectUrl("web", "https://haven.redrixx.com")).toBe(
      "https://haven.redrixx.com/auth/confirm/web",
    );
    expect(authConfirmRedirectUrl("web", "http://localhost:5173")).toBe(
      "http://localhost:5173/auth/confirm/web",
    );
  });
});
