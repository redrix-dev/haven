/**
 * Request status: whether a load is running, how it last ended, and when.
 *
 * A collection keeps the status of its loads under `requests` in its own
 * state, by key ("channel:<id>", "list"), so a screen reads the status of
 * the load it asked for and nothing else. The records themselves never carry
 * loading flags.
 *
 * Loads never reject. A failed load is a status with its `HavenError`; a
 * screen shows it from there. (Commands, like sending a message, are not
 * loads: they throw, and the screen that ran them handles it.)
 */

import { HavenError, isHavenError } from "@shared/lib/backend/havenError";
import { createLoadGate, isFresh } from "./loadGate";
import type { StatePort } from "./statePort";

export type RequestStatus = {
  readonly running: boolean;
  /** How the last finished load ended. Kept while a new one runs. */
  readonly error: HavenError | null;
  /** When the last load finished, successful or not. 0 means never. */
  readonly finishedAt: number;
};

export type RequestMap = Readonly<Record<string, RequestStatus>>;

/** The part of a collection's state that request status lives in. */
export type WithRequests = { requests: RequestMap };

export const NOT_REQUESTED: RequestStatus = Object.freeze({
  running: false,
  error: null,
  finishedAt: 0,
});

/**
 * The last load for `key` succeeded: what the store holds for it is the
 * database's answer, not a device copy or nothing. A screen waits for this
 * before treating "not there" as gone.
 */
export const answered = (requests: RequestMap, key: string): boolean => {
  const status = requests[key];
  return !!status && status.finishedAt > 0 && status.error === null;
};

/** Anything a load throws, as a HavenError. A HavenError comes back as it is. */
export function asHavenError(error: unknown): HavenError {
  if (isHavenError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new HavenError("unavailable", "unexpected", message, error);
}

export class Requests {
  private readonly gate = createLoadGate();

  /** `name` is the collection's, so a trace says whose load it was. */
  constructor(
    private readonly name: string,
    private readonly port: StatePort<WithRequests>,
    private readonly now: () => number = Date.now,
  ) {}

  status(key: string): RequestStatus {
    return this.port.get().requests[key] ?? NOT_REQUESTED;
  }

  /** True when the last load for `key` succeeded within `maxAgeMs`. */
  isFresh(key: string, maxAgeMs: number): boolean {
    const status = this.status(key);
    return (
      status.error === null && isFresh(status.finishedAt, maxAgeMs, this.now())
    );
  }

  /**
   * Runs `task` as the load for `key`, or joins the one already running.
   * The task checks `stale()` after each `await` and writes nothing once it
   * is true: the key was forgotten, or the session ended, while it waited.
   */
  run(
    key: string,
    task: (stale: () => boolean) => Promise<void>,
  ): Promise<void> {
    return this.gate.run(`${this.name}:${key}`, async (stale) => {
      this.write(key, { ...this.status(key), running: true });
      let error: HavenError | null = null;
      try {
        await task(stale);
      } catch (thrown) {
        error = asHavenError(thrown);
        if (error.kind === "unavailable") {
          console.error(`[${this.name}] load ${key} failed`, thrown);
        }
      }
      if (stale()) return;
      this.write(key, { running: false, error, finishedAt: this.now() });
    });
  }

  /**
   * Like `run`, but never joins: a load already running for `key` started
   * before whatever just changed, so its answer may be the old one. That load
   * writes nothing, and a new one runs. Use it after a write, and for an
   * event that says "this changed, load it again".
   */
  refresh(
    key: string,
    task: (stale: () => boolean) => Promise<void>,
  ): Promise<void> {
    this.gate.forget(`${this.name}:${key}`);
    return this.run(key, task);
  }

  /** Drops the status for `key`; a load still running for it writes nothing. */
  forget(key: string): void {
    this.gate.forget(`${this.name}:${key}`);
    const { [key]: _dropped, ...rest } = this.port.get().requests;
    this.port.set({ requests: rest });
  }

  /** Session end: every load forgotten, every status gone. */
  clear(): void {
    this.gate.clear();
    this.port.set({ requests: {} });
  }

  private write(key: string, status: RequestStatus): void {
    this.port.set({
      requests: { ...this.port.get().requests, [key]: status },
    });
  }
}
