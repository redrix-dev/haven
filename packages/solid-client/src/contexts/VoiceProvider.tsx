import {
  createContext,
  createEffect,
  onCleanup,
  useContext,
  type JSX,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
} from "livekit-client";
import type {
  VoiceControllerChannel,
  VoiceParticipant,
} from "@shared/features/voice/types";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { requireHavenSolidCore } from "../core";
import { useSession } from "./SessionProvider";
import { openVoiceSyncChannel, type VoiceMirrorState } from "./voiceSync";
import { playVoiceJoinSound, playVoiceLeaveSound } from "../audio/sounds";

/**
 * The voice session controller — Solid port of mobile's
 * useMobileLiveKitVoiceSession, minus the RN audio-session/foreground-service
 * machinery, plus web audio element management. Lives in a context (not a
 * feature) because the session must outlive route changes: you stay connected
 * while browsing channels.
 *
 * Division of labor: VoiceSolidNexus owns Supabase presence/kick channels and
 * the shared session state; this provider owns the LiveKit Room and the
 * UI-facing state/actions. Mirrors mobile's split (VoiceNexus / LiveKit hook).
 *
 * Cross-window: the joined window broadcasts mirror state and executes
 * commands over the voiceSync BroadcastChannel (see voiceSync.ts for the
 * decision record). The popout never joins LiveKit itself.
 */

export type VoiceUiState = {
  activeChannel: VoiceControllerChannel | null;
  joined: boolean;
  joining: boolean;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  error: string | null;
  notice: string | null;
  inputDevices: { deviceId: string; label: string }[];
  selectedInputDeviceId: string;
  outputDevices: { deviceId: string; label: string }[];
  selectedOutputDeviceId: string;
  supportsOutputSelection: boolean;
  /** Browser blocked autoplay — a user gesture must call enableAudioPlayback. */
  audioPlaybackBlocked: boolean;
  memberVolumes: Record<string, number>;
};

type VoiceContextValue = {
  voice: VoiceUiState;
  joinChannel: (channel: VoiceControllerChannel) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  switchInputDevice: (deviceId: string) => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  enableAudioPlayback: () => Promise<void>;
  setMemberVolume: (memberId: string, volume: number) => void;
};

const VoiceContext = createContext<VoiceContextValue>();

const initialState = (): VoiceUiState => ({
  activeChannel: null,
  joined: false,
  joining: false,
  participants: [],
  isMuted: false,
  isDeafened: false,
  error: null,
  notice: null,
  inputDevices: [],
  selectedInputDeviceId: "default",
  outputDevices: [],
  selectedOutputDeviceId: "default",
  supportsOutputSelection:
    typeof HTMLMediaElement !== "undefined" &&
    "setSinkId" in HTMLMediaElement.prototype,
  audioPlaybackBlocked: false,
  memberVolumes: {},
});

function tryParseAvatarUrl(metadata: string | undefined): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (typeof parsed !== "object" || parsed == null) return null;
    const value = (parsed as Record<string, unknown>).avatarUrl;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export function VoiceProvider(props: { children: JSX.Element }) {
  const core = requireHavenSolidCore();
  const { session } = useSession();
  const userId = () => session()?.user.id ?? null;
  const viewerProfile = core.profiles.viewerProfile(userId);

  const [voice, setVoice] = createStore<VoiceUiState>(initialState());

  let room: Room | null = null;
  let joinGeneration = 0;
  let intentionalDisconnect = false;
  // Remote audio tracks must be attached to DOM elements to be audible.
  const audioElements = new Map<string, HTMLMediaElement>();
  const audioContainer = document.createElement("div");
  audioContainer.style.display = "none";
  document.body.appendChild(audioContainer);
  onCleanup(() => audioContainer.remove());

  const createRoom = (): Room => {
    const next = new Room({
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });

    const syncParticipants = () => applyParticipants(next);

    next
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        core.voice.setVoiceConnected(state === ConnectionState.Connected);
        if (state === ConnectionState.Connected) core.voice.markConnected();
      })
      .on(RoomEvent.Disconnected, () => {
        core.voice.setVoiceConnected(false);
        if (!intentionalDisconnect) {
          core.voice.setJoined(false);
          setVoice({ joined: false, notice: "Voice disconnected." });
        }
      })
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        audioElements.set(track.sid ?? String(audioElements.size), element);
        audioContainer.appendChild(element);
        syncParticipants();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          for (const element of track.detach()) element.remove();
          if (track.sid) audioElements.delete(track.sid);
        }
        syncParticipants();
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setVoice("audioPlaybackBlocked", !next.canPlaybackAudio);
      })
      .on(RoomEvent.ParticipantConnected, () => {
        playVoiceJoinSound();
        syncParticipants();
      })
      .on(RoomEvent.ParticipantDisconnected, () => {
        playVoiceLeaveSound();
        applyRemoteVolumes(voice.isDeafened);
        syncParticipants();
      })
      .on(RoomEvent.TrackMuted, syncParticipants)
      .on(RoomEvent.TrackUnmuted, syncParticipants)
      .on(RoomEvent.ActiveSpeakersChanged, syncParticipants)
      .on(RoomEvent.ParticipantMetadataChanged, syncParticipants)
      .on(RoomEvent.ParticipantNameChanged, syncParticipants);

    return next;
  };

  const buildParticipants = (fromRoom: Room): VoiceParticipant[] => {
    const activeSpeakerIds = new Set(
      fromRoom.activeSpeakers.map((p) => p.identity),
    );
    return Array.from(fromRoom.remoteParticipants.values()).map(
      (participant: RemoteParticipant) => {
        const micPublication = participant.getTrackPublication(
          Track.Source.Microphone,
        );
        return {
          userId: participant.identity,
          displayName: participant.name || participant.identity,
          avatarUrl: tryParseAvatarUrl(participant.metadata),
          isSpeaking: activeSpeakerIds.has(participant.identity),
          muted: !micPublication || micPublication.isMuted,
          deafened: false,
        };
      },
    );
  };

  const applyParticipants = (fromRoom: Room) => {
    const next = buildParticipants(fromRoom);
    setVoice("participants", reconcile(next));
    core.voice.setParticipants(
      next.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl ?? null,
        isSpeaking: p.isSpeaking ?? false,
      })),
    );
  };

  const applyRemoteVolumes = (deafened: boolean) => {
    room?.remoteParticipants.forEach((participant) => {
      participant.setVolume(
        deafened
          ? 0
          : Math.min(
              1,
              (voice.memberVolumes[participant.identity] ?? 100) / 100,
            ),
        Track.Source.Microphone,
      );
    });
  };

  const refreshInputDevices = async () => {
    try {
      const devices = await Room.getLocalDevices("audioinput");
      setVoice(
        "inputDevices",
        devices.map((d) => ({
          deviceId: d.deviceId,
          label: d.label || "Microphone",
        })),
      );
      const outputs = await Room.getLocalDevices("audiooutput");
      setVoice(
        "outputDevices",
        outputs.map((d) => ({
          deviceId: d.deviceId,
          label: d.label || "Speaker",
        })),
      );
    } catch {
      // Device enumeration is best-effort (permissions may be pending).
    }
  };

  const cleanup = async () => {
    joinGeneration += 1;
    intentionalDisconnect = true;
    // Clearing activeChannel re-fires the sidebar's presence effect, which
    // re-subscribes to THIS channel's topic. If our own presence-publish channel
    // for that topic is still open, Supabase rejects the re-`.on("presence")`.
    // So clear everything except activeChannel now, release the topic below, then
    // clear activeChannel last.
    setVoice({
      joined: false,
      joining: false,
      participants: [],
      error: null,
      notice: null,
    });
    core.voice.setParticipants([]);
    core.voice.setVoiceConnected(false);
    core.voice.setJoined(false);
    core.voice.setSessionState({
      joined: false,
      isMuted: core.voice.getSnapshot().isMuted,
      isDeafened: core.voice.getSnapshot().isDeafened,
    });
    core.voice.completeDisconnect();
    try {
      await core.voice.disconnectPresenceChannel();
    } catch {
      // Supabase also drops presence on socket close.
    }
    // Topic released — now it's safe to clear activeChannel and let the sidebar
    // re-subscribe to this channel's presence on a fresh channel.
    setVoice({ activeChannel: null });
    try {
      await core.voice.disconnectKickChannel();
    } catch {
      // Best-effort cleanup.
    }
    // room.disconnect() tears down the connection but leaves the local mic
    // track running in the browser (readyState stays "live"), so the mic stays
    // engaged after leaving. Stop the local tracks explicitly to release it.
    room?.localParticipant.trackPublications.forEach((pub) =>
      pub.track?.stop(),
    );
    try {
      await room?.disconnect();
    } catch {
      // Ignore disconnect races.
    }
    for (const element of audioElements.values()) element.remove();
    audioElements.clear();
    intentionalDisconnect = false;
  };

  const joinChannel = async (channel: VoiceControllerChannel) => {
    const uid = userId();
    if (!uid || voice.joining) return;
    if (voice.joined && voice.activeChannel?.channelId === channel.channelId) {
      return;
    }
    // Switching: tear the current session down first, then join the target.
    if (voice.joined) await cleanup();

    setVoice({
      joining: true,
      error: null,
      notice: null,
      activeChannel: channel,
    });
    core.voice.startConnect({
      id: channel.channelId,
      name: channel.channelName,
      community_id: channel.communityId,
    });
    intentionalDisconnect = false;
    const generation = (joinGeneration += 1);

    try {
      const credentialsPromise = core.voice.fetchJoinCredentials(
        channel.communityId,
        channel.channelId,
      );
      void credentialsPromise.catch(() => {});

      if (!room) room = createRoom();
      const { token, serverUrl } = await credentialsPromise;
      if (generation !== joinGeneration) return;

      await room.connect(serverUrl, token, { autoSubscribe: true });
      if (generation !== joinGeneration) return;

      // On macOS, WKWebView only exposes navigator.mediaDevices when the app is
      // signed with the audio-input entitlement. Guard here so the catch block
      // below surfaces a legible message instead of "undefined is not an object".
      if (!navigator.mediaDevices) {
        throw new Error(
          "Microphone access is unavailable. On macOS, please check System Settings → Privacy & Security → Microphone and ensure Haven is allowed.",
        );
      }

      const profile = viewerProfile();
      void room.localParticipant
        .setMetadata(JSON.stringify({ avatarUrl: profile?.avatarUrl ?? null }))
        .catch(() => {});
      await room.localParticipant.setMicrophoneEnabled(!voice.isMuted);

      core.voice.setJoined(true);
      core.voice.markConnected();
      core.voice.setSessionState({
        joined: true,
        isMuted: voice.isMuted,
        isDeafened: voice.isDeafened,
      });
      setVoice({ joined: true });
      playVoiceJoinSound();
      applyParticipants(room);
      applyRemoteVolumes(voice.isDeafened);
      void refreshInputDevices();

      void core.voice
        .connectPresenceChannel({
          communityId: channel.communityId,
          channelId: channel.channelId,
          currentUserId: uid,
          displayName: profile?.username ?? "Member",
          avatarUrl: profile?.avatarUrl ?? null,
        })
        .catch((presenceError) => {
          console.warn("[voice] presence publish failed", presenceError);
        });

      void core.voice
        .connectKickChannel({
          communityId: channel.communityId,
          channelId: channel.channelId,
          currentUserId: uid,
          onKick: () => {
            void cleanup().then(() => {
              setVoice({ notice: "You were removed from the voice channel." });
            });
          },
        })
        .catch((kickError) => {
          console.warn("[voice] kick channel failed", kickError);
        });
    } catch (joinError) {
      const message = getErrorMessage(joinError, "Failed to join voice.");
      core.voice.setError(message);
      await cleanup();
      // cleanup() clears activeChannel (which unmounts the dock) — restore it
      // so the dock stays up to SHOW the error; Disconnect dismisses it.
      setVoice({ error: message, activeChannel: channel });
    } finally {
      setVoice({ joining: false });
    }
  };

  const leave = async () => {
    playVoiceLeaveSound();
    await cleanup();
  };

  const toggleMute = () => {
    const next = !voice.isMuted;
    setVoice({ isMuted: next });
    core.voice.setIsMuted(next);
    void room?.localParticipant.setMicrophoneEnabled(!next).catch(() => {});
  };

  const toggleDeafen = () => {
    const next = !voice.isDeafened;
    // Deafening also mutes (mirrors mobile's VoiceNexus.setDeafened).
    setVoice({ isDeafened: next, isMuted: next ? true : voice.isMuted });
    core.voice.setIsDeafened(next);
    applyRemoteVolumes(next);
    if (next)
      void room?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
  };

  const setMemberVolume = (userId: string, volume: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    setVoice("memberVolumes", userId, clamped);
    applyRemoteVolumes(voice.isDeafened);
  };

  const switchInputDevice = async (deviceId: string) => {
    setVoice({ selectedInputDeviceId: deviceId });
    await room?.switchActiveDevice("audioinput", deviceId).catch(() => {});
  };

  const setOutputDevice = async (deviceId: string) => {
    setVoice({ selectedOutputDeviceId: deviceId });
    await room?.switchActiveDevice("audiooutput", deviceId).catch(() => {});
  };

  const enableAudioPlayback = async () => {
    try {
      await room?.startAudio();
      setVoice("audioPlaybackBlocked", false);
    } catch {
      // Still blocked; the banner stays up.
    }
  };

  // ── cross-window sync (owning side) ────────────────────────────────────────
  const sync = openVoiceSyncChannel();
  onCleanup(() => sync.close());

  // Everything here must be PLAIN objects — postMessage structured-clones the
  // payload, and Solid store proxies are not cloneable (DataCloneError, which
  // would unwind out of the setVoice that triggered this effect).
  const mirrorState = (): VoiceMirrorState => ({
    activeChannel: voice.activeChannel
      ? {
          communityId: voice.activeChannel.communityId,
          channelId: voice.activeChannel.channelId,
          channelName: voice.activeChannel.channelName,
        }
      : null,
    joined: voice.joined,
    joining: voice.joining,
    isMuted: voice.isMuted,
    isDeafened: voice.isDeafened,
    participants: voice.participants.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl ?? null,
      isSpeaking: p.isSpeaking ?? false,
      muted: p.muted,
      deafened: p.deafened,
    })),
    selfDisplayName: viewerProfile()?.username ?? "You",
    selfAvatarUrl: viewerProfile()?.avatarUrl ?? null,
    error: voice.error,
    notice: voice.notice,
  });

  const broadcast = (state: VoiceMirrorState) => {
    try {
      sync.postMessage({ kind: "state", state });
    } catch (postError) {
      // The mirror is best-effort; never let it break the session.
      console.warn("[voice] mirror broadcast failed", postError);
    }
  };

  let wasActive = false;
  createEffect(() => {
    // Reading mirrorState() tracks every field it touches; any change
    // re-broadcasts. The final not-active broadcast (wasActive) tells
    // mirrors the session ended.
    const state = mirrorState();
    const active = state.joined || state.joining;
    if (active || wasActive) broadcast(state);
    wasActive = active;
  });

  sync.onmessage = (event: MessageEvent) => {
    const message = event.data as
      | { kind: "hello" }
      | { kind: "command"; command: string }
      | { kind: "state" };
    if (message.kind === "hello") {
      // Only the session owner answers — an idle provider (another browser
      // tab) replying joined:false would clobber the owner's reply in the
      // mirror. Silence here is the answer "not me".
      if (voice.joined || voice.joining) broadcast(mirrorState());
      return;
    }
    if (message.kind !== "command") return;
    // Only the window that owns the connection executes commands.
    if (!voice.joined) return;
    if (message.command === "toggleMute") toggleMute();
    else if (message.command === "toggleDeafen") toggleDeafen();
    else if (message.command === "leave") void leave();
  };

  // Sign-out must leave voice: the provider outlives the authed screens, and
  // nothing else ties the LiveKit room to the session — without this, the mic
  // keeps transmitting after sign-out.
  createEffect(() => {
    if (userId() !== null) return;
    if (voice.joined || voice.joining || voice.activeChannel) {
      void cleanup();
    }
  });

  onCleanup(() => {
    void cleanup();
  });

  const value: VoiceContextValue = {
    voice,
    joinChannel,
    leave,
    toggleMute,
    toggleDeafen,
    switchInputDevice,
    setOutputDevice,
    enableAudioPlayback,
    setMemberVolume,
  };
  if (import.meta.env.DEV)
    (window as Window & { __voice?: unknown }).__voice = value;
  return (
    <VoiceContext.Provider value={value}>
      {props.children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within <VoiceProvider>");
  return ctx;
}
