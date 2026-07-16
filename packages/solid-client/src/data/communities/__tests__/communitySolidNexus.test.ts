import { describe, expect, it } from "vitest";
import { createMemoryPersistence } from "@shared/core";
import type { ControlPlaneBackend } from "@shared/lib/backend/controlPlaneBackend.interface";
import { CommunitySolidNexus } from "../communitySolidNexus";

const community = (id: string, name = id) => ({
  id,
  name,
  created_at: "2026-07-15T12:00:00.000Z",
});

describe("CommunitySolidNexus membership changes", () => {
  it("evicts a removed community and clears active focus", () => {
    const nexus = new CommunitySolidNexus(
      createMemoryPersistence(),
      {} as ControlPlaneBackend,
    );
    nexus.setCommunities([community("community-1"), community("community-2")]);
    nexus.setActiveId("community-1");

    nexus.removeCommunity("community-1");

    expect(nexus.getCommunityIds()).toEqual(["community-2"]);
    expect(nexus.getActiveId()).toBeNull();
    expect(nexus.state.entities["community-1"]).toBeUndefined();
  });

  it("drops stale entities when a refreshed membership list omits them", () => {
    const nexus = new CommunitySolidNexus(
      createMemoryPersistence(),
      {} as ControlPlaneBackend,
    );
    nexus.setCommunities([community("community-1"), community("community-2")]);

    nexus.setCommunities([community("community-2", "Still here")]);

    expect(nexus.getCommunityIds()).toEqual(["community-2"]);
    expect(nexus.state.entities["community-1"]).toBeUndefined();
    expect(nexus.state.entities["community-2"]?.data.name).toBe("Still here");
  });
});
