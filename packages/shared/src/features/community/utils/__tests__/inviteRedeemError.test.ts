import { describe, expect, it } from "vitest";
import { describeInviteRedeemError } from "../inviteRedeemError";

describe("describeInviteRedeemError", () => {
  // The exact messages redeem_community_invite raises.
  it.each([
    ["Invite link has expired", "This invite has expired. Ask for a new link."],
    [
      "Invite link has reached max uses",
      "This invite has been used up. Ask for a new link.",
    ],
    [
      "Invite code is invalid or inactive",
      "That invite isn't valid anymore. Check the code or ask for a new link.",
    ],
  ])("explains %j", (raw, copy) => {
    expect(describeInviteRedeemError(new Error(raw))).toBe(copy);
  });

  it("reads PostgREST-style error objects, not just Error instances", () => {
    expect(
      describeInviteRedeemError({
        message: "Invite link has expired",
        code: "22023",
      }),
    ).toBe("This invite has expired. Ask for a new link.");
  });

  it("keeps an unrecognised server message rather than hiding it", () => {
    expect(
      describeInviteRedeemError(
        new Error("You are banned from this community"),
      ),
    ).toBe("You are banned from this community");
  });

  it("falls back to a generic message when there is nothing to show", () => {
    expect(describeInviteRedeemError(undefined)).toBe(
      "Couldn't join that community.",
    );
  });
});
