import AsyncStorage from "@react-native-async-storage/async-storage";

const COMMUNITY_TIMELINE_KEY_PREFIX = "haven.community.timeline.";

export type CommunityTimelineAnchor = {
  anchorMessageId: string | null;
  wasNearBottom: boolean;
  savedAt: string;
};

function getStorageKey(communityId: string, channelId: string): string {
  return `${COMMUNITY_TIMELINE_KEY_PREFIX}${communityId}.${channelId}`;
}

export async function getCommunityTimelineAnchor(
  communityId: string,
  channelId: string,
): Promise<CommunityTimelineAnchor | null> {
  try {
    const raw = await AsyncStorage.getItem(getStorageKey(communityId, channelId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CommunityTimelineAnchor>;
    return {
      anchorMessageId:
        typeof parsed.anchorMessageId === "string" ? parsed.anchorMessageId : null,
      wasNearBottom: Boolean(parsed.wasNearBottom),
      savedAt:
        typeof parsed.savedAt === "string"
          ? parsed.savedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function setCommunityTimelineAnchor(
  communityId: string,
  channelId: string,
  anchor: CommunityTimelineAnchor,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      getStorageKey(communityId, channelId),
      JSON.stringify(anchor),
    );
  } catch {
    // Best effort persistence only.
  }
}
