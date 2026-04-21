import AsyncStorage from "@react-native-async-storage/async-storage";

const COMMUNITY_LAST_TEXT_CHANNEL_KEY_PREFIX = "haven.community.lastTextChannel.";

function getStorageKey(communityId: string): string {
  return `${COMMUNITY_LAST_TEXT_CHANNEL_KEY_PREFIX}${communityId}`;
}

export async function getLastTextChannelIdForCommunity(
  communityId: string,
): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(getStorageKey(communityId));
  } catch {
    return null;
  }
}

export async function setLastTextChannelIdForCommunity(
  communityId: string,
  channelId: string | null,
): Promise<void> {
  const key = getStorageKey(communityId);
  try {
    if (!channelId) {
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, channelId);
  } catch {
    // Non-fatal: channel memory should not block navigation.
  }
}
