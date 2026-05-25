import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_COMMUNITY_SURFACE_KEY = "haven.community.lastSurface";

export type LastCommunitySurface = "drawer" | "chat";

function parseSurface(value: string | null): LastCommunitySurface | null {
  return value === "drawer" || value === "chat" ? value : null;
}

export async function getLastCommunitySurface(): Promise<LastCommunitySurface | null> {
  try {
    return parseSurface(await AsyncStorage.getItem(LAST_COMMUNITY_SURFACE_KEY));
  } catch {
    return null;
  }
}

export async function setLastCommunitySurface(
  surface: LastCommunitySurface,
): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_COMMUNITY_SURFACE_KEY, surface);
  } catch {
    // Non-fatal: shell memory should never block navigation.
  }
}
