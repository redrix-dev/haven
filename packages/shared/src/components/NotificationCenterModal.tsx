import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@shared/components/ui/avatar';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
import { ScrollArea } from '@shared/components/ui/scroll-area';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Switch } from '@shared/components/ui/switch';
import type {
  NotificationCounts,
  NotificationItem,
  NotificationPreferences,
  NotificationPreferenceUpdate,
} from '@shared/lib/backend/types';
import type { NotificationAudioSettings } from '@platform/desktop/types';
import { Bell, BellDot, RefreshCcw, Volume2, VolumeX } from 'lucide-react';

type NotificationCenterModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: NotificationItem[];
  counts: NotificationCounts;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onMarkAllSeen: () => void;
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

const getNotificationTitle = (notification: NotificationItem) => {
  switch (notification.kind) {
    case 'friend_request_received':
      return 'Friend request received';
    case 'friend_request_accepted':
      return 'Friend request accepted';
    case 'dm_message':
      return 'Direct message';
    case 'channel_mention':
      return 'Mention';
    case 'system':
    default:
      return 'Notification';
  }
};

const getNotificationSummary = (notification: NotificationItem) => {
  const titleFromPayload =
    typeof notification.payload.title === 'string' ? notification.payload.title.trim() : '';
  const messageFromPayload =
    typeof notification.payload.message === 'string' ? notification.payload.message.trim() : '';

  if (messageFromPayload) return messageFromPayload;
  if (titleFromPayload) return titleFromPayload;

  switch (notification.kind) {
    case 'friend_request_received':
      return 'A user sent you a friend request.';
    case 'friend_request_accepted':
      return 'A user accepted your friend request.';
    case 'dm_message':
      return 'You received a new direct message.';
    case 'channel_mention':
      return 'You were mentioned in a channel.';
    case 'system':
    default:
      return 'A new notification was added to your inbox.';
  }
};

const rowIsUnread = (notification: NotificationItem) => !notification.readAt;

const getFriendRequestIdFromNotification = (notification: NotificationItem): string | null => {
  if (notification.kind !== 'friend_request_received') return null;
  const raw = notification.payload.friendRequestId;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
};

export function NotificationCenterModal({
  open,
  onOpenChange,
  notifications,
  counts,
  loading,
  error,
  refreshing,
  onRefresh,
  onMarkAllSeen,
  onMarkNotificationRead,
  onDismissNotification,
  onOpenNotificationItem,
  onAcceptFriendRequestNotification,
  onDeclineFriendRequestNotification,
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
  const updatePrefs = (patch: Partial<NotificationPreferenceUpdate>) => {
    if (!preferences) return;
    onUpdatePreferences({
      friendRequestInAppEnabled: preferences.friendRequestInAppEnabled,
      friendRequestSoundEnabled: preferences.friendRequestSoundEnabled,
      friendRequestPushEnabled: preferences.friendRequestPushEnabled,
      dmInAppEnabled: preferences.dmInAppEnabled,
      dmSoundEnabled: preferences.dmSoundEnabled,
      dmPushEnabled: preferences.dmPushEnabled,
      mentionInAppEnabled: preferences.mentionInAppEnabled,
      mentionSoundEnabled: preferences.mentionSoundEnabled,
      mentionPushEnabled: preferences.mentionPushEnabled,
      ...patch,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="app"
        className="border-[#304867] bg-[#111a2b] text-white p-0 overflow-hidden"
      >
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="px-5 py-4 border-b border-[#263a58] bg-[linear-gradient(135deg,#16233a_0%,#101a2b_70%,#111a2b_100%)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <Bell className="size-5 text-[#9ac0ff]" />
                  Notification Center
                </DialogTitle>
                <DialogDescription className="text-[#a9b8cf]">
                  Centralized in-app notifications with unread state and sound preferences.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-[#355077] text-[#d5e4ff]">
                  Unseen: {counts.unseenCount}
                </Badge>
                <Badge variant="outline" className="border-[#355077] text-[#d5e4ff]">
                  Unread: {counts.unreadCount}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="border-[#304867] text-white"
                >
                  <RefreshCcw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[1.35fr_1fr]">
            <div className="min-h-0 border-b xl:border-b-0 xl:border-r border-[#263a58]">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#263a58]">
                <div className="flex items-center gap-2">
                  {counts.unseenCount > 0 ? (
                    <BellDot className="size-4 text-[#9ac0ff]" />
                  ) : (
                    <Bell className="size-4 text-[#9ac0ff]" />
                  )}
                  <span className="text-sm font-semibold">Inbox</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onMarkAllSeen}
                  disabled={counts.unseenCount === 0}
                  className="border-[#304867] text-white"
                >
                  Mark all seen
                </Button>
              </div>

              <ScrollArea className="h-full max-h-[52dvh] xl:max-h-none">
                <div className="p-3 space-y-2">
                  {loading ? (
                    Array.from({ length: 4 }, (_, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-[#304867] bg-[#142033] px-3 py-3"
                      >
                        <div className="flex items-start gap-3">
                          <Skeleton className="size-9 rounded-xl bg-[#22334f]" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-4 w-36 bg-[#22334f]" />
                              <Skeleton className="h-4 w-12 rounded-full bg-[#22334f]" />
                            </div>
                            <Skeleton className="h-3 w-44 bg-[#1b2a42]" />
                            <Skeleton className="h-3 w-full bg-[#1b2a42]" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : error ? (
                    <p className="text-sm text-red-300">{error}</p>
                  ) : notifications.length === 0 ? (
                    <div className="rounded-md border border-dashed border-[#304867] bg-[#142033]/50 p-4">
                      <p className="text-sm text-[#a9b8cf]">No notifications yet.</p>
                      <p className="mt-1 text-xs text-[#90a5c4]">
                        Friend requests will appear here once the social graph phase ships.
                      </p>
                    </div>
                  ) : (
                    notifications.map((notification) => {
                      const actorLabel =
                        notification.actorUsername?.trim() || notification.actorUserId || 'System';
                      const actorInitial = actorLabel.trim().charAt(0).toUpperCase() || 'N';
                      const unread = rowIsUnread(notification);
                      const friendRequestId = getFriendRequestIdFromNotification(notification);
                      const canOpenNotification = Boolean(onOpenNotificationItem);
                      const handleOpenNotification = () => {
                        onOpenNotificationItem?.(notification);
                      };
                      const handleNotificationKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
                        if (!canOpenNotification) return;
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        handleOpenNotification();
                      };
                      const stopRowOpenPropagation = (event: React.SyntheticEvent) => {
                        event.stopPropagation();
                      };

                      return (
                        <div
                          key={notification.recipientId}
                          className={`rounded-md border px-3 py-3 ${
                            unread
                              ? 'border-[#4a78bd] bg-[#13233c]'
                              : 'border-[#304867] bg-[#142033]'
                          } ${canOpenNotification ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b92e8]' : ''}`}
                          role={canOpenNotification ? 'button' : undefined}
                          tabIndex={canOpenNotification ? 0 : undefined}
                          onClick={canOpenNotification ? handleOpenNotification : undefined}
                          onKeyDown={canOpenNotification ? handleNotificationKeyDown : undefined}
                          aria-label={
                            canOpenNotification
                              ? `Open notification: ${getNotificationTitle(notification)}`
                              : undefined
                          }
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="size-9 rounded-xl border border-[#304867] bg-[#1b2a42]">
                              {notification.actorAvatarUrl && (
                                <AvatarImage src={notification.actorAvatarUrl} alt={actorLabel} />
                              )}
                              <AvatarFallback className="rounded-xl bg-[#1b2a42] text-white text-xs">
                                {actorInitial}
                              </AvatarFallback>
                            </Avatar>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-white">
                                  {getNotificationTitle(notification)}
                                </p>
                                {unread && (
                                  <Badge variant="default" className="bg-[#3f79d8] text-white">
                                    Unread
                                  </Badge>
                                )}
                                {!notification.seenAt && (
                                  <Badge variant="outline" className="border-[#3b5f91] text-[#b7d1ff]">
                                    New
                                  </Badge>
                                )}
                              </div>

                              <p className="mt-1 text-xs text-[#c8d7ee]">
                                {actorLabel}
                                <span className="text-[#8ea4c7]"> · {formatTimestamp(notification.createdAt)}</span>
                              </p>

                              <p className="mt-1 text-sm text-[#a9b8cf] break-words">
                                {getNotificationSummary(notification)}
                              </p>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {friendRequestId &&
                                  notification.kind === 'friend_request_received' &&
                                  onAcceptFriendRequestNotification &&
                                  onDeclineFriendRequestNotification && (
                                    <>
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={(event) => {
                                          stopRowOpenPropagation(event);
                                          onAcceptFriendRequestNotification({
                                            recipientId: notification.recipientId,
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
                                            recipientId: notification.recipientId,
                                            friendRequestId,
                                          });
                                        }}
                                      >
                                        Decline
                                      </Button>
                                    </>
                                  )}
                                {unread && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={(event) => {
                                      stopRowOpenPropagation(event);
                                      onMarkNotificationRead(notification.recipientId);
                                    }}
                                  >
                                    Mark read
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-[#a9b8cf] hover:text-white hover:bg-[#22334f]"
                                  onClick={(event) => {
                                    stopRowOpenPropagation(event);
                                    onDismissNotification(notification.recipientId);
                                  }}
                                >
                                  Dismiss
                                </Button>
                                {!notification.deliverSound && (
                                  <Badge variant="outline" className="border-[#304867] text-[#9eb4d3]">
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

            <div className="min-h-0">
              <ScrollArea className="h-full max-h-[52dvh] xl:max-h-none">
                <div className="p-4 space-y-4">
                  <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Global Notification Preferences</p>
                      <p className="text-xs text-[#9fb2cf]">
                        Server-synced notification behavior defaults for your account.
                      </p>
                    </div>

                    {preferencesLoading || !preferences ? (
                      <div className="space-y-3">
                        {Array.from({ length: 3 }, (_, index) => (
                          <div
                            key={index}
                            className="rounded-md border border-[#304867] bg-[#111a2b] p-3 space-y-2"
                          >
                            <Skeleton className="h-3 w-28 bg-[#22334f]" />
                            {Array.from({ length: 3 }, (_, rowIndex) => (
                              <div key={rowIndex} className="flex items-center justify-between gap-3">
                                <Skeleton className="h-4 w-36 bg-[#22334f]" />
                                <Skeleton className="h-5 w-8 rounded-full bg-[#22334f]" />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-md border border-[#304867] bg-[#111a2b] p-3 space-y-2">
                          <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Friend Requests</p>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">In-app notifications</span>
                            <Switch
                              checked={preferences.friendRequestInAppEnabled}
                              onCheckedChange={(checked) =>
                                updatePrefs({ friendRequestInAppEnabled: checked })
                              }
                              disabled={preferencesSaving}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">Sound notifications</span>
                            <Switch
                              checked={preferences.friendRequestSoundEnabled}
                              onCheckedChange={(checked) =>
                                updatePrefs({ friendRequestSoundEnabled: checked })
                              }
                              disabled={preferencesSaving}
                            />
                          </div>
                        </div>

                        <div className="rounded-md border border-[#304867] bg-[#111a2b] p-3 space-y-2">
                          <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Direct Messages</p>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">In-app notifications</span>
                            <Switch
                              checked={preferences.dmInAppEnabled}
                              onCheckedChange={(checked) => updatePrefs({ dmInAppEnabled: checked })}
                              disabled={preferencesSaving}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">Sound notifications</span>
                            <Switch
                              checked={preferences.dmSoundEnabled}
                              onCheckedChange={(checked) => updatePrefs({ dmSoundEnabled: checked })}
                              disabled={preferencesSaving}
                            />
                          </div>
                        </div>

                        <div className="rounded-md border border-[#304867] bg-[#111a2b] p-3 space-y-2">
                          <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Mentions</p>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">In-app notifications</span>
                            <Switch
                              checked={preferences.mentionInAppEnabled}
                              onCheckedChange={(checked) =>
                                updatePrefs({ mentionInAppEnabled: checked })
                              }
                              disabled={preferencesSaving}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm">Sound notifications</span>
                            <Switch
                              checked={preferences.mentionSoundEnabled}
                              onCheckedChange={(checked) =>
                                updatePrefs({ mentionSoundEnabled: checked })
                              }
                              disabled={preferencesSaving}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {preferencesError && <p className="text-sm text-red-300">{preferencesError}</p>}
                  </div>

                  <div className="rounded-md border border-[#304867] bg-[#142033] p-3 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Local Sound Playback</p>
                      <p className="text-xs text-[#9fb2cf]">
                        Device-local audio behavior stored locally for this device.
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2">
                        {localAudioSettings.masterSoundEnabled ? (
                          <Volume2 className="size-4 text-[#a9b8cf]" />
                        ) : (
                          <VolumeX className="size-4 text-[#a9b8cf]" />
                        )}
                        <span className="text-sm">Master notification sounds</span>
                      </div>
                      <Switch
                        checked={localAudioSettings.masterSoundEnabled}
                        onCheckedChange={(checked) =>
                          onUpdateLocalAudioSettings({
                            ...localAudioSettings,
                            masterSoundEnabled: checked,
                          })
                        }
                        disabled={localAudioSaving}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">Play sounds when app is focused</span>
                      <Switch
                        checked={localAudioSettings.playSoundsWhenFocused}
                        onCheckedChange={(checked) =>
                          onUpdateLocalAudioSettings({
                            ...localAudioSettings,
                            playSoundsWhenFocused: checked,
                          })
                        }
                        disabled={localAudioSaving}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#a9b8cf]">
                        <span>Notification sound volume</span>
                        <span>{localAudioSettings.notificationSoundVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={localAudioSettings.notificationSoundVolume}
                        onChange={(event) =>
                          onUpdateLocalAudioSettings({
                            ...localAudioSettings,
                            notificationSoundVolume: Number(event.target.value),
                          })
                        }
                        disabled={localAudioSaving}
                        className="w-full accent-[#4f8df5]"
                        aria-label="Notification sound volume"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">Voice join/leave sounds</span>
                      <Switch
                        checked={localAudioSettings.voicePresenceSoundEnabled}
                        onCheckedChange={(checked) =>
                          onUpdateLocalAudioSettings({
                            ...localAudioSettings,
                            voicePresenceSoundEnabled: checked,
                          })
                        }
                        disabled={localAudioSaving}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#a9b8cf]">
                        <span>Voice join/leave volume</span>
                        <span>{localAudioSettings.voicePresenceSoundVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={localAudioSettings.voicePresenceSoundVolume}
                        onChange={(event) =>
                          onUpdateLocalAudioSettings({
                            ...localAudioSettings,
                            voicePresenceSoundVolume: Number(event.target.value),
                          })
                        }
                        disabled={localAudioSaving || !localAudioSettings.voicePresenceSoundEnabled}
                        className="w-full accent-[#4f8df5]"
                        aria-label="Voice join/leave sound volume"
                      />
                    </div>
                    {localAudioError && <p className="text-sm text-red-300">{localAudioError}</p>}
                  </div>

                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
