import type { VoiceRealtimeTransport } from "@shared/features/voice/types";
import type { VoiceTokenBackend } from "@shared/lib/backend/voiceTokenBackend";
import type { ReadableStore } from "@shared/nexus/storeTypes";
import {
  VoiceNexus,
  createInitialVoiceState,
} from "@shared/nexus/voice/voiceNexus";
import type { VoiceState } from "@shared/nexus/voice/voiceTypes";
import { createZustandStatePort } from "../kit/zustandStatePort";

/** React read binding over the shared VoiceNexus: the store the hooks read. */
export class VoiceReactNexus extends VoiceNexus {
  readonly reactiveStore: ReadableStore<VoiceState>;

  constructor(
    tokenBackend?: VoiceTokenBackend,
    realtime?: VoiceRealtimeTransport,
  ) {
    const port = createZustandStatePort(createInitialVoiceState());
    super(port, tokenBackend ?? null, realtime ?? null);
    this.reactiveStore = port.store;
  }
}
