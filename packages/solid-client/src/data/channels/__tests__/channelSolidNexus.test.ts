import { describe, expect, it, vi } from "vitest";
import { createMemoryPersistence } from "@shared/core";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { Channel, ChannelGroupState } from "@shared/lib/backend/types";
import { ChannelSolidNexus } from "../channelSolidNexus";

const channel = (id: string, position: number, name = id): Channel => ({
  id,
  community_id: "community-1",
  name,
  kind: "text",
  position,
  topic: null,
  created_at: "2026-07-15T12:00:00.000Z",
});

const groups: ChannelGroupState = {
  groups: [],
  ungroupedChannelIds: ["channel-1", "channel-2"],
  collapsedGroupIds: [],
};

describe("ChannelSolidNexus channel management", () => {
  it("creates a channel at the next position and activates it", async () => {
    const createChannel = vi
      .fn()
      .mockResolvedValue(channel("channel-3", 2, "announcements"));
    const nexus = new ChannelSolidNexus(createMemoryPersistence(), {
      createChannel,
    } as unknown as CommunityDataBackend);
    nexus.setChannels(
      "community-1",
      [channel("channel-1", 0), channel("channel-2", 1)],
      groups,
    );

    const created = await nexus.createChannel({
      communityId: "community-1",
      name: "announcements",
      topic: null,
      kind: "text",
    });

    expect(createChannel).toHaveBeenCalledWith({
      communityId: "community-1",
      name: "announcements",
      topic: null,
      kind: "text",
      position: 2,
    });
    expect(created.name).toBe("announcements");
    expect(nexus.activeChannelId()).toBe("channel-3");
    expect(nexus.state.ungrouped["community-1"]).toContain("channel-3");
  });

  it("updates channel details in the backend and local cache", async () => {
    const updateChannel = vi.fn().mockResolvedValue(undefined);
    const nexus = new ChannelSolidNexus(createMemoryPersistence(), {
      updateChannel,
    } as unknown as CommunityDataBackend);
    nexus.setChannels("community-1", [channel("channel-1", 0)], {
      ...groups,
      ungroupedChannelIds: ["channel-1"],
    });

    await nexus.updateChannel({
      communityId: "community-1",
      channelId: "channel-1",
      name: "renamed",
      topic: "A new topic",
    });

    expect(updateChannel).toHaveBeenCalledOnce();
    expect(nexus.state.entities["channel-1"]?.data).toMatchObject({
      name: "renamed",
      topic: "A new topic",
    });
  });

  it("deletes a channel and moves focus to a remaining channel", async () => {
    const deleteChannel = vi.fn().mockResolvedValue(undefined);
    const nexus = new ChannelSolidNexus(createMemoryPersistence(), {
      deleteChannel,
    } as unknown as CommunityDataBackend);
    nexus.setChannels(
      "community-1",
      [channel("channel-1", 0), channel("channel-2", 1)],
      groups,
    );
    nexus.setActiveChannelId("channel-1");

    await nexus.deleteChannel({
      communityId: "community-1",
      channelId: "channel-1",
    });

    expect(deleteChannel).toHaveBeenCalledWith({
      communityId: "community-1",
      channelId: "channel-1",
    });
    expect(nexus.state.entities["channel-1"]).toBeUndefined();
    expect(nexus.activeChannelId()).toBe("channel-2");
  });

  it("does not delete the final channel", async () => {
    const deleteChannel = vi.fn().mockResolvedValue(undefined);
    const nexus = new ChannelSolidNexus(createMemoryPersistence(), {
      deleteChannel,
    } as unknown as CommunityDataBackend);
    nexus.setChannels("community-1", [channel("channel-1", 0)], {
      ...groups,
      ungroupedChannelIds: ["channel-1"],
    });

    await expect(
      nexus.deleteChannel({
        communityId: "community-1",
        channelId: "channel-1",
      }),
    ).rejects.toThrow("At least one channel");
    expect(deleteChannel).not.toHaveBeenCalled();
  });
});
