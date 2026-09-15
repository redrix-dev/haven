import { Share } from "react-native";
import { buildHavenLink } from "@shared/features/links";

/** The canonical https invite link — the same one desktop and web share. */
export function buildCommunityInviteUrl(code: string): string {
  return buildHavenLink({ kind: "invite", code });
}

export async function shareCommunityInvite(code: string): Promise<void> {
  const url = buildCommunityInviteUrl(code);
  await Share.share({
    title: "Join me on Haven",
    message: `Join me on Haven: ${url}`,
    url,
  });
}
