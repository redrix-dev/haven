import { create, useStore, type StoreApi, type UseBoundStore } from "zustand";
import type { MMKV } from "react-native-mmkv";

type NexusEntry<T> = {
  data: T;
  partial: boolean;
  cachedAt: number;
};

type NexusState<T> = {
  entities: Record<string, NexusEntry<T>>;
};

export abstract class Nexus<T, R = unknown> {
  private entityType: string;
  private instanceId: string;
  private storage: MMKV;
  private _store: UseBoundStore<StoreApi<NexusState<T>>> | null = null;

  constructor(entityType: string, instanceId: string, storage: MMKV) {
    this.entityType = entityType;
    this.instanceId = instanceId;
    this.storage = storage;
  }

  private get store(): UseBoundStore<StoreApi<NexusState<T>>> {
    if (!this._store) {
      this._store = create<NexusState<T>>(() => ({
        entities: {},
      }));
    }
    return this._store;
  }

  private get storageKey(): string {
    return `haven:nexus:${this.entityType}:${this.instanceId}`;
  }

  protected abstract transform(raw: R): T;

  getOrCreate(id: string, raw: R, isNew = false): T {
    const existing = this.store.getState().entities[id];
    if (existing && !existing.partial) return existing.data;

    const data = this.transform(raw);

    this.store.setState((state) => ({
      entities: {
        ...state.entities,
        [id]: { data, partial: false, cachedAt: Date.now() },
      },
    }));

    return data;
  }

  getOrPartial(id: string, stub: Partial<T>): T | undefined {
    const existing = this.store.getState().entities[id];
    if (existing) return existing.data;

    this.store.setState((state) => ({
      entities: {
        ...state.entities,
        [id]: { data: stub as T, partial: true, cachedAt: Date.now() },
      },
    }));

    return stub as T;
  }

  update(id: string, changes: Partial<T>): void {
    const existing = this.store.getState().entities[id];
    if (!existing) return;

    this.store.setState((state) => ({
      entities: {
        ...state.entities,
        [id]: {
          ...existing,
          data: { ...existing.data, ...changes },
          cachedAt: Date.now(),
        },
      },
    }));
  }

  delete(id: string): void {
    this.store.setState((state) => {
      const { [id]: _, ...rest } = state.entities;
      return { entities: rest };
    });
  }

  has(id: string): boolean {
    return id in this.store.getState().entities;
  }

  isPartial(id: string): boolean {
    return this.store.getState().entities[id]?.partial ?? false;
  }

  getSnapshot(id: string): T | undefined {
    return this.store.getState().entities[id]?.data;
  }

  use<S>(selector: (state: NexusState<T>) => S): S {
    return useStore(this.store, selector);
  }

  useAll(): T[] {
    return useStore(this.store, (state) =>
      Object.values(state.entities)
        .filter((entry) => !entry.partial)
        .map((entry) => entry.data),
    );
  }

  useOne(id: string): T | undefined {
    return useStore(this.store, (state) => state.entities[id]?.data);
  }

  persist(): void {
    try {
      const state = this.store.getState();
      const persistable = Object.fromEntries(
        Object.entries(state.entities).filter(([_, entry]) => !entry.partial),
      );
      this.storage.set(this.storageKey, JSON.stringify(persistable));
    } catch (e) {
      console.warn(`[Nexus] Failed to persist ${this.storageKey}`, e);
    }
  }

  rehydrate(): void {
    try {
      const raw = this.storage.getString(this.storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Record<string, NexusEntry<T>>;
      this.store.setState({ entities: parsed });
    } catch (e) {
      console.warn(`[Nexus] Failed to rehydrate ${this.storageKey}`, e);
      this.storage.remove(this.storageKey);
    }
  }

  evict(id: string): void {
    this.delete(id);
    this.persist();
  }

  clear(): void {
    this.store.setState({ entities: {} });
    this.storage.remove(this.storageKey);
  }
}
