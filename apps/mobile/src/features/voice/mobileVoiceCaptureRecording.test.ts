import { describe, expect, it, vi } from "vitest";
import { CaptureRecordingController } from "./mobileVoiceCaptureRecording";

describe("CaptureRecordingController", () => {
  it("serializes mute/rejoin behind a pending start and deduplicates requests", async () => {
    const calls: string[] = [];
    let finishStart!: () => void;
    const startPending = new Promise<void>((resolve) => {
      finishStart = resolve;
    });
    const controller = new CaptureRecordingController({
      start: async () => {
        calls.push("start");
        await startPending;
      },
      setPrepared: async (enabled) => {
        calls.push(`prepared:${enabled}`);
      },
      stop: async () => {
        calls.push("stop");
      },
      isRecording: () => true,
    });
    const first = controller.setEnabled(true);
    expect(controller.setEnabled(true)).toBe(first);
    const mute = controller.setEnabled(false);
    const rejoin = controller.setEnabled(true);
    await vi.waitFor(() => expect(calls).toEqual(["start"]));
    finishStart();
    await Promise.all([first, mute, rejoin]);
    expect(calls).toEqual([
      "start",
      "prepared:true",
      "prepared:false",
      "stop",
      "start",
      "prepared:true",
    ]);
  });

  it("allows a retry after native setup fails", async () => {
    const driver = {
      start: vi
        .fn()
        .mockRejectedValueOnce(new Error("native failure"))
        .mockResolvedValue(undefined),
      setPrepared: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      isRecording: () => true,
    };
    const controller = new CaptureRecordingController(driver);
    await expect(controller.setEnabled(true)).rejects.toThrow("native failure");
    await controller.setEnabled(true);
    expect(driver.start).toHaveBeenCalledTimes(2);
    expect(driver.setPrepared).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("attempts to stop recording even if clearing prepared mode fails", async () => {
    const stop = vi.fn(async () => {});
    const controller = new CaptureRecordingController({
      start: async () => {},
      setPrepared: async () => {
        throw new Error("clear failed");
      },
      stop,
      isRecording: () => true,
    });
    await expect(controller.setEnabled(false)).rejects.toThrow("clear failed");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("restarts a device stopped by RTP gating but never restarts after mute", async () => {
    let recording = false;
    const start = vi.fn(async () => {
      recording = true;
    });
    const controller = new CaptureRecordingController({
      start,
      isRecording: () => recording,
      setPrepared: async () => {},
      stop: async () => {
        recording = false;
      },
    });
    await controller.setEnabled(true);
    recording = false; // Last RTP stream closing stops the SDK's device.
    await controller.ensureRecording();
    expect(recording).toBe(true);
    expect(start).toHaveBeenCalledTimes(2);
    await controller.setEnabled(false);
    await controller.ensureRecording();
    expect(recording).toBe(false);
    expect(start).toHaveBeenCalledTimes(2);
  });
});
