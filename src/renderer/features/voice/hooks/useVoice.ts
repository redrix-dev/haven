import React from 'react';
import { getCommunityDataBackend } from '@/lib/backend';
import { supabase } from '@/lib/supabase';
import type { Channel } from '@/lib/backend/types';
import type { VoicePresenceStateRow, VoiceSidebarParticipant } from '@/renderer/app/types';
import { areVoiceParticipantListsEqual, isEditableKeyboardTarget } from '@/renderer/app/utils';

type VoiceControlActions = {
  join: () => void;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
};

type VoiceJoinPrompt =
  | {
      channelId: string;
      mode: 'join' | 'switch';
    }
  | null;

type VoiceSessionState = {
  joined: boolean;
  joining: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  listenOnly: boolean;
};

type UseVoiceInput = {
  currentServerId: string | null;
  currentUserId: string | null | undefined;
  currentUserDisplayName: string;
  currentChannelId: string | null;
  setCurrentChannelId: React.Dispatch<React.SetStateAction<string | null>>;
  voiceHardwareDebugPanelEnabled: boolean;
  channels: Channel[];
};

const createDefaultVoiceSessionState = (): VoiceSessionState => ({
  joined: false,
  joining: false,
  isMuted: false,
  isDeafened: false,
  listenOnly: true,
});

export function useVoice({
  currentServerId,
  currentUserId,
  currentUserDisplayName,
  currentChannelId,
  setCurrentChannelId,
  voiceHardwareDebugPanelEnabled,
  channels,
}: UseVoiceInput) {
  const [activeVoiceChannelId, setActiveVoiceChannelId] = React.useState<string | null>(null);
  const [voicePanelOpen, setVoicePanelOpen] = React.useState(false);
  const [voiceHardwareDebugPanelOpen, setVoiceHardwareDebugPanelOpen] = React.useState(false);
  const [voiceConnected, setVoiceConnected] = React.useState(false);
  const [voiceParticipants, setVoiceParticipants] = React.useState<VoiceSidebarParticipant[]>([]);
  const [voicePresenceByChannelId, setVoicePresenceByChannelId] = React.useState<
    Record<string, VoiceSidebarParticipant[]>
  >({});
  const [voiceSessionState, setVoiceSessionState] = React.useState<VoiceSessionState>(
    createDefaultVoiceSessionState
  );
  const [canSpeakInVoiceChannel, setCanSpeakInVoiceChannel] = React.useState(false);
  const [voiceControlActions, setVoiceControlActions] = React.useState<VoiceControlActions | null>(null);
  const [voiceJoinPrompt, setVoiceJoinPrompt] = React.useState<VoiceJoinPrompt>(null);

  const resetVoiceState = React.useCallback(() => {
    setActiveVoiceChannelId(null);
    setVoicePanelOpen(false);
    setVoiceConnected(false);
    setVoiceParticipants([]);
    setVoicePresenceByChannelId({});
    setVoiceSessionState(createDefaultVoiceSessionState());
    setVoiceControlActions(null);
    setVoiceJoinPrompt(null);
  }, []);

  const requestVoiceChannelJoin = React.useCallback(
    (channelId: string) => {
      const targetChannel = channels.find(
        (channel) => channel.id === channelId && channel.kind === 'voice'
      );
      if (!targetChannel) return;

      if (!activeVoiceChannelId) {
        setVoiceJoinPrompt({
          channelId,
          mode: 'join',
        });
        return;
      }

      if (activeVoiceChannelId === channelId) {
        return;
      }

      setVoiceJoinPrompt({
        channelId,
        mode: 'switch',
      });
    },
    [activeVoiceChannelId, channels]
  );

  const confirmVoiceChannelJoin = React.useCallback(() => {
    if (!voiceJoinPrompt) return;
    setActiveVoiceChannelId(voiceJoinPrompt.channelId);
    setVoicePanelOpen(false);
    setVoiceJoinPrompt(null);
  }, [voiceJoinPrompt]);

  const cancelVoiceChannelJoinPrompt = React.useCallback(() => {
    setVoiceJoinPrompt(null);
  }, []);

  const disconnectVoiceSession = React.useCallback(
    (options?: { triggerPaneLeave?: boolean }) => {
      if (options?.triggerPaneLeave !== false) {
        voiceControlActions?.leave();
      }
      setActiveVoiceChannelId(null);
      setVoicePanelOpen(false);
      setVoiceConnected(false);
      setVoiceParticipants([]);
      setVoiceControlActions(null);
      setVoiceSessionState(createDefaultVoiceSessionState());
    },
    [voiceControlActions]
  );

  React.useEffect(() => {
    if (voiceHardwareDebugPanelEnabled && currentUserId) return;
    setVoiceHardwareDebugPanelOpen(false);
  }, [currentUserId, voiceHardwareDebugPanelEnabled]);

  React.useEffect(() => {
    if (!currentUserId || !voiceHardwareDebugPanelEnabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!(event.ctrlKey || event.metaKey) || !event.altKey || !event.shiftKey) return;
      if (event.key.toLowerCase() !== 'v') return;
      if (isEditableKeyboardTarget(event.target)) return;

      event.preventDefault();
      setVoiceHardwareDebugPanelOpen((prev) => !prev);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentUserId, voiceHardwareDebugPanelEnabled]);

  React.useEffect(() => {
    if (!activeVoiceChannelId) return;

    const activeVoiceChannel = channels.find(
      (channel) => channel.id === activeVoiceChannelId && channel.kind === 'voice'
    );

    if (!activeVoiceChannel) {
      setActiveVoiceChannelId(null);
      setVoiceConnected(false);
      setVoiceParticipants([]);
      setVoicePanelOpen(false);
    }
  }, [activeVoiceChannelId, channels]);

  React.useEffect(() => {
    if (!activeVoiceChannelId) return;
    setVoicePanelOpen(false);
  }, [activeVoiceChannelId]);

  React.useEffect(() => {
    let isMounted = true;
    const voicePermissionChannelId = activeVoiceChannelId ?? currentChannelId;

    if (!currentUserId || !currentServerId || !voicePermissionChannelId) {
      setCanSpeakInVoiceChannel(false);
      return;
    }

    const selectedChannel = channels.find((channel) => channel.id === voicePermissionChannelId);
    if (!selectedChannel || selectedChannel.kind !== 'voice') {
      setCanSpeakInVoiceChannel(false);
      return;
    }

    const communityBackend = getCommunityDataBackend(currentServerId);

    const resolveVoiceSpeakPermission = async () => {
      try {
        const canSpeak = await communityBackend.canSendInChannel(voicePermissionChannelId);
        if (!isMounted) return;
        setCanSpeakInVoiceChannel(canSpeak);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error resolving voice speak permission:', error);
        setCanSpeakInVoiceChannel(false);
      }
    };

    void resolveVoiceSpeakPermission();

    return () => {
      isMounted = false;
    };
  }, [activeVoiceChannelId, channels, currentChannelId, currentServerId, currentUserId]);

  React.useEffect(() => {
    if (!currentServerId || !currentUserId) {
      setVoicePresenceByChannelId({});
      return;
    }

    const voiceChannelIds = channels
      .filter((channel) => channel.kind === 'voice')
      .map((channel) => channel.id)
      .filter((channelId) => channelId !== activeVoiceChannelId);

    setVoicePresenceByChannelId((prev) => {
      const nextEntries = Object.entries(prev).filter(([channelId]) =>
        voiceChannelIds.includes(channelId)
      );
      if (nextEntries.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(nextEntries);
    });

    if (voiceChannelIds.length === 0) {
      return;
    }

    let disposed = false;

    const subscriptionChannels = voiceChannelIds.map((voiceChannelId) => {
      const subscriptionChannel = supabase.channel(`voice:${currentServerId}:${voiceChannelId}`);

      const syncPresenceState = () => {
        if (disposed) return;

        const presenceState = subscriptionChannel.presenceState() as Record<
          string,
          VoicePresenceStateRow[]
        >;
        const participantsByUserId = new Map<string, VoiceSidebarParticipant>();

        for (const [presenceKey, presenceRows] of Object.entries(presenceState)) {
          const latestPresence = presenceRows[presenceRows.length - 1];
          if (!latestPresence) continue;

          const userId = latestPresence.user_id ?? presenceKey;
          if (!userId) continue;

          const trimmedDisplayName = latestPresence.display_name?.trim() ?? '';
          const displayName = trimmedDisplayName.length > 0 ? trimmedDisplayName : userId.slice(0, 12);

          if (!participantsByUserId.has(userId)) {
            participantsByUserId.set(userId, {
              userId,
              displayName,
            });
          }
        }

        const nextParticipants = Array.from(participantsByUserId.values()).sort((left, right) =>
          left.displayName.localeCompare(right.displayName)
        );

        setVoicePresenceByChannelId((prev) => {
          const previousParticipants = prev[voiceChannelId] ?? [];
          if (areVoiceParticipantListsEqual(previousParticipants, nextParticipants)) {
            return prev;
          }
          return {
            ...prev,
            [voiceChannelId]: nextParticipants,
          };
        });
      };

      subscriptionChannel
        .on('presence', { event: 'sync' }, syncPresenceState)
        .on('presence', { event: 'join' }, syncPresenceState)
        .on('presence', { event: 'leave' }, syncPresenceState);

      subscriptionChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          syncPresenceState();
          return;
        }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') {
          return;
        }

        if (disposed) return;
        setVoicePresenceByChannelId((prev) => {
          const previousParticipants = prev[voiceChannelId];
          if (!previousParticipants || previousParticipants.length === 0) {
            return prev;
          }
          return {
            ...prev,
            [voiceChannelId]: [],
          };
        });
      });

      return subscriptionChannel;
    });

    return () => {
      disposed = true;
      for (const subscriptionChannel of subscriptionChannels) {
        void supabase.removeChannel(subscriptionChannel);
      }
    };
  }, [activeVoiceChannelId, channels, currentServerId, currentUserId]);

  React.useEffect(() => {
    if (!currentChannelId) return;

    const selectedChannel = channels.find((channel) => channel.id === currentChannelId);
    if (!selectedChannel || selectedChannel.kind !== 'voice') return;

    const firstTextChannel = channels.find((channel) => channel.kind === 'text');
    if (firstTextChannel) {
      setCurrentChannelId(firstTextChannel.id);
    }
  }, [channels, currentChannelId, setCurrentChannelId]);

  const activeVoiceChannel =
    channels.find((channel) => channel.id === activeVoiceChannelId && channel.kind === 'voice') ?? null;

  const activeVoiceParticipantsForSidebar: VoiceSidebarParticipant[] =
    activeVoiceChannelId && currentUserId
      ? [
          ...(voiceSessionState.joined
            ? [
                {
                  userId: currentUserId,
                  displayName: currentUserDisplayName,
                },
              ]
            : []),
          ...voiceParticipants,
        ].filter(
          (participant, participantIndex, participantList) =>
            participantList.findIndex((candidate) => candidate.userId === participant.userId) ===
            participantIndex
        )
      : [];

  const voiceChannelParticipants = {
    ...voicePresenceByChannelId,
    ...(activeVoiceChannelId
      ? {
          [activeVoiceChannelId]: activeVoiceParticipantsForSidebar,
        }
      : {}),
  };

  const activeVoiceParticipantCount = voiceParticipants.length + (voiceConnected ? 1 : 0);

  return {
    state: {
      activeVoiceChannelId,
      voicePanelOpen,
      voiceHardwareDebugPanelOpen,
      voiceConnected,
      voiceParticipants,
      voiceSessionState,
      canSpeakInVoiceChannel,
      voiceControlActions,
      voiceJoinPrompt,
    },
    derived: {
      activeVoiceChannel,
      voiceChannelParticipants,
      activeVoiceParticipantCount,
    },
    actions: {
      setVoicePanelOpen,
      setVoiceHardwareDebugPanelOpen,
      setVoiceConnected,
      setVoiceParticipants,
      setVoiceSessionState,
      setCanSpeakInVoiceChannel,
      setVoiceControlActions,
      setVoiceJoinPrompt,
      resetVoiceState,
      requestVoiceChannelJoin,
      confirmVoiceChannelJoin,
      cancelVoiceChannelJoinPrompt,
      disconnectVoiceSession,
    },
  };
}
