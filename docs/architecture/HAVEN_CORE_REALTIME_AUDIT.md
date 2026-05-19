# HavenCore — Realtime event coverage audit

Maintained alongside [HAVEN_CORE.md](./HAVEN_CORE.md). One sentence per row: does the
private user channel currently broadcast this event, and does `routeRealtimeEvent`
route it into a nexus.

## Coverage matrix

| Domain | Event | Backend emits? | `routeEvent` routes? | Target |
|--------|-------|----------------|----------------------|--------|
| Community | community list change | partial (login fetch) | n/a — fetched on bootstrap | `CommunityNexus.load` |
| Channel | `CHANNEL_INSERT` | yes | yes | `ChannelNexus.upsertChannel` |
| Channel | `CHANNEL_UPDATE` | yes | yes | `ChannelNexus.upsertChannel` |
| Channel | `CHANNEL_DELETE` | yes | yes | `ChannelNexus.removeChannel` + `messages.evictChannel` |
| Channel access | `member_channel_access_revoked` | yes | yes | `applyAccessRevoked` (channel + message eviction) |
| Channel group | reorder | partial | refetch via `loadForCommunity` | `ChannelNexus.loadForCommunity` |
| Message | `MESSAGE_INSERT` | yes | yes | `CommunityMessageNexus.insertMessage` |
| Message | `MESSAGE_UPDATE` | yes | yes | `CommunityMessageNexus.updateMessage` |
| Message | `MESSAGE_DELETE` | yes | yes | `CommunityMessageNexus.removeMessage` |
| Reaction | insert / delete | per-channel subscription removed; consumes the message-row update path | partial — reactions still loaded by initial fetch | follow-up: route `REACTION_*` |
| Attachment | insert / delete | per-channel subscription removed; the message stays current via routeEvent on insert | partial | follow-up: route `ATTACHMENT_*` |
| Link preview | insert / update | per-channel subscription removed | partial | follow-up: route `LINK_PREVIEW_*` |
| Roles | `ROLE_CHANGE` | yes | yes | `core.onRoleChange` → hydrate permissions |
| Notifications | `NOTIFICATION` | yes | yes | `NotificationNexus.loadInbox` + transitional store refresh |
| DM | `DM_CONVERSATION` | yes | yes | `DirectMessageNexus.loadConversations` + transitional store refresh |
| DM | `DM_MESSAGE` | yes | yes | `DirectMessageNexus.loadMessages(conversationId)` + transitional store refresh |
| Social | `SOCIAL_CHANGE` | yes | yes | transitional social store refresh (SocialNexus is post-v1) |

## Open holes

1. **Reactions / attachments / link previews.** The per-channel Supabase subscriptions
   were removed in Phase 3. The message row itself is refreshed via
   `MESSAGE_UPDATE`, so reaction / attachment / link-preview changes that only
   touch their own rows currently rely on the next `MESSAGE_UPDATE` or initial
   page reload. Closing this hole requires either:
   - server-side: union these into the message row's update payload (preferred), or
   - client-side: add `REACTION_*` / `ATTACHMENT_*` / `LINK_PREVIEW_*` events to the
     private user channel and route them in `routeRealtimeEvent`.
2. **Community list change.** Joining or leaving a community currently relies on
   a refetch path (mod actions, invite acceptance) rather than a realtime push.
   Add a `COMMUNITY_MEMBERSHIP_CHANGE` event to the private user channel and
   route it to `core.communities.load(userId)`.
3. **Channel group reordering.** When a community admin reorders groups, peers
   only see the change after a refetch. Add a `CHANNEL_GROUP_CHANGE` event and
   route it to `core.channels.loadForCommunity(communityId)`.

These holes are post-v1; the data layer already returns to a correct steady
state on the next user-driven fetch or a full session reload.
