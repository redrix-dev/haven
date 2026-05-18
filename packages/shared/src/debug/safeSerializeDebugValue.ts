const MAX_STRING_LENGTH = 240;
const MAX_ARRAY_ITEMS = 12;
const MAX_OBJECT_KEYS = 24;
const MAX_DEPTH = 4;

const REDACTED_KEYS = new Set([
  "password",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "authorization",
]);

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}…(${value.length} chars)`;
}

export function safeSerializeDebugValue(
  value: unknown,
  depth = 0,
): unknown {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return "[MaxDepth]";

  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? truncateString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    const slice = value.slice(0, MAX_ARRAY_ITEMS).map((item) =>
      safeSerializeDebugValue(item, depth + 1),
    );
    if (value.length > MAX_ARRAY_ITEMS) {
      slice.push(`…+${value.length - MAX_ARRAY_ITEMS} more`);
    }
    return slice;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).slice(0, MAX_OBJECT_KEYS);
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      if (REDACTED_KEYS.has(key.toLowerCase())) {
        out[key] = "[REDACTED]";
        continue;
      }
      try {
        out[key] = safeSerializeDebugValue(record[key], depth + 1);
      } catch {
        out[key] = "[Unserializable]";
      }
    }
    const totalKeys = Object.keys(record).length;
    if (totalKeys > MAX_OBJECT_KEYS) {
      out.__truncatedKeys = totalKeys - MAX_OBJECT_KEYS;
    }
    return out;
  }

  return String(value);
}

export function safeSerializeDebugRecord(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = safeSerializeDebugValue(value);
  }
  return out;
}
