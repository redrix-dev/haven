# Realtime — event contract & coverage

Maintained alongside [HAVEN_CORE.md](./HAVEN_CORE.md). One sentence per row: does the private
user channel broadcast this event, and does `routeRealtimeEvent` route it into a cache?
The Solid core (`HavenSolidCore`) implements the same `RealtimeMutationTarget` contract
against this same matrix.

> **Post-cleave:** routing logic lives in `packages/shared/src/core/routeRealtimeEvent.ts` and
> operates on `RealtimeMutationTarget` (implemented by `HavenReactCore` on mobile). Message
> cache class: `CommunityMessageCache` (`apps/mobile/src/data/messages/`).

## Design contract

- **HavenReactCore orchestrates** session bootstrap, `routeEvent`, and cross-cache commands
  (policy sync, access revoked, focus load).
- **Realtime is the mutation bus** for data that changed elsewhere.
- **Default handler shape:** one event → one primary cache → patch, evict, or single-domain reload.
  Multi-cache work is explicit in `routeRealtimeEvent` or `apps/mobile/src/data/core/commands/*`.
- **UI writes:** call the authoritative cache (or RPC); let the event path update other surfaces.

## Coverage matrix

| Domain | Event | Backend emits? | `routeEvent` routes? | Target |
|--------|-------|----------------|----------------------|--------|
| Community | community list change | partial (login fetch) | n/a — fetched on bootstrap | `CommunityNexus.load` |
| Channel | `CHANNEL_INSERT` | yes | yes | `ChannelNexus.upsertChannel` |
| Channel | `CHANNEL_UPDATE` | yes | yes | `ChannelNexus.upsertChannel` |
| Channel | `CHANNEL_DELETE` | yes | yes | `ChannelNexus.removeChannel` + `messages.evictChannel` |
| Channel access | `member_channel_access_revoked` | yes | yes | `applyAccessRevoked` |
| Channel group | `CHANNEL_GROUP_CHANGE` | yes | yes | `ChannelNexus.loadForCommunity` |
| Profile | `PROFILE_IDENTITY_CHANGE` | yes | yes | `ProfileNexus.upsert/remove` |
| Community | `COMMUNITY_MEMBERSHIP_CHANGE` | yes | yes | `CommunityNexus.load(userId)` |
| Message | `MESSAGE_INSERT` | yes | yes | `CommunityMessageCache.insertMessage` |
| Message | `MESSAGE_UPDATE` | yes | yes | `CommunityMessageCache.upsertMessage` |
| Message | `MESSAGE_DELETE` | yes | yes | `CommunityMessageCache.removeMessage` |
| Reaction | insert / delete | per-channel sub removed | partial — via message row update | follow-up: route `REACTION_*` |
| Attachment | insert / delete | per-channel sub removed | partial | follow-up: route `ATTACHMENT_*` |
| Link preview | insert / update | per-channel sub removed | partial | follow-up: route `LINK_PREVIEW_*` |
| Roles | `ROLE_CHANGE` | yes | yes | `core.onRoleChange` → hydrate permissions |
| Notifications | `NOTIFICATION` | yes | yes | `NotificationNexus.loadInbox` + counts refresh |
| DM | `DM_CONVERSATION` | yes | yes | `DirectMessageNexus.loadConversations` |
| DM | `DM_MESSAGE` | yes | yes | `DirectMessageNexus.loadMessages(conversationId)` |
| Social | `SOCIAL_CHANGE` | yes | yes | `SocialNexus.handleSocialChange` + `syncViewerMessagePolicy` |
| Moderation | `member_banned` | yes | yes | community access handlers |
| Moderation | `report_status_updated` | yes | yes | `uiStore` revision bump + inbox refresh where needed |

## Open holes

1. **Reactions / attachments / link previews.** Per-channel Supabase subscriptions were removed.
   The message row itself is refreshed via `MESSAGE_UPDATE`, so child-row changes rely on the next
   message update or initial page reload. Closing this requires server-side union into the message
   payload or new private-channel events routed in `routeRealtimeEvent`.

## Closed in hook-reduction / cleave

- **Community membership** — `COMMUNITY_MEMBERSHIP_CHANGE` → `CommunityNexus.load(userId)`
- **Channel groups** — `CHANNEL_GROUP_CHANGE` → `ChannelNexus.loadForCommunity(communityId)`
- **Profile identities** — `PROFILE_IDENTITY_CHANGE` → `ProfileNexus`
- **Shared routing decoupled from HavenCore** — `RealtimeMutationTarget` interface (2026-06 cleave)
