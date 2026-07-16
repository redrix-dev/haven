import { describe, expect, it, vi } from "vitest";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import { ProfileSolidNexus } from "../profileSolidNexus";

const flair = {
  userFlairId: "user-flair-1",
  flairId: "flair-1",
  key: "helper",
  label: "Helper",
  description: null,
  colorToken: "primary",
  backgroundToken: "primary-muted",
  iconKey: null,
  scope: "platform" as const,
  communityId: null,
  grantSource: "staff",
  sourceCommunityId: null,
  grantedAt: "2026-07-15T12:00:00.000Z",
  expiresAt: null,
  isAvailable: true,
  isSelected: true,
};

describe("ProfileSolidNexus hydration", () => {
  it("loads flairs, profile cards, and platform staff", async () => {
    const fetchProfileCard = vi.fn().mockResolvedValue({
      userId: "user-1",
      username: "Ada",
      avatarUrl: null,
      profileVisibility: "public",
      canViewDetails: true,
      details: { bio: "Builder", activeFlair: flair },
    });
    const backend = {
      listMyUserFlairs: vi.fn().mockResolvedValue([flair]),
      fetchProfileCard,
      fetchPlatformStaff: vi
        .fn()
        .mockResolvedValue({ isActive: true, displayPrefix: "Staff" }),
    } as unknown as ControlPlaneBackend;
    const nexus = new ProfileSolidNexus(backend);

    await Promise.all([
      nexus.loadMyUserFlairs("user-1"),
      nexus.loadProfileCard("user-1"),
      nexus.loadPlatformStaff("user-1"),
    ]);

    expect(nexus.state.userFlairGrants["user-1"]).toEqual([flair]);
    expect(nexus.state.profileCards["user-1"]?.username).toBe("Ada");
    expect(nexus.state.profiles["user-1"]?.username).toBe("Ada");
    expect(nexus.state.platformStaff["user-1"]?.displayPrefix).toBe("Staff");
  });

  it("refreshes profile state after selecting an active flair", async () => {
    const setActiveUserFlair = vi.fn().mockResolvedValue(undefined);
    const backend = {
      setActiveUserFlair,
      listMyUserFlairs: vi.fn().mockResolvedValue([flair]),
      fetchUserProfile: vi.fn().mockResolvedValue({
        username: "Ada",
        avatarUrl: null,
        theme: "default",
        profileVisibility: "public",
        profileBio: null,
        activeFlair: flair,
      }),
      fetchProfileCard: vi.fn().mockResolvedValue({
        userId: "user-1",
        username: "Ada",
        avatarUrl: null,
        profileVisibility: "public",
        canViewDetails: true,
        details: { bio: null, activeFlair: flair },
      }),
    } as unknown as ControlPlaneBackend;
    const nexus = new ProfileSolidNexus(backend);

    await nexus.setActiveUserFlair("user-1", "user-flair-1");

    expect(setActiveUserFlair).toHaveBeenCalledWith("user-flair-1");
    expect(nexus.state.userFlairGrants["user-1"]?.[0]?.isSelected).toBe(true);
    expect(nexus.state.profileCards["user-1"]?.details?.activeFlair?.key).toBe(
      "helper",
    );
  });

  it("tracks profile hydration errors without leaving loading stuck", async () => {
    const nexus = new ProfileSolidNexus({
      fetchProfileCard: vi.fn().mockRejectedValue(new Error("Not visible")),
    } as unknown as ControlPlaneBackend);

    await expect(nexus.loadProfileCard("user-2")).rejects.toThrow(
      "Not visible",
    );
    expect(nexus.state.profileCardErrors["user-2"]).toBe("Not visible");
    expect(nexus.state.profileCardLoading["user-2"]).toBe(false);
  });
});
