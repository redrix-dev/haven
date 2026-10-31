import { createMemo, type Accessor } from "solid-js";
import type { VoiceRealtimeTransport } from "@shared/features/voice/types";
import type { VoiceTokenBackend } from "@shared/lib/backend/voiceTokenBackend";
import {
  VoiceNexus,
  createInitialVoiceState,
  selectChannelParticipants,
} from "@shared/nexus/voice/voiceNexus";
import type { VoiceState } from "@shared/nexus/voice/voiceTypes";
import type { VoiceSidebarParticipant } from "@shared/types/types";
import { createSolidStatePort } from "../kit/solidStatePort";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";

const NO_PARTICIPANTS: VoiceSidebarParticipant[] = [];

/** Solid read bindings over the shared VoiceNexus. */
export class VoiceSolidNexus extends VoiceNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: VoiceState;

  constructor(
    tokenBackend?: VoiceTokenBackend,
    realtime?: VoiceRealtimeTransport,
    persistence?: NexusPersistence,
  ) {
    // Rosters reconcile by userId so rows keep their identity across updates.
    const port = createSolidStatePort(createInitialVoiceState(), {
      keys: { participants: "userId", participantsByChannelId: "userId" },
    });
    super(port, tokenBackend ?? null, realtime ?? null, persistence);
    this.state = port.tracked;
  }

  /** Occupants of one voice channel — feeds the sidebar rows under each channel. */
  channelVoiceParticipants(
    channelId: Accessor<string>,
  ): Accessor<VoiceSidebarParticipant[]> {
    return createMemo(
      () =>
        selectChannelParticipants(this.state, channelId()) ?? NO_PARTICIPANTS,
    );
  }
}
