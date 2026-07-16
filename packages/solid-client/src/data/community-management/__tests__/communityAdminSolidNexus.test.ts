import { describe, expect, it, vi } from "vitest";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import { CommunityAdminSolidNexus } from "../communityAdminSolidNexus";

describe("CommunityAdminSolidNexus", () => {
  it("exposes create and invite-redemption control-plane commands", async () => {
    const createCommunity = vi.fn().mockResolvedValue({ id: "community-new" });
    const redeemCommunityInvite = vi.fn().mockResolvedValue({
      communityId: "community-joined",
      communityName: "Joined community",
      joined: true,
    });
    const nexus = new CommunityAdminSolidNexus(
      {} as CommunityDataBackend,
      {
        createCommunity,
        redeemCommunityInvite,
      } as unknown as ControlPlaneBackend,
    );

    await expect(nexus.createCommunity("New community")).resolves.toEqual({
      id: "community-new",
    });
    await expect(nexus.redeemCommunityInvite("invite-code")).resolves.toEqual({
      communityId: "community-joined",
      communityName: "Joined community",
      joined: true,
    });

    expect(createCommunity).toHaveBeenCalledWith("New community");
    expect(redeemCommunityInvite).toHaveBeenCalledWith("invite-code");
  });
});
