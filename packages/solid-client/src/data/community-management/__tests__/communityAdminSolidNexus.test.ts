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

  it("loads and saves server settings through community data", async () => {
    const initial = {
      name: "Haven",
      description: null,
      allowPublicInvites: false,
      requireReportReason: true,
    };
    const saved = { ...initial, name: "Renamed Haven" };
    const fetchServerSettings = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(saved);
    const updateServerSettings = vi.fn().mockResolvedValue(undefined);
    const nexus = new CommunityAdminSolidNexus(
      {
        fetchServerSettings,
        updateServerSettings,
      } as unknown as CommunityDataBackend,
      {} as ControlPlaneBackend,
    );
    await nexus.loadServerSettings("community-1");
    expect(nexus.state.settingsByCommunity["community-1"]).toEqual(initial);

    await nexus.saveServerSettings({
      communityId: "community-1",
      values: { ...saved, name: "  Renamed Haven  " },
    });

    expect(updateServerSettings).toHaveBeenCalledWith({
      communityId: "community-1",
      values: saved,
    });
    expect(nexus.state.settingsByCommunity["community-1"]).toEqual(saved);
  });

  it("exposes community leave, delete, and rename commands", async () => {
    const leaveCommunity = vi.fn().mockResolvedValue(undefined);
    const deleteCommunity = vi.fn().mockResolvedValue(undefined);
    const renameCommunity = vi.fn().mockResolvedValue(undefined);
    const nexus = new CommunityAdminSolidNexus(
      {} as CommunityDataBackend,
      {
        leaveCommunity,
        deleteCommunity,
        renameCommunity,
      } as unknown as ControlPlaneBackend,
    );

    await nexus.leaveCommunity("community-1");
    await nexus.deleteCommunity("community-1");
    await nexus.renameCommunity("community-1", "  Neighbors  ");

    expect(leaveCommunity).toHaveBeenCalledWith("community-1");
    expect(deleteCommunity).toHaveBeenCalledWith("community-1");
    expect(renameCommunity).toHaveBeenCalledWith({
      communityId: "community-1",
      name: "Neighbors",
    });
  });
});
