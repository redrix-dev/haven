import type { VoiceNexus } from "../voice/VoiceNexus";
import type { VoiceSidebarParticipant } from "@shared/types/types";
import type { VoiceNexusState } from "@shared/features/voice/voiceNexusTypes";
import { voiceParticipantRecordsEqual } from "@shared/features/voice/logic";
import { useStoreSelector } from "./useStoreSelector";

export function useVoiceSession(nexus: VoiceNexus): VoiceNexusState {
  return useStoreSelector(nexus.reactiveStore, (state) => {
    void state.revision;
    return state;
  });
}

export function useVoiceParticipantsByChannel(
  nexus: VoiceNexus,
): Record<string, VoiceSidebarParticipant[]> {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.participantsByChannelId,
    voiceParticipantRecordsEqual,
  );
}
