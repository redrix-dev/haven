import { loadMobileLivekitSdk } from "@test-support/mobileLivekitSdk.mjs";
import { afterEach, describe, expect, it, vi } from "vitest";

type Signal = {
  attemptId: number;
  lifecycleState: string;
  pingTimeoutDuration: number;
  log: {
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  };
  onClose?: (reason: string) => void;
  sendLeave: () => Promise<void>;
  sendLifecycleInput: (input: { type: string; attemptId?: number }) => boolean;
  startReadingLoop: (
    reader: ReadableStreamDefaultReader<string | ArrayBuffer>,
  ) => Promise<void>;
  close: () => Promise<void>;
  resetPingTimeout: () => void;
  handleOnClose: (reason: string) => Promise<void>;
};
type TestRoom = {
  state: string;
  engine: {
    client: Signal;
    _isClosed: boolean;
    cleanupPeerConnections: () => Promise<void>;
  };
  disconnect: () => Promise<void>;
};
type SDK = { Room: new () => TestRoom };

const modules: Array<[string, () => Promise<SDK>]> = [
  [
    "UMD (Metro require)",
    async () => (await loadMobileLivekitSdk("umd")) as SDK,
  ],
  ["ESM", async () => (await loadMobileLivekitSdk("esm")) as SDK],
];

function connect(room: TestRoom) {
  const client = room.engine.client;
  expect(client.sendLifecycleInput({ type: "connect" })).toBe(true);
  expect(
    client.sendLifecycleInput({
      type: "connectComplete",
      attemptId: client.attemptId,
    }),
  ).toBe(true);
  return client;
}

afterEach(() => vi.restoreAllMocks());

for (const [name, load] of modules) {
  describe(`LiveKit signal teardown — ${name}`, () => {
    it("closes signalling before waiting for native peer cleanup", async () => {
      const sdk = await load();
      const room = new sdk.Room();
      const client = connect(room);
      room.state = "connected";
      room.engine._isClosed = false;
      vi.spyOn(client, "sendLeave").mockResolvedValue(undefined);
      const errorLog = vi
        .spyOn(client.log, "error")
        .mockImplementation(() => {});
      let finishPeers!: () => void;
      const peers = new Promise<void>((resolve) => {
        finishPeers = resolve;
      });
      const cleanup = vi
        .spyOn(room.engine, "cleanupPeerConnections")
        .mockReturnValue(peers);
      let failRead!: (reason: unknown) => void;
      const stream = new ReadableStream<string | ArrayBuffer>({
        start(controller) {
          failRead = (reason) => controller.error(reason);
        },
      });
      const reading = client.startReadingLoop(stream.getReader());
      const leaving = room.disconnect();
      try {
        await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
        failRead(new Error("WS closed unexpectedly with code 1001"));
        await reading;
        expect(errorLog).not.toHaveBeenCalled();
        expect(client.lifecycleState).toBe("closed");
      } finally {
        finishPeers();
        await leaving;
      }
      // The same signal client can own a fresh attempt after teardown.
      expect(client.sendLifecycleInput({ type: "connect" })).toBe(true);
      expect(
        client.sendLifecycleInput({
          type: "connectComplete",
          attemptId: client.attemptId,
        }),
      ).toBe(true);
      await client.close();
    });

    it("still reports a real active-session read failure", async () => {
      const sdk = await load();
      const client = connect(new sdk.Room());
      const onClose = vi.fn();
      client.onClose = onClose;
      const errorLog = vi
        .spyOn(client.log, "error")
        .mockImplementation(() => {});
      const error = new Error("WS closed unexpectedly with code 1001");
      const stream = new ReadableStream<string | ArrayBuffer>({
        start(controller) {
          controller.error(error);
        },
      });
      await client.startReadingLoop(stream.getReader());
      expect(errorLog).toHaveBeenCalledWith(
        "error reading from signal stream",
        { error },
      );
      expect(onClose).toHaveBeenCalledExactlyOnceWith("error in reading loop");
      await client.close();
    });

    it("preserves an abnormal read error when the socket-close callback wins the race", async () => {
      const sdk = await load();
      const client = connect(new sdk.Room());
      const onClose = vi.fn();
      client.onClose = onClose;
      await client.handleOnClose("unexpected socket close");
      expect(client.lifecycleState).toBe("offline");
      const errorLog = vi
        .spyOn(client.log, "error")
        .mockImplementation(() => {});
      const error = new Error("WS closed unexpectedly with code 1006");
      const stream = new ReadableStream<string | ArrayBuffer>({
        start(controller) {
          controller.error(error);
        },
      });
      await client.startReadingLoop(stream.getReader());
      expect(errorLog).toHaveBeenCalledWith(
        "error reading from signal stream",
        { error },
      );
      expect(onClose).toHaveBeenCalledExactlyOnceWith(
        "unexpected socket close",
      );
      await client.close();
    });

    it("does not let an old reader report a failure against a rejoined session", async () => {
      const sdk = await load();
      const room = new sdk.Room();
      const client = connect(room);
      let failRead!: (error: unknown) => void;
      const stream = new ReadableStream<string | ArrayBuffer>({
        start(controller) {
          failRead = (error) => controller.error(error);
        },
      });
      const reading = client.startReadingLoop(stream.getReader());
      await client.close();
      connect(room);
      const onClose = vi.fn();
      client.onClose = onClose;
      const errorLog = vi
        .spyOn(client.log, "error")
        .mockImplementation(() => {});
      failRead(new Error("old socket failed"));
      await reading;
      expect(errorLog).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(client.lifecycleState).toBe("connected");
      await client.close();
    });

    it("does not re-arm a ping timeout after close", async () => {
      const sdk = await load();
      const client = connect(new sdk.Room());
      await client.close();
      const warn = vi.spyOn(client.log, "warn").mockImplementation(() => {});
      client.pingTimeoutDuration = 0.01;
      client.resetPingTimeout();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(warn).not.toHaveBeenCalled();
    });
  });
}
