/** Normalizes pasted invite URLs or codes for redemption. Pure — no hook deps. */
export function normalizeInviteCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const maybeFromPath = trimmed.split("?")[0].replace(/\/+$/, "");
  if (maybeFromPath.includes("/")) {
    const pathSegments = maybeFromPath.split("/").filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment) return lastSegment.toUpperCase();
  }
  return maybeFromPath.toUpperCase();
}
