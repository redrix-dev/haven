// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationCenterModal } from "@web-client/components/notifications/NotificationCenterModal";
import {
  createMemoryPersistence,
  registerHavenCore,
  resetHavenCore,
} from "@shared/core";
import type { HavenCore } from "@shared/core/HavenCore";
import { NotificationNexus } from "@shared/nexus/notifications/NotificationNexus";
import { ProfileNexus } from "@shared/nexus/profile/ProfileNexus";
import type {
  NotificationItem,
} from "@shared/lib/backend/types";
import type { NotificationAudioSettings } from "@shared/types/settings";

const nowIso = new Date().toISOString();

const baseLocalAudioSettings: NotificationAudioSettings = {
  masterSoundEnabled: true,
  notificationSoundVolume: 50,
  voicePresenceSoundEnabled: true,
  voicePresenceSoundVolume: 50,
  playSoundsWhenFocused: true,
};

let notificationNexus: NotificationNexus;
let profileNexus: ProfileNexus;

function makeNotification(
  partial: Partial<NotificationItem>,
): NotificationItem {
  return {
    recipientId: "recipient-1",
    eventId: "event-1",
    kind: "dm_message",
    sourceKind: "dm_message",
    sourceId: "source-1",
    actorUserId: "user-2",
    actorUsername: "User Two",
    actorAvatarUrl: null,
    payload: {
      title: "Direct message",
      message: "A DM arrived",
      conversationId: "conv-1",
    },
    deliverInApp: true,
    deliverSound: false,
    createdAt: nowIso,
    seenAt: null,
    readAt: null,
    dismissedAt: null,
    ...partial,
  };
}

function seedNotifications(items: NotificationItem[]) {
  notificationNexus.setNotifications(items, { hasMore: false });
}

describe("NotificationCenterModal", () => {
  beforeEach(() => {
    resetHavenCore();
    notificationNexus = new NotificationNexus(createMemoryPersistence(), {} as never);
    profileNexus = new ProfileNexus(createMemoryPersistence());
    registerHavenCore({
      notifications: notificationNexus,
      profiles: profileNexus,
    } as HavenCore);
    profileNexus.clear();
  });

  it("opens a visible notification row via click and keyboard", async () => {
    const user = userEvent.setup();
    const onOpenNotificationItem = vi.fn();
    seedNotifications([
      makeNotification({
        recipientId: "recipient-mention-1",
        kind: "channel_mention",
        sourceKind: "message",
        payload: {
          title: "Mention",
          message: "You were mentioned in a channel",
          communityId: "community-1",
          channelId: "channel-1",
        },
      }),
    ]);

    render(
      <NotificationCenterModal
        open
        onOpenChange={() => {}}
        counts={{ unseenCount: 1, unreadCount: 1 }}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onMarkAllSeen={() => {}}
        onDismissAll={() => {}}
        onMarkNotificationRead={() => {}}
        onDismissNotification={() => {}}
        onOpenNotificationItem={onOpenNotificationItem}
        localAudioSettings={baseLocalAudioSettings}
        localAudioSaving={false}
        onUpdateLocalAudioSettings={() => {}}
      />,
    );

    const row = screen.getByRole("button", { name: /open notification/i });
    await user.click(row);
    expect(onOpenNotificationItem).toHaveBeenCalledTimes(1);

    row.focus();
    await user.keyboard("{Enter}");
    expect(onOpenNotificationItem).toHaveBeenCalledTimes(2);
  });

  it("filters dm notifications out of the inbox list UI", () => {
    seedNotifications([makeNotification({ recipientId: "recipient-dm-1" })]);

    render(
      <NotificationCenterModal
        open
        onOpenChange={() => {}}
        counts={{ unseenCount: 1, unreadCount: 1 }}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onMarkAllSeen={() => {}}
        onDismissAll={() => {}}
        onMarkNotificationRead={() => {}}
        onDismissNotification={() => {}}
        localAudioSettings={baseLocalAudioSettings}
        localAudioSaving={false}
        onUpdateLocalAudioSettings={() => {}}
      />,
    );

    expect(screen.queryByText(/direct message/i)).toBeNull();
    expect(screen.getByText(/no notifications yet/i)).toBeTruthy();
  });

  it("overlays live actor identity details when available", () => {
    profileNexus.upsertProfile({
      userId: "user-2",
      username: "Live Actor",
      avatarUrl: "https://example.com/live-actor.png",
      updatedAt: nowIso,
    });
    seedNotifications([
      makeNotification({
        recipientId: "recipient-mention-live",
        kind: "channel_mention",
        sourceKind: "message",
        payload: {
          title: "Mention",
          message: "You were mentioned in a channel",
          communityId: "community-1",
          channelId: "channel-1",
        },
      }),
    ]);

    render(
      <NotificationCenterModal
        open
        onOpenChange={() => {}}
        counts={{ unseenCount: 1, unreadCount: 1 }}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onMarkAllSeen={() => {}}
        onDismissAll={() => {}}
        onMarkNotificationRead={() => {}}
        onDismissNotification={() => {}}
        localAudioSettings={baseLocalAudioSettings}
        localAudioSaving={false}
        onUpdateLocalAudioSettings={() => {}}
      />,
    );

    expect(screen.getByText("Live Actor")).toBeTruthy();
    expect(screen.queryByText("User Two")).toBeNull();
  });

  it("renders notification settings and saves local voice presence sound changes", async () => {
    const user = userEvent.setup();
    const onDismissAll = vi.fn();
    const onUpdateLocalAudioSettings = vi.fn();
    seedNotifications([
      makeNotification({
        recipientId: "recipient-mention-1",
        kind: "channel_mention",
        sourceKind: "message",
        payload: {
          title: "Mention",
          message: "You were mentioned in a channel",
          communityId: "community-1",
          channelId: "channel-1",
        },
      }),
    ]);

    render(
      <NotificationCenterModal
        open
        onOpenChange={() => {}}
        counts={{ unseenCount: 1, unreadCount: 1 }}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onMarkAllSeen={() => {}}
        onDismissAll={onDismissAll}
        onMarkNotificationRead={() => {}}
        onDismissNotification={() => {}}
        localAudioSettings={baseLocalAudioSettings}
        localAudioSaving={false}
        onUpdateLocalAudioSettings={onUpdateLocalAudioSettings}
      />,
    );

    expect(screen.getByRole("button", { name: /dismiss all/i })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /notification settings/i }),
    ).toBeTruthy();
    expect(screen.queryByText(/local sound settings/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /dismiss all/i }));
    expect(onDismissAll).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: /notification settings/i }),
    );

    expect(screen.getByText(/local sound settings/i)).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: /voice join\/leave sounds/i }),
    ).toBeTruthy();
    expect(screen.getAllByRole("slider")).toHaveLength(2);

    await user.click(
      screen.getByRole("switch", { name: /voice join\/leave sounds/i }),
    );
    expect(onUpdateLocalAudioSettings).toHaveBeenCalledWith({
      ...baseLocalAudioSettings,
      voicePresenceSoundEnabled: false,
    });
  });

  it("hides the join and leave volume slider when voice presence sounds are disabled", async () => {
    const user = userEvent.setup();

    render(
      <NotificationCenterModal
        open
        onOpenChange={() => {}}
        counts={{ unseenCount: 0, unreadCount: 0 }}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onMarkAllSeen={() => {}}
        onDismissAll={() => {}}
        onMarkNotificationRead={() => {}}
        onDismissNotification={() => {}}
        localAudioSettings={{
          ...baseLocalAudioSettings,
          voicePresenceSoundEnabled: false,
        }}
        localAudioSaving={false}
        onUpdateLocalAudioSettings={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /notification settings/i }),
    );

    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });

  it("does not render friend request actions in the notification center modal", async () => {
    const user = userEvent.setup();
    const onDismissFriendRequestNotification = vi.fn();
    seedNotifications([
      makeNotification({
        recipientId: "recipient-fr-1",
        kind: "friend_request_received",
        sourceKind: "friend_request",
        payload: {
          friendRequestId: "fr-1",
          title: "Friend request received",
          message: "Someone sent a request",
        },
      }),
    ]);

    render(
      <NotificationCenterModal
        open
        onOpenChange={() => {}}
        counts={{ unseenCount: 1, unreadCount: 1 }}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onMarkAllSeen={() => {}}
        onDismissAll={() => {}}
        onMarkNotificationRead={() => {}}
        onDismissNotification={() => {}}
        onAcceptFriendRequestNotification={() => {}}
        onDeclineFriendRequestNotification={() => {}}
        onDismissFriendRequestNotification={onDismissFriendRequestNotification}
        localAudioSettings={baseLocalAudioSettings}
        localAudioSaving={false}
        onUpdateLocalAudioSettings={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /decline/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^dismiss$/i })).toBeNull();
  });
});
