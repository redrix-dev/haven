/**
 * Shared nexus getters must stay reactive on Solid.
 *
 * The per-platform Solid nexuses read their store proxy in getters such as
 * `getPermissions()`, so a component or memo calling one re-ran on change.
 * Moving the logic into shared code must not turn those into one-shot reads:
 * the Solid port's `get()` has to be the live proxy, not the raw object.
 *
 * Tier-2: the node suite's `solid-js/store` is the SSR build and has no signals.
 */
import { describe, expect, it, vi } from "vitest";
import { createMemo, createRoot } from "solid-js";
import { createMemoryPersistence } from "@shared/core";
import type { MessageBundle } from "@shared/lib/backend/types";
import { CommunityMessageSolidNexus } from "../../messages/communityMessageSolidNexus";
import { PermissionsSolidNexus } from "../../permissions/permissionsSolidNexus";
import { createSolidViewerMessagePolicyStore } from "../../session/viewerMessagePolicySessionStore";

const message = (content: string): MessageBundle => ({
  id: "m1",
  channelId: "c1",
  authorUserId: "u1",
  displayName: "alice",
  avatarSnapshotUrl: null,
  content,
  metadata: {},
  replyToMessageId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  editedAt: null,
  deletedAt: null,
  isHidden: false,
  isPlatformStaff: false,
  reactions: [],
  attachment: null,
  linkPreview: null,
});

describe("shared getters on Solid", () => {
  it("a memo over a message getter follows the store", () => {
    const nexus = new CommunityMessageSolidNexus(
      "s1",
      createMemoryPersistence(),
      createSolidViewerMessagePolicyStore(),
    );
    nexus.upsertMessage(message("first"));

    createRoot((dispose) => {
      const content = createMemo(() => nexus.getSnapshot("m1")?.content);
      expect(content()).toBe("first");

      nexus.upsertMessage(message("second"));

      expect(content()).toBe("second");
      dispose();
    });
  });

  it("a memo over a permissions getter follows a load", async () => {
    const nexus = new PermissionsSolidNexus({
      getMyPermissions: vi.fn(async () => ({
        isElevated: true,
        isOwner: false,
        canManageServer: false,
        canManageRoles: false,
        canManageMembers: false,
        canCreateChannels: false,
        canManageChannelStructure: false,
        canManageChannelPermissions: false,
        canManageMessages: false,
        canManageBans: false,
        canCreateReports: true,
        canRefineRolePermissions: false,
        canManageInvites: false,
        canViewBanHidden: false,
      })),
      listChannelRevokedUserIds: vi.fn(async () => []),
    } as never);

    let elevated!: () => boolean;
    const dispose = createRoot((disposeRoot) => {
      elevated = createMemo(() => nexus.isElevated("s1"));
      return disposeRoot;
    });
    expect(elevated()).toBe(false);

    await nexus.ensureLoaded("s1");

    expect(elevated()).toBe(true);
    dispose();
  });
});
