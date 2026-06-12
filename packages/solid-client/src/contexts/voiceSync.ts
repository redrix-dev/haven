import type {
  VoiceControllerChannel,
  VoiceParticipant,
} from "@shared/features/voice/types";

/**
 * Cross-window voice sync protocol (main window ⇄ voice popout).
 *
 * Decision record (also in docs/architecture/SOLID_CLIENT_SHAPE.md): the
 * window that owns the LiveKit connection (the one that joined) is the single
 * source of truth. A popout is a MIRROR + REMOTE CONTROL — it renders state
 * broadcast by the owning window and sends commands back; it never opens its
 * own LiveKit connection (two connections = double audio). Transport is
 * BroadcastChannel, which works identically across browser tabs and Tauri
 * webviews (same origin), so the protocol is shell-agnostic and needs no
 * bridge capability.
 */

export const VOICE_SYNC_CHANNEL_NAME = "haven:voice:sync";

export type VoiceMirrorState = {
  activeChannel: VoiceControllerChannel | null;
  joined: boolean;
  joining: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  participants: VoiceParticipant[];
  selfDisplayName: string;
  error: string | null;
  notice: string | null;
};

export type VoiceSyncMessage =
  | { kind: "state"; state: VoiceMirrorState }
  /** A new mirror asks the owning window to re-broadcast current state. */
  | { kind: "hello" }
  | { kind: "command"; command: "toggleMute" | "toggleDeafen" | "leave" };

export function openVoiceSyncChannel(): BroadcastChannel {
  return new BroadcastChannel(VOICE_SYNC_CHANNEL_NAME);
}
