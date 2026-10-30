import { describe, expect, it } from "vitest";
import { getMessageActions } from "../messageActions";

const member = {
  isOwner: false,
  canManageMessages: false,
  canCreateReports: true,
};
const moderator = { ...member, canManageMessages: true };
const owner = { ...member, isOwner: true };
const live = (authorUserId: string | null) => ({
  authorUserId,
  deletedAt: null,
});

describe("getMessageActions", () => {
  it("the author may edit and delete their own message, not report it", () => {
    expect(
      getMessageActions({
        message: live("me"),
        viewerId: "me",
        permissions: member,
      }),
    ).toEqual({ canEdit: true, canDelete: true, canReport: false });
  });

  it("another member may only report", () => {
    expect(
      getMessageActions({
        message: live("them"),
        viewerId: "me",
        permissions: member,
      }),
    ).toEqual({ canEdit: false, canDelete: false, canReport: true });
  });

  it("manage_messages and the owner may delete someone else's message, never edit it", () => {
    for (const permissions of [moderator, owner]) {
      expect(
        getMessageActions({
          message: live("them"),
          viewerId: "me",
          permissions,
        }),
      ).toEqual({ canEdit: false, canDelete: true, canReport: true });
    }
  });

  it("without create_reports there is no report", () => {
    expect(
      getMessageActions({
        message: live("them"),
        viewerId: "me",
        permissions: { ...member, canCreateReports: false },
      }).canReport,
    ).toBe(false);
  });

  it("a deleted message, an authorless one, or no viewer offers nothing to act on", () => {
    const none = { canEdit: false, canDelete: false, canReport: false };
    expect(
      getMessageActions({
        message: { authorUserId: "me", deletedAt: "2026-10-30T00:00:00Z" },
        viewerId: "me",
        permissions: owner,
      }),
    ).toEqual(none);
    expect(
      getMessageActions({
        message: live("me"),
        viewerId: null,
        permissions: owner,
      }),
    ).toEqual(none);
    expect(
      getMessageActions({
        message: live(null),
        viewerId: "me",
        permissions: member,
      }),
    ).toEqual({ canEdit: false, canDelete: false, canReport: false });
  });
});
