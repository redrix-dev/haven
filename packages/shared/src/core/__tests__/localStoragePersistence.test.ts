import { describe, expect, it, beforeEach } from "vitest";
import { createLocalStoragePersistence } from "../persistence/createLocalStoragePersistence";

describe("createLocalStoragePersistence", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
      },
    });
  });

  it("roundtrips set/get/remove with key prefix", () => {
    const storage = createLocalStoragePersistence();
    storage.set("communities:global", '{"ok":true}');
    expect(storage.getString("communities:global")).toBe('{"ok":true}');
    storage.remove("communities:global");
    expect(storage.getString("communities:global")).toBeNull();
  });
});
