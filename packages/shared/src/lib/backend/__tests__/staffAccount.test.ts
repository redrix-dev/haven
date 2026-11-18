import { describe, expect, it } from "vitest";
import { isStaffAccountToken } from "../staffAccount";

/** A token as Supabase Auth shapes it; the signature is not checked here. */
function token(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "ES256", typ: "JWT" })}.${encode(claims)}.signature`;
}

describe("isStaffAccountToken", () => {
  it("is true for a token the hook marked as a staff account", () => {
    expect(
      isStaffAccountToken(
        token({ sub: "s", aal: "aal1", staff_account: true }),
      ),
    ).toBe(true);
  });

  it("is false for a person's token", () => {
    expect(isStaffAccountToken(token({ sub: "a", aal: "aal1" }))).toBe(false);
  });

  it("only takes a real true", () => {
    expect(
      isStaffAccountToken(token({ sub: "s", staff_account: "true" })),
    ).toBe(false);
  });

  it("reads base64url payloads, which use - and _ and drop padding", () => {
    // "?>?" encodes to "Pz4/" in base64; every length remainder is covered.
    for (const name of ["?>?", "a?>?", "ab?>?", "abc?>?"]) {
      expect(
        isStaffAccountToken(token({ sub: name, staff_account: true })),
      ).toBe(true);
    }
  });

  it("is false for no token or a broken one", () => {
    expect(isStaffAccountToken(undefined)).toBe(false);
    expect(isStaffAccountToken("")).toBe(false);
    expect(isStaffAccountToken("not-a-token")).toBe(false);
    expect(isStaffAccountToken("a.%%%.c")).toBe(false);
  });
});
