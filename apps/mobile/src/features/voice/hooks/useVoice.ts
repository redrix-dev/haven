import React from "react";
import { useHavenCore, useVoiceSession } from "@mobile-data";
import type { Channel } from "@shared/lib/backend/records";
import type {
  ForceDisconnectVoiceReason,
  VoiceChannelReference,
  VoiceSidebarParticipant,
} from "@shared/features/voice/types";

type VoiceControlActions = {
  join: () => void;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
};

type VoiceJoinPrompt = {
  channelId: string;
  channel: VoiceChannelReference;
  mode: "join" | "switch";
} | null;

type VoiceSessionState = {
  joined: boolean;
  isMuted: boolean;
  isDeafened: boolean;
};

type UseVoiceInput = {
  currentServerId: string | null;
  currentUserId: string | null | undefined;
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  currentChannelId: string | null;
  setCurrentChannelId: (id: string | null) => void;
  voiceHardwareDebugPanelEnabled: boolean;
  channels: Channel[];
};

const createDefaultVoiceSessionState = (): VoiceSessionState => ({
  joined: false,
  isMuted: false,
  isDeafened: false,
});

export function useVoice({
  currentServerId,
  currentUserId,
  currentUserDisplayName,
  currentUserAvatarUrl,
  currentChannelId,
  setCurrentChannelId,
  voiceHardwareDebugPanelEnabled,
  channels,
}: UseVoiceInput) {
  const core = useHavenCore();
  const voiceSession = useVoiceSession();
  const voicePresenceByChannelId = voiceSession.participantsByChannelId;
  const activeVoiceChannel = voiceSession.activeChannel;
  const activeVoiceChannelId = activeVoiceChannel?.id ?? null;
  const [voicePanelOpen, setVoicePanelOpen] = React.useState(false);
  const [voiceHardwareDebugPanelOpen, setVoiceHardwareDebugPanelOpen] =
    React.useState(false);
  const voiceConnected = voiceSession.voiceConnected;
  const voiceParticipants = voiceSession.participants;
  const storedVoiceSessionState = voiceSession.sessionState;
  const [voiceControlActions, setVoiceControlActions] =
    React.useState<VoiceControlActions | null>(null);
  const [voiceJoinPrompt, setVoiceJoinPrompt] =
    React.useState<VoiceJoinPrompt>(null);
  const defaultVoiceSessionState = React.useMemo(
    createDefaultVoiceSessionState,
    [],
  );
  const voiceSessionState = storedVoiceSessionState ?? defaultVoiceSessionState;

  // TODO: this wrapper keeps the app-shaped state/derived/actions contract.
  // Later, move callers to core.voice directly.

  const setStoredVoiceConnected = React.useCallback(
    (connected: boolean) => {
      core.voice.setVoiceConnected(connected);
    },
    [core],
  );

  const setStoredVoiceParticipants = React.useCallback(
    (participants: VoiceSidebarParticipant[]) => {
      core.voice.setParticipants(participants);
    },
    [core],
  );

  const setStoredVoiceSessionState = React.useCallback(
    (nextState: VoiceSessionState) => {
      core.voice.setSessionState(nextState);
      core.voice.setJoined(nextState.joined);
      core.voice.setMuted(nextState.isMuted);
      core.voice.setDeafened(nextState.isDeafened);
    },
    [core],
  );

  const setStoredCurrentChannelId = React.useCallback(
    (channelId: string | null) => {
      core.voice.setCurrentChannelId(channelId);
    },
    [core],
  );

  const resetStoredVoiceState = React.useCallback(() => {
    core.voice.clear();
  }, [core]);

  const resetVoiceState = React.useCallback(() => {
    setVoicePanelOpen(false);
    resetStoredVoiceState();
    setVoiceControlActions(null);
    setVoiceJoinPrompt(null);
  }, [resetStoredVoiceState]);

  const cleanupStaleVoicePresenceChannels = React.useCallback(async () => {
    if (!activeVoiceChannel) return;
    await core.voice.disconnectPresenceChannel();
  }, [activeVoiceChannel, core]);

  const requestVoiceChannelJoin = React.useCallback(
    (channelId: string) => {
      const targetChannel = channels.find(
        (channel) => channel.id === channelId && channel.kind === "voice",
      );
      if (!targetChannel?.community_id) return;
      const targetVoiceChannel: VoiceChannelReference = {
        id: targetChannel.id,
        name: targetChannel.name ?? "Voice",
        community_id: targetChannel.community_id,
      };

      if (!activeVoiceChannelId) {
        setVoiceJoinPrompt({
          channelId: targetChannel.id,
          channel: targetVoiceChannel,
          mode: "join",
        });
        return;
      }

      if (activeVoiceChannelId === channelId) {
        return;
      }

      setVoiceJoinPrompt({
        channelId: targetChannel.id,
        channel: targetVoiceChannel,
        mode: "switch",
      });
    },
    [activeVoiceChannelId, channels],
  );

  const confirmVoiceChannelJoin = React.useCallback(async () => {
    if (!voiceJoinPrompt) return;

    if (
      voiceJoinPrompt.mode === "switch" &&
      activeVoiceChannelId &&
      voiceControlActions
    ) {
      core.voice.startSwitch(voiceJoinPrompt.channel);
      await voiceControlActions.leave();
      await cleanupStaleVoicePresenceChannels();
      core.voice.completeDisconnect();
    }

    core.voice.startConnect(voiceJoinPrompt.channel);
    setVoiceJoinPrompt(null);
  }, [
    activeVoiceChannelId,
    cleanupStaleVoicePresenceChannels,
    core,
    voiceControlActions,
    voiceJoinPrompt,
  ]);

  const cancelVoiceChannelJoinPrompt = React.useCallback(() => {
    setVoiceJoinPrompt(null);
  }, []);

  const disconnectVoiceSession = React.useCallback(
    async (options?: { triggerPaneLeave?: boolean }) => {
      core.voice.startDisconnect();
      if (options?.triggerPaneLeave !== false) {
        await voiceControlActions?.leave();
      }
      await cleanupStaleVoicePresenceChannels();
      core.voice.completeDisconnect();
      resetStoredVoiceState();
      setVoiceControlActions(null);
      setVoicePanelOpen(false);
    },
    [
      cleanupStaleVoicePresenceChannels,
      core,
      resetStoredVoiceState,
      voiceControlActions,
    ],
  );

  const forceDisconnectVoice = React.useCallback(
    async (reason: ForceDisconnectVoiceReason) => {
      void reason;
      await disconnectVoiceSession();
    },
    [disconnectVoiceSession],
  );

  const handleVoiceConnectionChange = React.useCallback(
    (connected: boolean) => {
      setStoredVoiceConnected(connected);
      if (connected) {
        core.voice.markConnected();
        return;
      }
      if (!activeVoiceChannelId) {
        core.voice.completeDisconnect();
      }
    },
    [activeVoiceChannelId, core, setStoredVoiceConnected],
  );

  React.useEffect(() => {
    setStoredCurrentChannelId(activeVoiceChannelId);
  }, [activeVoiceChannelId, setStoredCurrentChannelId]);

  React.useEffect(() => {
    if (voiceHardwareDebugPanelEnabled && currentUserId) return;
    setVoiceHardwareDebugPanelOpen(false);
  }, [currentUserId, voiceHardwareDebugPanelEnabled]);

  React.useEffect(() => {
    if (!currentServerId || !currentUserId) {
      core.voice.retainChannelParticipants([]);
      return;
    }

    const voiceChannelIds = channels
      .filter((channel) => channel.kind === "voice")
      .map((channel) => channel.id)
      .filter((channelId) => channelId !== activeVoiceChannelId);

    if (voiceChannelIds.length === 0) {
      core.voice.retainChannelParticipants([]);
      return;
    }

    return core.voice.subscribePresenceChannels({
      communityId: currentServerId,
      channelIds: voiceChannelIds,
      activeChannelId: activeVoiceChannelId,
    });
  }, [activeVoiceChannelId, channels, core, currentServerId, currentUserId]);

  React.useEffect(() => {
    if (!currentChannelId) return;

    const selectedChannel = channels.find(
      (channel) => channel.id === currentChannelId,
    );
    if (!selectedChannel || selectedChannel.kind !== "voice") return;

    const firstTextChannel = channels.find(
      (channel) => channel.kind === "text",
    );
    if (firstTextChannel) {
      setCurrentChannelId(firstTextChannel.id);
    }
  }, [channels, currentChannelId, setCurrentChannelId]);

  const activeVoiceParticipantsForSidebar: VoiceSidebarParticipant[] =
    activeVoiceChannelId && currentUserId
      ? [
          ...(voiceSessionState.joined
            ? [
                {
                  userId: currentUserId,
                  displayName: currentUserDisplayName,
                  avatarUrl: currentUserAvatarUrl,
                  isSpeaking: false,
                },
              ]
            : []),
          ...voiceParticipants,
        ].filter(
          (participant, participantIndex, participantList) =>
            participantList.findIndex(
              (candidate) => candidate.userId === participant.userId,
            ) === participantIndex,
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

  const activeVoiceParticipantCount =
    voiceParticipants.length + (voiceConnected ? 1 : 0);

  return {
    state: {
      activeVoiceChannelId,
      voiceConnectionState: voiceSession.phase,
      voicePanelOpen,
      voiceHardwareDebugPanelOpen,
      voiceConnected,
      voiceParticipants,
      voiceSessionState,
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
      setVoiceConnected: handleVoiceConnectionChange,
      setVoiceParticipants: setStoredVoiceParticipants,
      setVoiceSessionState: setStoredVoiceSessionState,
      setVoiceControlActions,
      setVoiceJoinPrompt,
      resetVoiceState,
      requestVoiceChannelJoin,
      confirmVoiceChannelJoin,
      cancelVoiceChannelJoinPrompt,
      disconnectVoiceSession,
      forceDisconnectVoice,
    },
  };
}
