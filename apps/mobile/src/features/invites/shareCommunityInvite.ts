import { Share } from "react-native";
import { getPlatformInviteBaseUrl } from "@shared/platform/urls";

export function buildCommunityInviteUrl(code: string): string {
  return `${getPlatformInviteBaseUrl()}${code}`;
}

export async function shareCommunityInvite(code: string): Promise<void> {
  const url = buildCommunityInviteUrl(code);
  await Share.share({
    title: "Join me on Haven",
    message: `Join me on Haven: ${url}`,
    url,
  });
}
