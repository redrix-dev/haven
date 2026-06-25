export type DataCacheDebugCategory =
  | "store"
  | "fetch"
  | "cache-read"
  | "cache-write"
  | "hydration"
  | "realtime"
  | "component"
  | "lifecycle"
  | "navigation";

export type DataCacheDebugLevel = "debug" | "info" | "warn" | "error";

export type DataCacheDebugEntry = {
  id: number;
  ts: number;
  elapsedMs: number;
  level: DataCacheDebugLevel;
  category: DataCacheDebugCategory;
  source: string;
  message: string;
  data?: Record<string, unknown>;
};

export type DataCacheComponentSnapshot = {
  componentId: string;
  ts: number;
  elapsedMs: number;
  values: Record<string, unknown>;
};

export type DataCacheDebugLogInput = {
  level?: DataCacheDebugLevel;
  category: DataCacheDebugCategory;
  source: string;
  message: string;
  data?: Record<string, unknown>;
};
