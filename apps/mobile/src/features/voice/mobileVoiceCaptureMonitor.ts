import { NativeEventEmitter, NativeModules, Platform } from "react-native";

/**
 * The @livekit/react-native native module, by its registered name. The
 * addListener/removeListeners pair is the RCTEventEmitter contract the
 * NativeEventEmitter constructor notifies on listener-count changes.
 */
type LiveKitCaptureNativeModule = {
  createVolumeProcessor: (pcId: number, trackId: string) => string;
  deleteVolumeProcessor: (
    reactTag: string,
    pcId: number,
    trackId: string,
  ) => void;
  addListener: (eventType: string) => void;
  removeListeners: (count: number) => void;
};

const nativeModule = (
  NativeModules as {
    LivekitReactNativeModule?: LiveKitCaptureNativeModule;
  }
).LivekitReactNativeModule;

/** Local microphone track shape the native volume processor attaches to. */
export type NativeCaptureTrack = {
  id: string;
  /** Fork-internal sender id; local capture tracks use -1. */
  _peerConnectionId?: number;
};

type VolumeProcessedEvent = {
  volume?: unknown;
  id?: unknown;
};

/**
 * Subscribe to the native capture-level monitor for a local mic track.
 *
 * The renderer measures the microphone before RTP, so readings keep arriving
 * while the transmission gate has the sender's encoding deactivated — the
 * state where iOS sender stats report no capture level at all. Every reading
 * calls `onLevel`, including silence (0): the LiveKit `useTrackVolume` hook
 * drops zero readings, so it cannot be used where freshness matters.
 *
 * Returns a stop function, or null when this platform has no monitor.
 */
export function monitorNativeCaptureLevel(
  track: NativeCaptureTrack,
  onLevel: (level: number) => void,
): (() => void) | null {
  if (Platform.OS !== "ios" || !nativeModule) return null;
  const peerConnectionId =
    typeof track._peerConnectionId === "number" ? track._peerConnectionId : -1;
  const reactTag = nativeModule.createVolumeProcessor(
    peerConnectionId,
    track.id,
  );
  const emitter = new NativeEventEmitter(nativeModule);
  const subscription = emitter.addListener(
    "LK_VOLUME_PROCESSED",
    (event: VolumeProcessedEvent) => {
      if (event?.id !== reactTag) return;
      const volume =
        typeof event.volume === "number" && Number.isFinite(event.volume)
          ? event.volume
          : 0;
      onLevel(Math.max(0, Math.min(1, volume)));
    },
  );
  return () => {
    subscription.remove();
    nativeModule.deleteVolumeProcessor(reactTag, peerConnectionId, track.id);
  };
}
