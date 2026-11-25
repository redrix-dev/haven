import { createSignal } from "solid-js";

/**
 * Screen state that is no record and no session place: which dialog or panel
 * is open. It belongs to this platform (COLLECTIONS.md, "Session"), lives in
 * memory, and is gone with the window.
 */

export type CommunitySettingsTab =
  | "overview"
  | "channels"
  | "roles"
  | "invites";

export type CommunitySettingsOpen = {
  communityId: string;
  /** Null: the first tab the person may see. */
  tab: CommunitySettingsTab | null;
};

const [communitySettings, setCommunitySettings] =
  createSignal<CommunitySettingsOpen | null>(null);

/** The community settings panel, when it is open. */
export { communitySettings };

export function openCommunitySettings(
  communityId: string,
  tab: CommunitySettingsTab | null = null,
): void {
  setCommunitySettings({ communityId, tab });
}

export function closeCommunitySettings(): void {
  setCommunitySettings(null);
}
