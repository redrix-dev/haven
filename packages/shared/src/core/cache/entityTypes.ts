/** Framework-free entity entry shape used by cache logic in shared. */
export type NexusEntry<T> = {
  data: T;
  partial: boolean;
  cachedAt: number;
};

export type EntityMapState<T> = {
  entities: Record<string, NexusEntry<T>>;
};

/** Entity map state with revision counter (used by mobile/solid cache state types). */
export type NexusState<T> = EntityMapState<T> & {
  revision: number;
};
