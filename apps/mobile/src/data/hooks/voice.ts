import type { VoiceReactNexus } from "../voice/voiceReactNexus";
import type { VoiceSidebarParticipant } from "@shared/types/types";
import type { VoiceState } from "@shared/nexus/voice/voiceTypes";
import { voiceParticipantRecordsEqual } from "@shared/features/voice/logic";
import { useStoreSelector } from "./useStoreSelector";

export function useVoiceSession(nexus: VoiceReactNexus): VoiceState {
  return useStoreSelector(nexus.reactiveStore, (state) => state);
}

export function useVoiceParticipantsByChannel(
  nexus: VoiceReactNexus,
): Record<string, VoiceSidebarParticipant[]> {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.participantsByChannelId,
    voiceParticipantRecordsEqual,
  );
}
