/**
 * Copies kept on the device, so the first screen after a launch is not
 * empty. Opt-in: only what a collection declares is kept, and it should be
 * small. docs/architecture/COLLECTIONS.md, "Saving to the device", says what
 * is kept and what never is.
 *
 *   - Each copy has a name and a version. A copy saved under another version
 *     is thrown away, never migrated: the network fills the gap.
 *   - The key carries the person's id, so one account never reads another's,
 *     and `close()` (sign-out) removes that person's copies.
 *   - A change only marks a copy as changed. It is written a moment later
 *     (`schedule`), or at once by `flush()`, which hosts call when the app
 *     goes to the background. Many changes cost one write, and a copy whose
 *     text did not change is not written at all.
 */

import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import { perfTrace } from "@shared/debug/perfTrace";
import type { StatePort } from "./statePort";

export type DeviceCopy<S, Saved> = {
  /** Short and stable: part of the key, and how traces name it. */
  readonly name: string;
  /** Raise it whenever `Saved` changes shape. Older copies are dropped. */
  readonly version: number;
  /** What to keep, from the current state. */
  pick(state: S): Saved;
  /** Puts a kept copy back. A throw drops the copy. */
  restore(saved: Saved): Partial<S>;
};

/** Runs `write` later; returns a function that calls it off. */
export type WriteScheduler = (write: () => void) => () => void;

export const writeSoon =
  (delayMs = 1_000): WriteScheduler =>
  (write) => {
    const timer = setTimeout(write, delayMs);
    return () => clearTimeout(timer);
  };

export const deviceKey = (userId: string, name: string, version: number) =>
  `haven:${userId}:${name}:v${version}`;

type Tracked = {
  copy: DeviceCopy<unknown, unknown>;
  port: StatePort<object>;
  /** The text last read or written, so an unchanged copy is not rewritten. */
  written: string | null;
};

export class DeviceCopies {
  private userId: string | null = null;
  private readonly tracked = new Map<string, Tracked>();
  private readonly changed = new Set<string>();
  private callOff: (() => void) | null = null;

  constructor(
    private readonly storage: NexusPersistence,
    private readonly schedule: WriteScheduler = writeSoon(),
  ) {}

  /**
   * Keeps a copy of the state behind `port`. Returns the port the collection
   * should write through: the same one, but each write marks the copy
   * changed.
   */
  track<S extends object, Saved>(
    copy: DeviceCopy<S, Saved>,
    port: StatePort<S>,
  ): StatePort<S> {
    if (this.tracked.has(copy.name)) {
      throw new Error(`device copy "${copy.name}" is tracked twice`);
    }
    this.tracked.set(copy.name, {
      copy: copy as DeviceCopy<unknown, unknown>,
      port: port as StatePort<object>,
      written: null,
    });
    return {
      get: () => port.get(),
      set: (partial) => {
        port.set(partial);
        this.markChanged(copy.name);
      },
    };
  }

  /** Sign-in: puts back each copy kept for this person. */
  open(userId: string): void {
    if (this.userId !== null && this.userId !== userId) this.close();
    this.userId = userId;
    for (const entry of this.tracked.values()) this.restore(userId, entry);
  }

  /** Writes every changed copy now. */
  flush(): void {
    this.callOff?.();
    this.callOff = null;
    const userId = this.userId;
    if (userId === null) return;
    for (const name of this.changed) {
      const entry = this.tracked.get(name);
      if (entry) this.write(userId, entry);
    }
    this.changed.clear();
  }

  /** Sign-out: nothing more is written, and this person's copies are removed. */
  close(): void {
    this.callOff?.();
    this.callOff = null;
    this.changed.clear();
    const userId = this.userId;
    this.userId = null;
    if (userId === null) return;
    for (const entry of this.tracked.values()) {
      this.storage.remove(
        deviceKey(userId, entry.copy.name, entry.copy.version),
      );
      entry.written = null;
    }
  }

  private markChanged(name: string): void {
    if (this.userId === null) return;
    this.changed.add(name);
    this.callOff ??= this.schedule(() => {
      this.callOff = null;
      this.flush();
    });
  }

  private restore(userId: string, entry: Tracked): void {
    const { copy } = entry;
    for (let older = 1; older < copy.version; older += 1) {
      this.storage.remove(deviceKey(userId, copy.name, older));
    }
    const key = deviceKey(userId, copy.name, copy.version);
    const started = perfTrace.now();
    const text = this.storage.getString(key);
    perfTrace.noteRead(
      copy.name,
      text?.length ?? 0,
      perfTrace.now() - started,
      perfTrace.now(),
    );
    if (text === null) return;
    try {
      entry.port.set(copy.restore(JSON.parse(text)) as object);
      entry.written = text;
    } catch (error) {
      console.warn(`[device] dropped the "${copy.name}" copy`, error);
      this.storage.remove(key);
    }
  }

  private write(userId: string, entry: Tracked): void {
    const { copy } = entry;
    const started = perfTrace.now();
    const text = JSON.stringify(copy.pick(entry.port.get()));
    const stringified = perfTrace.now();
    if (text === entry.written) return;
    perfTrace.noteStringify(
      copy.name,
      text.length,
      stringified - started,
      stringified,
    );
    try {
      this.storage.set(deviceKey(userId, copy.name, copy.version), text);
      entry.written = text;
    } catch (error) {
      console.warn(`[device] could not keep the "${copy.name}" copy`, error);
    }
    const ended = perfTrace.now();
    perfTrace.noteWrite(copy.name, text.length, ended - stringified, ended);
  }
}
