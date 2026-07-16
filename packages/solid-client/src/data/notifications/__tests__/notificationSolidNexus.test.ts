import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryPersistence } from "@shared/core";
import type { NotificationBackend } from "@shared/lib/backend/notificationBackend";
import type {
  NotificationPreferences,
  NotificationPreferenceUpdate,
} from "@shared/lib/backend/types";
import { NotificationSolidNexus } from "../notificationSolidNexus";

const update: NotificationPreferenceUpdate = {
  friendRequestInAppEnabled: true,
  friendRequestSoundEnabled: false,
  friendRequestPushEnabled: true,
  dmInAppEnabled: true,
  dmSoundEnabled: true,
  dmPushEnabled: false,
  mentionInAppEnabled: true,
  mentionSoundEnabled: true,
  mentionPushEnabled: true,
};

const preferences: NotificationPreferences = {
  userId: "user-1",
  ...update,
  createdAt: "2026-07-15T12:00:00.000Z",
  updatedAt: "2026-07-15T12:00:00.000Z",
};

const createBackend = (
  overrides: Partial<NotificationBackend> = {},
): NotificationBackend =>
  ({
    listNotifications: vi.fn().mockResolvedValue([]),
    getNotificationCounts: vi
      .fn()
      .mockResolvedValue({ unseenCount: 0, unreadCount: 0 }),
    getNotificationPreferences: vi.fn().mockResolvedValue(preferences),
    updateNotificationPreferences: vi.fn().mockResolvedValue(preferences),
    markNotificationsSeen: vi.fn().mockResolvedValue(1),
    ...overrides,
  }) as unknown as NotificationBackend;

describe("NotificationSolidNexus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads preferences once while the cached value is fresh", async () => {
    const getNotificationPreferences = vi.fn().mockResolvedValue(preferences);
    const nexus = new NotificationSolidNexus(
      createMemoryPersistence(),
      createBackend({ getNotificationPreferences }),
    );

    await nexus.loadPreferences();
    await nexus.ensurePreferences();

    expect(getNotificationPreferences).toHaveBeenCalledTimes(1);
    expect(nexus.state.preferences).toEqual(preferences);
    expect(nexus.state.preferencesLoading).toBe(false);
  });

  it("saves preferences, refreshes the inbox, and marks rows seen", async () => {
    const saved = { ...preferences, dmPushEnabled: true };
    const updateNotificationPreferences = vi.fn().mockResolvedValue(saved);
    const markNotificationsSeen = vi.fn().mockResolvedValue(1);
    const getNotificationCounts = vi
      .fn()
      .mockResolvedValue({ unseenCount: 0, unreadCount: 0 });
    const listNotifications = vi.fn().mockResolvedValue([]);
    const nexus = new NotificationSolidNexus(
      createMemoryPersistence(),
      createBackend({
        getNotificationCounts,
        listNotifications,
        markNotificationsSeen,
        updateNotificationPreferences,
      }),
    );

    await nexus.savePreferences(update);
    await nexus.markSeen(["recipient-1"]);

    expect(updateNotificationPreferences).toHaveBeenCalledWith(update);
    expect(nexus.state.preferences).toEqual(saved);
    expect(listNotifications).toHaveBeenCalledTimes(1);
    expect(markNotificationsSeen).toHaveBeenCalledWith(["recipient-1"]);
    expect(getNotificationCounts).toHaveBeenCalledTimes(2);
    expect(nexus.state.preferencesSaving).toBe(false);
  });
});
