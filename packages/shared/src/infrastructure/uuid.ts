export function createPortableUuid(): string {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const randomNibble = Math.floor(Math.random() * 16);
    const value = token === "x" ? randomNibble : (randomNibble & 0x3) | 0x8;
    return value.toString(16);
  });
}
