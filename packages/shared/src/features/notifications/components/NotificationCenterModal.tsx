import React from "react";
import { useNotificationsStore } from "@shared/stores/notificationsStore";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/app/ui/avatar";
import { Badge } from "@shared/app/ui/badge";
import { Button } from "@shared/app/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/app/ui/dialog";
import { ScrollArea } from "@shared/app/ui/scroll-area";
import { Skeleton } from "@shared/app/ui/skeleton";
import { Slider } from "@shared/app/ui/slider";
import { Switch } from "@shared/app/ui/switch";
import type {
  NotificationCounts,
  NotificationItem,
  NotificationPreferences,
  NotificationPreferenceUpdate,
} from "@shared/lib/backend/types";
import { filterNotificationsForInbox } from "@shared/features/notifications/inboxNotificationFilter";
import {
  getNotificationSummary,
  getNotificationTitle,
} from "@shared/features/notifications/notificationCopy";
import {
  resolveLiveAvatarUrl,
  resolveLiveUsername,
} from "@shared/lib/liveProfiles";
import type { NotificationAudioSettings } from "@shared/app/types/settings";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import { Bell, BellDot, RefreshCcw } from "lucide-react";

type NotificationCenterModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts: NotificationCounts;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onMarkAllSeen: () => void;
  onDismissAll: () => void;
  onMarkNotificationRead: (recipientId: string) => void;
  onDismissNotification: (recipientId: string) => void;
  onOpenNotificationItem?: (notification: NotificationItem) => void;
  onAcceptFriendRequestNotification?: (input: {
    recipientId: string;
    friendRequestId: string;
  }) => void;
  onDeclineFriendRequestNotification?: (input: {
    recipientId: string;
    friendRequestId: string;
  }) => void;
  onDismissFriendRequestNotification?: (input: {
    recipientId: string;
    friendRequestId: string;
  }) => void;
  preferences: NotificationPreferences | null;
  preferencesLoading: boolean;
  preferencesSaving: boolean;
  preferencesError?: string | null;
  onUpdatePreferences: (next: NotificationPreferenceUpdate) => void;
  localAudioSettings: NotificationAudioSettings;
  localAudioSaving: boolean;
  localAudioError?: string | null;
  onUpdateLocalAudioSettings: (next: NotificationAudioSettings) => void;
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString();
};

const rowIsUnread = (notification: NotificationItem) => !notification.readAt;

const getFriendRequestIdFromNotification = (
  notification: NotificationItem,
): string | null => {
  if (notification.kind !== "friend_request_received") return null;
  const raw = notification.payload.friendRequestId;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
};

export function NotificationCenterModal({
  open,
  onOpenChange,
  counts,
  error,
  refreshing,
  onRefresh,
  onMarkAllSeen,
  onDismissAll,
  onMarkNotificationRead,
  onDismissNotification,
  onOpenNotificationItem,
  onAcceptFriendRequestNotification,
  onDeclineFriendRequestNotification,
  onDismissFriendRequestNotification,
  preferences,
  preferencesLoading,
  preferencesSaving,
  preferencesError,
  onUpdatePreferences,
  localAudioSettings,
  localAudioSaving,
  localAudioError,
  onUpdateLocalAudioSettings,
}: NotificationCenterModalProps) {
  const notifications = useNotificationsStore((state) => state.notifications);
  const loading = useNotificationsStore((state) => state.isLoading);
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);
  const [showSettings, setShowSettings] = React.useState(false);
  // DMs, friend requests, and accepted-FR toasts are owned by other surfaces; see inbox filter helper.
  const visibleNotifications = filterNotificationsForInbox(notifications);
  const visibleUnreadCount = visibleNotifications.filter(
    (notification) => notification.readAt == null,
  ).length;
  // Retain these props until the dedicated notification settings surface is wired.
  void [
    preferences,
    preferencesLoading,
    preferencesSaving,
    preferencesError,
    onUpdatePreferences,
  ];

  const updateLocalAudioSettings = React.useCallback(
    (patch: Partial<NotificationAudioSettings>) => {
      onUpdateLocalAudioSettings({
        ...localAudioSettings,
        ...patch,
      });
    },
    [localAudioSettings, onUpdateLocalAudioSettings],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="app"
        className="border-border bg-surface-app text-white p-0 overflow-hidden"
      >
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="px-5 py-4 border-b border-border-panel bg-[linear-gradient(135deg,var(--card)_0%,var(--surface-inset)_70%,var(--surface-app)_100%)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <Bell className="size-5 text-icon-blue" />
                  Notification Center
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Centralized in-app notifications with unread state and inbox
                  actions.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-border-badge text-nav"
                >
                  Unseen: {counts.unseenCount}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-border-badge text-nav"
                >
                  Unread: {visibleUnreadCount}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="border-border text-white"
                >
                  <RefreshCcw
                    className={`size-4 ${refreshing ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            {showSettings && (
              <div className="border-b border-border-panel bg-surface-row-active/70 px-4 py-4">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-white">
                    Local sound settings
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    These controls only affect sounds played on this device.
                  </p>
                </div>

                <div className="rounded-md border border-border bg-surface-panel">
                  <div className="flex items-center justify-between gap-3 border-b border-border-panel px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Master sounds
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Turn all Haven notification and voice presence sounds on
                        or off.
                      </p>
                    </div>
                    <Switch
                      aria-label="Master sounds"
                      checked={localAudioSettings.masterSoundEnabled}
                      onCheckedChange={(checked) => {
                        updateLocalAudioSettings({
                          masterSoundEnabled: checked,
                        });
                      }}
                      disabled={localAudioSaving}
                    />
                  </div>

                  <div className="border-b border-border-panel px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-white">
                        Notification volume
                      </span>
                      <span className="text-muted-foreground">
                        {localAudioSettings.notificationSoundVolume}%
                      </span>
                    </div>
                    <Slider
                      aria-label="Notification volume"
                      min={0}
                      max={100}
                      step={1}
                      value={[localAudioSettings.notificationSoundVolume]}
                      onValueChange={(values) => {
                        const nextValue = values[0];
                        if (typeof nextValue !== "number") return;
                        updateLocalAudioSettings({
                          notificationSoundVolume: nextValue,
                        });
                      }}
                      disabled={localAudioSaving}
                      className="w-full py-1"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 border-b border-border-panel px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Play sounds while Haven is focused
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Turn this off if you only want sounds while Haven is in
                        the background.
                      </p>
                    </div>
                    <Switch
                      aria-label="Play sounds while Haven is focused"
                      checked={localAudioSettings.playSoundsWhenFocused}
                      onCheckedChange={(checked) => {
                        updateLocalAudioSettings({
                          playSoundsWhenFocused: checked,
                        });
                      }}
                      disabled={localAudioSaving}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Voice join/leave sounds
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Play a sound when someone joins or leaves a voice
                        channel you&apos;re in
                      </p>
                    </div>
                    <Switch
                      aria-label="Voice join/leave sounds"
                      checked={localAudioSettings.voicePresenceSoundEnabled}
                      onCheckedChange={(checked) => {
                        updateLocalAudioSettings({
                          voicePresenceSoundEnabled: checked,
                        });
                      }}
                      disabled={localAudioSaving}
                    />
                  </div>

                  {localAudioSettings.voicePresenceSoundEnabled && (
                    <div className="border-t border-border-panel px-4 py-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-white">
                          Join/leave volume
                        </span>
                        <span className="text-muted-foreground">
                          {localAudioSettings.voicePresenceSoundVolume}%
                        </span>
                      </div>
                      <Slider
                        aria-label="Join/leave volume"
                        min={0}
                        max={100}
                        step={1}
                        value={[localAudioSettings.voicePresenceSoundVolume]}
                        onValueChange={(values) => {
                          const nextValue = values[0];
                          if (typeof nextValue !== "number") return;
                          updateLocalAudioSettings({
                            voicePresenceSoundVolume: nextValue,
                          });
                        }}
                        disabled={localAudioSaving}
                        className="w-full py-1"
                      />
                    </div>
                  )}
                </div>

                {(localAudioSaving || localAudioError) && (
                  <div className="mt-3 space-y-1">
                    {localAudioSaving && (
                      <p className="text-xs text-muted-foreground">
                        Saving local sound settings...
                      </p>
                    )}
                    {localAudioError && (
                      <p className="text-xs text-red-300">{localAudioError}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-panel">
                <div className="flex items-center gap-2">
                  {counts.unseenCount > 0 ? (
                    <BellDot className="size-4 text-icon-blue" />
                  ) : (
                    <Bell className="size-4 text-icon-blue" />
                  )}
                  <span className="text-sm font-semibold">Inbox</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onMarkAllSeen}
                    disabled={counts.unseenCount === 0}
                    className="border-border text-white"
                  >
                    Mark all seen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onDismissAll}
                    disabled={notifications.length === 0}
                    className="border-border text-white"
                  >
                    Dismiss all
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-3 space-y-2">
                  {loading ? (
                    Array.from({ length: 4 }, (_, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-border bg-surface-panel px-3 py-3"
                      >
                        <div className="flex items-start gap-3">
                          <Skeleton className="size-9 rounded-xl bg-surface-hover" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-4 w-36 bg-surface-hover" />
                              <Skeleton className="h-4 w-12 rounded-full bg-surface-hover" />
                            </div>
                            <Skeleton className="h-3 w-44 bg-surface-skeleton" />
                            <Skeleton className="h-3 w-full bg-surface-skeleton" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : error ? (
                    <p className="text-sm text-red-300">{error}</p>
                  ) : visibleNotifications.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border bg-surface-panel/50 p-4">
                      <p className="text-sm text-muted-foreground">
                        No notifications yet.
                      </p>
                      <p className="mt-1 text-xs text-auxiliary">
                        Open Friends for requests; this inbox shows mentions and other updates.
                      </p>
                    </div>
                  ) : (
                    visibleNotifications.map((notification) => {
                      const actorLabel =
                        resolveLiveUsername(
                          liveProfiles,
                          notification.actorUserId,
                          notification.actorUsername,
                        )?.trim() ||
                        notification.actorUserId ||
                        "System";
                      const actorAvatarUrl = resolveLiveAvatarUrl(
                        liveProfiles,
                        notification.actorUserId,
                        notification.actorAvatarUrl,
                      );
                      const actorInitial =
                        actorLabel.trim().charAt(0).toUpperCase() || "N";
                      const unread = rowIsUnread(notification);
                      const friendRequestId =
                        getFriendRequestIdFromNotification(notification);
                      const isFriendRequestNotification =
                        Boolean(friendRequestId) &&
                        notification.kind === "friend_request_received";
                      const showInlineFriendRequestDismiss =
                        isFriendRequestNotification &&
                        Boolean(onDismissFriendRequestNotification);
                      const canOpenNotification = Boolean(
                        onOpenNotificationItem,
                      );
                      const handleOpenNotification = () => {
                        onOpenNotificationItem?.(notification);
                      };
                      const handleNotificationKeyDown = (
                        event: React.KeyboardEvent<HTMLDivElement>,
                      ) => {
                        if (!canOpenNotification) return;
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        handleOpenNotification();
                      };
                      const stopRowOpenPropagation = (
                        event: React.SyntheticEvent,
                      ) => {
                        event.stopPropagation();
                      };

                      return (
                        <div
                          key={notification.recipientId}
                          className={`rounded-md border px-3 py-3 ${
                            unread
                              ? "border-border-notification bg-surface-row-active"
                              : "border-border bg-surface-panel"
                          } ${canOpenNotification ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-border-selected" : ""}`}
                          role={canOpenNotification ? "button" : undefined}
                          tabIndex={canOpenNotification ? 0 : undefined}
                          onClick={
                            canOpenNotification
                              ? handleOpenNotification
                              : undefined
                          }
                          onKeyDown={
                            canOpenNotification
                              ? handleNotificationKeyDown
                              : undefined
                          }
                          aria-label={
                            canOpenNotification
                              ? `Open notification: ${getNotificationTitle(notification)}`
                              : undefined
                          }
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="size-9 rounded-xl border border-border bg-surface-skeleton">
                              {actorAvatarUrl && (
                                <AvatarImage
                                  src={actorAvatarUrl}
                                  alt={actorLabel}
                                />
                              )}
                              <AvatarFallback className="rounded-xl bg-surface-skeleton text-white text-xs">
                                {actorInitial}
                              </AvatarFallback>
                            </Avatar>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-white">
                                  {getNotificationTitle(notification)}
                                </p>
                                {unread && (
                                  <Badge
                                    variant="default"
                                    className="bg-primary text-white"
                                  >
                                    Unread
                                  </Badge>
                                )}
                                {!notification.seenAt && (
                                  <Badge
                                    variant="outline"
                                    className="border-border-notification-action text-notification-link"
                                  >
                                    New
                                  </Badge>
                                )}
                              </div>

                              <p className="mt-1 text-xs text-row">
                                {actorLabel}
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {formatTimestamp(notification.createdAt)}
                                </span>
                              </p>

                              <p className="mt-1 text-sm text-muted-foreground break-words">
                                {getNotificationSummary(notification)}
                              </p>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {friendRequestId &&
                                  notification.kind ===
                                    "friend_request_received" &&
                                  onAcceptFriendRequestNotification &&
                                  onDeclineFriendRequestNotification && (
                                    <>
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={(event) => {
                                          stopRowOpenPropagation(event);
                                          onAcceptFriendRequestNotification({
                                            recipientId:
                                              notification.recipientId,
                                            friendRequestId,
                                          });
                                        }}
                                      >
                                        Accept
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={(event) => {
                                          stopRowOpenPropagation(event);
                                          onDeclineFriendRequestNotification({
                                            recipientId:
                                              notification.recipientId,
                                            friendRequestId,
                                          });
                                        }}
                                      >
                                        Decline
                                      </Button>
                                      {onDismissFriendRequestNotification && (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          className="text-muted-foreground hover:text-white hover:bg-surface-hover"
                                          onClick={(event) => {
                                            stopRowOpenPropagation(event);
                                            onDismissFriendRequestNotification({
                                              recipientId:
                                                notification.recipientId,
                                              friendRequestId,
                                            });
                                          }}
                                        >
                                          Dismiss
                                        </Button>
                                      )}
                                    </>
                                  )}
                                {unread && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={(event) => {
                                      stopRowOpenPropagation(event);
                                      onMarkNotificationRead(
                                        notification.recipientId,
                                      );
                                    }}
                                  >
                                    Mark read
                                  </Button>
                                )}
                                {!showInlineFriendRequestDismiss && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-white hover:bg-surface-hover"
                                    onClick={(event) => {
                                      stopRowOpenPropagation(event);
                                      onDismissNotification(
                                        notification.recipientId,
                                      );
                                    }}
                                  >
                                    Dismiss
                                  </Button>
                                )}
                                {!notification.deliverSound && (
                                  <Badge
                                    variant="outline"
                                    className="border-border text-muted-strong"
                                  >
                                    Sound off
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
            <div className="border-t border-border-panel px-4 py-3">
              <Button
                type="button"
                variant="outline"
                className="border-border text-white"
                onClick={() => setShowSettings((current) => !current)}
                aria-expanded={showSettings}
              >
                {showSettings
                  ? "Hide Notification Settings"
                  : "Notification Settings"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
