/**
 * Minimal URL scheme for the web/electron shell. Web shell on Phase 1 reads
 * the current path, parses it via `parseRouteFromPath`, then calls
 * `syncFocusFromRoute(core, ...)`. Full router polish is post-v1.
 *
 *   /                            → no focus
 *   /c/:communityId              → focus community, last/default channel
 *   /c/:communityId/:channelId   → focus community + specific channel
 *   /dm/:conversationId          → DM workspace (Phase 4 will surface this)
 */
export type ParsedShellRoute =
  | { kind: "none" }
  | { kind: "community"; communityId: string; channelId: string | null }
  | { kind: "dm"; conversationId: string };

export function parseRouteFromPath(pathname: string): ParsedShellRoute {
  const trimmed = pathname.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return { kind: "none" };

  const segments = trimmed.split("/").filter(Boolean);
  if (segments[0] === "c" && typeof segments[1] === "string") {
    return {
      kind: "community",
      communityId: segments[1],
      channelId: typeof segments[2] === "string" ? segments[2] : null,
    };
  }

  if (segments[0] === "dm" && typeof segments[1] === "string") {
    return { kind: "dm", conversationId: segments[1] };
  }

  return { kind: "none" };
}
