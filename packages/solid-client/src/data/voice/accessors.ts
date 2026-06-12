import type { Accessor } from "solid-js";
import type { VoiceSidebarParticipant } from "@shared/types/types";
import type { VoiceNexusState } from "@shared/features/voice/voiceNexusTypes";
import { voiceParticipantListsEqual } from "@shared/features/voice/logic";
import { createStoreSelector } from "../fromStore";
import type { VoiceSolidCache } from "./voiceSolidCache";

const NO_PARTICIPANTS: VoiceSidebarParticipant[] = [];

export function createVoiceState(
  cache: VoiceSolidCache,
): Accessor<VoiceNexusState> {
  return createStoreSelector(cache.reactiveStore, (state) => state);
}

/** Occupants of one voice channel — feeds the sidebar rows under each channel. */
export function createChannelVoiceParticipants(
  cache: VoiceSolidCache,
  channelId: Accessor<string>,
): Accessor<VoiceSidebarParticipant[]> {
  return createStoreSelector(
    cache.reactiveStore,
    (state) => {
      const id = channelId();
      const byChannel = state.participantsByChannelId[id];
      if (byChannel) return byChannel;
      if (state.activeChannel?.id === id || state.currentChannelId === id) {
        return state.participants;
      }
      return NO_PARTICIPANTS;
    },
    voiceParticipantListsEqual,
  );
}
