# Realtime — event contract & coverage

Maintained alongside [HAVEN_CORE.md](./HAVEN_CORE.md). One row per event: does
the private user channel broadcast it, and where does `routeRealtimeEvent` send
it?

Routing lives in `packages/shared/src/core/routeRealtimeEvent.ts` and operates
on `RealtimeMutationTarget`, which the shared `HavenCore` implements — so every
platform routes events identically.

## Design contract

- **HavenCore orchestrates** session bootstrap, `routeEvent`, and cross-nexus
  commands (policy sync, access loss, focus loads).
- **Realtime is the mutation bus** for data that changed elsewhere.
- **Default handler shape:** one event → one primary nexus → patch, evict, or
  single-domain reload. Work across nexuses is a HavenCore method, called from
  `routeRealtimeEvent`.
- **UI writes:** call the authoritative nexus (or RPC); let the event path
  update other surfaces.
- **One private channel per user** (`private_user:{userId}`). The only other
  channels are the voice nexus's room-scoped presence and kick channels.

## Coverage matrix

| Domain         | Event                         | Emitted by                                                                                 | Routed to                                                                                                                 |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Community      | `COMMUNITY_MEMBERSHIP_CHANGE` | `community_members` insert/delete (join, leave, kick, ban)                                 | `communities.load(userId)`; a dropped community → **access loss**                                                         |
| Channel        | `CHANNEL_INSERT` / `UPDATE`   | channel triggers                                                                           | `channels.upsertChannel` (reload when the payload isn't a full row)                                                       |
| Channel        | `CHANNEL_DELETE`              | channel triggers                                                                           | `channels.removeChannel` + evict the channel's messages                                                                   |
| Channel group  | `CHANNEL_GROUP_CHANGE`        | group / group-channel / preference triggers                                                | `channels.loadForCommunity`                                                                                               |
| Roles & access | `ROLE_CHANGE`                 | `member_roles`, `role_permissions`, `channel_role_overwrites`, `channel_member_overwrites` | `core.onRoleChange`: permissions + channel list reload, evict hidden channels' messages, move off a hidden active channel |
| Profile        | `PROFILE_IDENTITY_CHANGE`     | `profile_identities` trigger                                                               | `profiles.upsertProfile` / `removeProfile`                                                                                |
| Message        | `MESSAGE_INSERT`              | `messages` trigger                                                                         | partial insert, then fetch the full row → message nexus                                                                   |
| Message        | `MESSAGE_UPDATE`              | `messages` trigger                                                                         | fetch the row → `upsertMessage`                                                                                           |
| Message        | `MESSAGE_DELETE`              | `messages` trigger                                                                         | `removeMessage`                                                                                                           |
| Reaction       | insert / delete               | — (per-channel subscription removed)                                                       | partial: via the next message row update                                                                                  |
| Attachment     | insert / delete               | —                                                                                          | partial                                                                                                                   |
| Link preview   | insert / update               | —                                                                                          | partial                                                                                                                   |
| Notifications  | `NOTIFICATION`                | notification pipeline                                                                      | `core.onNotificationEvent`: inbox reload (counts included) + toast; desktop plays a sound                                 |
| DM             | `DM_CONVERSATION`             | DM triggers                                                                                | `directMessages.loadConversations`                                                                                        |
| DM             | `DM_MESSAGE`                  | DM triggers                                                                                | partial upsert + `receiveMessage`; `receiveLatest` when no message id                                                     |
| Social         | `SOCIAL_CHANGE`               | friends / blocks                                                                           | `social.handleSocialChange` + `syncViewerMessagePolicy`                                                                   |
| Moderation     | `report_created`              | report RPCs                                                                                | `moderation.handleReportCreated`                                                                                          |
| Moderation     | `report_status_updated`       | report RPCs                                                                                | `moderation.handleReportChange`                                                                                           |
| Moderation     | `USER_PLATFORM_BANNED`        | platform ban                                                                               | `moderation.handleUserPlatformBanned`                                                                                     |

Unknown event types fall through to a `console.debug` line.

## Access loss

A kick, ban, or deleted community deletes the viewer's `community_members` row,
which sends `COMMUNITY_MEMBERSHIP_CHANGE`. The reloaded list no longer has the
community, so HavenCore forgets it (caches and device storage), refocuses, and
calls the platform's `subscribeCommunityAccessLost` listener to show a notice
and leave voice. Losing a single channel arrives as `ROLE_CHANGE`. Details in
[HAVEN_CORE.md](./HAVEN_CORE.md#access-loss).

Retired in 2026-10: `member_banned` (redundant with the membership change) and
`member_channel_access_revoked` (a self-only broadcast nothing called; overwrite
triggers carry that signal now).

## Open holes

1. **Reactions / attachments / link previews.** Per-channel Supabase
   subscriptions were removed. The message row itself is refreshed via
   `MESSAGE_UPDATE`, so child-row changes rely on the next message update or an
   initial page reload. Closing this needs the child rows folded into the
   message payload, or new private-channel events routed in
   `routeRealtimeEvent`.
2. **No catch-up after a reconnect.** Events missed while the socket was down
   are missed; state is corrected by the next focus-driven load or domain
   reload (see [BOOTSTRAP.md](./BOOTSTRAP.md#lifecycle-ownership--teardown)).
