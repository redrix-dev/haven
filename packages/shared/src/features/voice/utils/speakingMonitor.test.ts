import { afterEach, expect, it, vi } from "vitest";
import type { Room } from "livekit-client";
import { monitorSpeaking } from "./speakingMonitor";

afterEach(() => vi.useRealTimers());

it("lights self only for measured audio that is allowed to transmit", async () => {
  vi.useFakeTimers();
  let level = 0;
  let active = true;
  const capture = { enabled: true };
  const room = {
    localParticipant: {
      identity: "self",
      isSpeaking: false,
      getTrackPublication: () => ({
        isMuted: false,
        audioTrack: {
          mediaStreamTrack: capture,
          sender: {
            getParameters: () => ({ encodings: [{ active }] }),
            getStats: async () =>
              new Map([
                [
                  "capture",
                  { type: "media-source", kind: "audio", audioLevel: level },
                ],
              ]),
          },
        },
      }),
    },
    remoteParticipants: new Map(),
  } as unknown as Room;
  const updates: boolean[] = [];
  const stop = monitorSpeaking(room, (speaking) =>
    updates.push(speaking.get("self")!),
  );
  await vi.advanceTimersByTimeAsync(80);
  expect(updates).toEqual([false]);
  level = 0.6;
  await vi.advanceTimersByTimeAsync(80);
  expect(updates).toEqual([false, true]);
  active = false;
  await vi.advanceTimersByTimeAsync(80);
  expect(updates).toEqual([false, true, false]);
  active = true;
  await vi.advanceTimersByTimeAsync(80);
  expect(updates).toEqual([false, true, false, true]);
  capture.enabled = false;
  await vi.advanceTimersByTimeAsync(80);
  expect(updates).toEqual([false, true, false, true, false]);
  stop();
});

it("reacts to received audio without a server speaker event and settles between transitions", async () => {
  vi.useFakeTimers();
  let level = 0;
  const remote = {
    identity: "remote",
    isSpeaking: false,
    getTrackPublication: () => ({
      isMuted: false,
      audioTrack: {
        mediaStreamTrack: { enabled: true },
        receiver: {
          getStats: async () =>
            new Map([
              [
                "audio",
                { type: "inbound-rtp", kind: "audio", audioLevel: level },
              ],
            ]),
        },
      },
    }),
  };
  const room = {
    localParticipant: {
      identity: "self",
      getTrackPublication: () => undefined,
    },
    remoteParticipants: new Map([["remote", remote]]),
  } as unknown as Room;
  const updates: boolean[] = [];
  const stop = monitorSpeaking(room, (speaking) =>
    updates.push(speaking.get("remote")!),
  );
  await vi.advanceTimersByTimeAsync(80);
  expect(updates).toEqual([false]);
  level = 0.6;
  await vi.advanceTimersByTimeAsync(80);
  expect(updates).toEqual([false, true]);
  await vi.advanceTimersByTimeAsync(800);
  expect(updates).toEqual([false, true]);
  level = 0;
  await vi.advanceTimersByTimeAsync(240);
  expect(updates).toEqual([false, true, false]);
  stop();
  level = 1;
  await vi.advanceTimersByTimeAsync(800);
  expect(updates).toEqual([false, true, false]);
});

it("does not publish a late native stats result after teardown", async () => {
  vi.useFakeTimers();
  let resolve!: (stats: Map<string, unknown>) => void;
  const pending = new Promise<Map<string, unknown>>((done) => {
    resolve = done;
  });
  const room = {
    localParticipant: {
      identity: "self",
      getTrackPublication: () => undefined,
    },
    remoteParticipants: new Map([
      [
        "remote",
        {
          identity: "remote",
          isSpeaking: true,
          getTrackPublication: () => ({
            isMuted: false,
            audioTrack: {
              mediaStreamTrack: { enabled: true },
              receiver: { getStats: () => pending },
            },
          }),
        },
      ],
    ]),
  } as unknown as Room;
  const update = vi.fn();
  const stop = monitorSpeaking(room, update);
  await vi.advanceTimersByTimeAsync(800);
  stop();
  resolve(new Map());
  await vi.advanceTimersByTimeAsync(80);
  expect(update).not.toHaveBeenCalled();
});
