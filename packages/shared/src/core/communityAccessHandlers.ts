import type {
  MemberBannedBroadcastPayload,
  MemberChannelAccessRevokedBroadcastPayload,
} from "@shared/lib/backend/types";

type CommunityAccessHandlers = {
  onActiveServerAccessLost: (serverId: string) => void;
  onActiveChannelAccessLost: (channelId: string, channelName: string) => void;
  onMemberBanned: (payload: MemberBannedBroadcastPayload) => void;
  onMemberChannelAccessRevoked: (
    payload: MemberChannelAccessRevokedBroadcastPayload,
  ) => void;
};

const noop = () => {};

let handlers: CommunityAccessHandlers = {
  onActiveServerAccessLost: noop,
  onActiveChannelAccessLost: noop,
  onMemberBanned: noop,
  onMemberChannelAccessRevoked: noop,
};

export function registerCommunityAccessHandlers(
  next: CommunityAccessHandlers,
): void {
  handlers = next;
}

export function notifyActiveServerAccessLost(serverId: string): void {
  handlers.onActiveServerAccessLost(serverId);
}

export function notifyActiveChannelAccessLost(
  channelId: string,
  channelName: string,
): void {
  handlers.onActiveChannelAccessLost(channelId, channelName);
}

export function notifyMemberBanned(
  payload: MemberBannedBroadcastPayload,
): void {
  handlers.onMemberBanned(payload);
}

export function notifyMemberChannelAccessRevoked(
  payload: MemberChannelAccessRevokedBroadcastPayload,
): void {
  handlers.onMemberChannelAccessRevoked(payload);
}
