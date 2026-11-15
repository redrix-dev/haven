# Realtime — event contract & coverage

> **The database side of this page changed on 2026-11-13.** The database was
> rebuilt ([DATABASE.md](./DATABASE.md#realtime)): the topic is now
> `user:<id>`, and the events it sends have new names and carry more. The
> matrix below is still what `routeRealtimeEvent` handles today, which is the
> old set. Until the shared core is rewritten, **the apps do not hear the new
> database**. "From old events to new" at the end of this page is the map for
> that rewrite.

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
  channels are the voice nexus's room-scoped presence channels. Voice controls
  arrive as server-authorized `VOICE_CONTROL` events on the private user channel
  and route to `VoiceNexus.applyRemoteControl`.

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

Hole 1 is closed on the database side: a message event now carries the whole
message, with its files, reactions and link preview, and any change to one of
those is a `message.updated`. It stays open in the apps until they route it.

## From old events to new

What the rebuilt database sends in place of each event above. Full list,
audiences and payloads: [DATABASE.md](./DATABASE.md#realtime).

| Old event                                 | New event                                               | What changed for the handler                                                                              |
| ----------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `COMMUNITY_MEMBERSHIP_CHANGE`             | `member.joined` `.updated` `.left`, `community.deleted` | Carries the membership row. The person removed is sent `member.left` too: that is the access-loss signal  |
| `CHANNEL_INSERT` / `UPDATE` / `DELETE`    | `channel.created` `.updated` `.deleted`                 | Always the full row; no reload needed                                                                     |
| `CHANNEL_GROUP_CHANGE`                    | `category.created` `.updated` `.deleted`                | Carries the row. Folding a category is not an event                                                       |
| `ROLE_CHANGE`                             | `access.changed` `{community_id}`, plus `role.*`        | One per statement, not one per row                                                                        |
| `PROFILE_IDENTITY_CHANGE`                 | `profile.updated`                                       | Carries the profile record; `deleted: true` for someone who left Haven                                    |
| `MESSAGE_INSERT` / `UPDATE` / `DELETE`    | `message.created` `.updated` `.deleted`                 | Carries the whole message record: no follow-up fetch                                                      |
| `DM_CONVERSATION`, `DM_MESSAGE`           | `channel.created`, `message.*`                          | A conversation is a channel; the same handlers serve both                                                 |
| `NOTIFICATION`                            | `notification.created`, `notifications.changed`         | The first carries the row; the second means "reload the inbox"                                            |
| `SOCIAL_CHANGE`                           | `friend_request.*`, `friendship.*`, `block.*`           | Carries the row                                                                                           |
| `report_created`, `report_status_updated` | `report.created` `.updated`, `case.changed`             | Never sent to the person the report is about                                                              |
| `USER_PLATFORM_BANNED`                    | `account.restricted` `{ends_at}`                        | Sent to the person; their apps sign out                                                                   |
| —                                         | `channel.read`                                          | New: a read mark made on one device clears the badge on the others                                        |
| —                                         | `member.banned` `.unbanned`                             | New: a ban hides or shows that person's messages                                                          |
| `VOICE_CONTROL`                           | `voice.control`                                         | Same payload, with `actor_id` for `actor_user_id`. Voice presence moves to the `voice:<channel id>` topic |
