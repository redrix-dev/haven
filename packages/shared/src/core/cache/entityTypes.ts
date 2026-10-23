/** Framework-free entity entry shape used by cache logic in shared. */
export type NexusEntry<T> = {
  data: T;
  partial: boolean;
  cachedAt: number;
};

export type EntityMapState<T> = {
  entities: Record<string, NexusEntry<T>>;
};
