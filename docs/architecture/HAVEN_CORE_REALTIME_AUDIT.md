# HavenCore — Realtime event coverage audit

Maintained alongside [HAVEN_CORE.md](./HAVEN_CORE.md). One sentence per row: does the
private user channel currently broadcast this event, and does `routeRealtimeEvent`
route it into a nexus.

## Design contract

- **HavenCore orchestrates** session bootstrap, `routeEvent`, and cross-nexus commands (policy sync, access revoked, focus load).
- **Realtime is the mutation bus** for data that changed elsewhere (other clients, server-side triggers).
- **Default handler shape:** one event → one primary nexus → patch, evict, or single-domain reload. Multi-nexus work is explicit in `routeRealtimeEvent` or `core/commands/*`, not duplicated in feature hooks.
- **UI writes:** call the authoritative nexus (or RPC); let the event path update other surfaces. Manual “refresh inbox + DMs + social” in click handlers is a hole — add/fix the event or HavenCore command instead.

## Coverage matrix

| Domain | Event | Backend emits? | `routeEvent` routes? | Target |
|--------|-------|----------------|----------------------|--------|
| Community | community list change | partial (login fetch) | n/a — fetched on bootstrap | `CommunityNexus.load` |
| Channel | `CHANNEL_INSERT` | yes | yes | `ChannelNexus.upsertChannel` |
| Channel | `CHANNEL_UPDATE` | yes | yes | `ChannelNexus.upsertChannel` |
| Channel | `CHANNEL_DELETE` | yes | yes | `ChannelNexus.removeChannel` + `messages.evictChannel` |
| Channel access | `member_channel_access_revoked` | yes | yes | `applyAccessRevoked` (channel + message eviction) |
| Channel group | `CHANNEL_GROUP_CHANGE` | yes | yes | `ChannelNexus.loadForCommunity` |
| Profile | `PROFILE_IDENTITY_CHANGE` | yes | yes | `ProfileNexus.upsert/remove` |
| Community | `COMMUNITY_MEMBERSHIP_CHANGE` | yes | yes | `CommunityNexus.load(userId)` |
| Message | `MESSAGE_INSERT` | yes | yes | `CommunityMessageNexus.insertMessage` |
| Message | `MESSAGE_UPDATE` | yes | yes | `CommunityMessageNexus.updateMessage` |
| Message | `MESSAGE_DELETE` | yes | yes | `CommunityMessageNexus.removeMessage` |
| Reaction | insert / delete | per-channel subscription removed; consumes the message-row update path | partial — reactions still loaded by initial fetch | follow-up: route `REACTION_*` |
| Attachment | insert / delete | per-channel subscription removed; the message stays current via routeEvent on insert | partial | follow-up: route `ATTACHMENT_*` |
| Link preview | insert / update | per-channel subscription removed | partial | follow-up: route `LINK_PREVIEW_*` |
| Roles | `ROLE_CHANGE` | yes | yes | `core.onRoleChange` → hydrate permissions |
| Notifications | `NOTIFICATION` | yes | yes | `NotificationNexus.loadInbox` + counts refresh |
| DM | `DM_CONVERSATION` | yes | yes | `DirectMessageNexus.loadConversations` |
| DM | `DM_MESSAGE` | yes | yes | `DirectMessageNexus.loadMessages(conversationId)` |
| Social | `SOCIAL_CHANGE` | yes | yes | `SocialNexus.handleSocialChange` + `syncViewerMessagePolicy` |
| Moderation | `member_banned` | yes | yes | community access handlers (shell redirect + eviction) |
| Moderation | `report_status_updated` | yes | yes | `uiStore` revision bump + inbox refresh where needed |

## Open holes

1. **Reactions / attachments / link previews.** Per-channel Supabase subscriptions were removed. The message row itself is refreshed via `MESSAGE_UPDATE`, so reaction / attachment / link-preview changes that only touch their own rows currently rely on the next `MESSAGE_UPDATE` or initial page reload. Closing this hole requires either:
   - server-side: union these into the message row's update payload (preferred), or
   - client-side: add `REACTION_*` / `ATTACHMENT_*` / `LINK_PREVIEW_*` events to the private user channel and route them in `routeRealtimeEvent`.

## Closed in hook-reduction finality

- **Community membership** — `COMMUNITY_MEMBERSHIP_CHANGE` → `CommunityNexus.load(userId)`
- **Channel groups** — `CHANNEL_GROUP_CHANGE` → `ChannelNexus.loadForCommunity(communityId)`
- **Profile identities** — `PROFILE_IDENTITY_CHANGE` → `ProfileNexus`
