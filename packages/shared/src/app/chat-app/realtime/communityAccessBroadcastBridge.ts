import type {
  MemberBannedBroadcastPayload,
  MemberChannelAccessRevokedBroadcastPayload,
} from "@shared/lib/backend/types";

/**
 * Module-scoped broadcast targets so `useServers` / `useCommunityWorkspace` /
 * `useChannelGroups` can register stable callbacks before the chat shell wires
 * the real cascade handlers from `useChatAppAccessAndBroadcastOrchestration`.
 */
let onActiveServerAccessLostImpl: (serverId: string) => void = () => {};
let onActiveChannelAccessLostImpl: (
  channelId: string,
  channelName: string,
) => void = () => {};
let onMemberBannedImpl: (payload: MemberBannedBroadcastPayload) => void =
  () => {};
let onMemberChannelAccessRevokedImpl: (
  payload: MemberChannelAccessRevokedBroadcastPayload,
) => void = () => {};

export const stableOnActiveServerAccessLost = (serverId: string): void => {
  onActiveServerAccessLostImpl(serverId);
};

export const stableOnActiveChannelAccessLost = (
  channelId: string,
  channelName: string,
): void => {
  onActiveChannelAccessLostImpl(channelId, channelName);
};

export const stableOnMemberBanned = (
  payload: MemberBannedBroadcastPayload,
): void => {
  onMemberBannedImpl(payload);
};

export const stableOnMemberChannelAccessRevoked = (
  payload: MemberChannelAccessRevokedBroadcastPayload,
): void => {
  onMemberChannelAccessRevokedImpl(payload);
};

export function registerCommunityAccessBroadcastHandlers(handlers: {
  onActiveServerAccessLost: (serverId: string) => void;
  onActiveChannelAccessLost: (channelId: string, channelName: string) => void;
  onMemberBanned: (payload: MemberBannedBroadcastPayload) => void;
  onMemberChannelAccessRevoked: (
    payload: MemberChannelAccessRevokedBroadcastPayload,
  ) => void;
}): void {
  onActiveServerAccessLostImpl = handlers.onActiveServerAccessLost;
  onActiveChannelAccessLostImpl = handlers.onActiveChannelAccessLost;
  onMemberBannedImpl = handlers.onMemberBanned;
  onMemberChannelAccessRevokedImpl = handlers.onMemberChannelAccessRevoked;
}
