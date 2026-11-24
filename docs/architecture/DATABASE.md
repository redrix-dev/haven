# Database

The contract between Haven's Postgres database and everything that talks to
it. Rebuilt from nothing on 2026-11-13: the shape comes from what the product
needs, not from the code that existed. The nine files in
`supabase/migrations/` are the whole database, and this page is how to read
them.

**State:** the database, the Edge Functions, the shared backend clients, the
collections and all three apps run on it (see [What follows](#what-follows)).

## The six rules

Everything below is one of these applied to one feature.

1. **`public` is the contract, `private` is the workings.** The API exposes
   only `public`. Helpers, triggers, the job queue and the rule views live in
   `private`, which a client cannot reach.
2. **Nothing is reachable unless a line grants it.** New tables and functions
   are closed to everyone by default. Visitors (`anon`) can do one thing: ask
   `username_taken`, so the sign-up form can say a name is taken before the
   sign-up trigger would swap it for `user_<id>`.
3. **Tables are read through RLS and written through RPCs.** No table has an
   insert, update or delete grant. A few tables (messages, profiles, files,
   reports) have no select grant either and are read through RPCs.
4. **Every RPC starts by asking who is calling.** `private.require_user()`
   refuses a missing session, a deleted account and a restricted account.
   Eight plain reads are the stated exception (they return nothing without a
   session).
5. **One way to refuse.** Every refusal carries an HTTP status, a sentence
   for a person, and a stable reason word for the apps.
6. **The database decides who hears about a change** and sends it to each of
   those people's own realtime topic. Nothing is published table-by-table.

Rules 2, 3 and 4 are not just stated here: `supabase/tests/sql/14_api_surface.sql`
lists the whole reachable surface and fails when anything is added to it
without being written down.

## The files

| File                     | What it holds                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `…100_foundation`        | Schemas and grants, ids, errors, rate limits, settings, jobs, realtime topic                |
| `…200_people`            | Profiles, settings, terms, Haven staff, restrictions, sign-up, the auth hook                |
| `…300_media`             | One row per file, upload slots, buckets                                                     |
| `…400_notifications`     | Notifications, preferences, phones                                                          |
| `…500_social`            | Friend requests, friend links, friendships, blocks, the privacy rules                       |
| `…600_communities`       | Communities, members, roles, permissions, invites, bans, audit log                          |
| `…700_channels_messages` | Channels (a conversation is a channel), the access rule, messages, reactions, link previews |
| `…800_safety`            | Community reports, platform cases, decisions, evidence, CSAM handling                       |
| `…900_operations`        | Flair, profile card, deleting an account, feature flags, introductions, OTA                 |

## Errors

`private.fail(kind, reason, message)` is the only way an RPC refuses.

| kind              | HTTP | Postgres code |
| ----------------- | ---- | ------------- |
| `unauthenticated` | 401  | `PT401`       |
| `forbidden`       | 403  | `42501`       |
| `not_found`       | 404  | `PT404`       |
| `conflict`        | 409  | `PT409`       |
| `rate_limited`    | 429  | `PT429`       |
| `invalid`         | 400  | `22023`       |

The client gets `message` (a sentence to show) and `details` (the reason, for
example `username_taken`, `cannot_send`, `missing_permission`). Apps switch on
`details`, never on the sentence. A thing the caller may not know exists is
reported as `not_found`, not `forbidden`: a hidden channel, a community you
are not in, a report about you.

## Ids and paging

Every id is a time-ordered UUID (version 7, RFC 9562) from
`private.uuid_v7()`. Sorting by id is sorting by creation time, so a page of
messages is one index scan and "newer than X" is `id > X`. PostgreSQL 18 has
`uuidv7()` built in; the function body becomes that call when the project
moves to 18.

## Tables: how each is read and written

"RLS" means a direct `select` filtered by a policy. Every write is an RPC.

### People

| Table                  | Read                                                                                             | Written by                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `profiles`             | `get_profiles`, `get_profile_card`, `find_user`; `get_my_profile`; `username_taken` (signed out) | sign-up trigger, `update_my_profile`, `set_my_avatar`, `set_active_flair` |
| `user_settings`        | RLS: own row                                                                                     | `update_my_settings`                                                      |
| `terms_versions`       | RLS: anyone signed in                                                                            | operator                                                                  |
| `terms_acceptances`    | RLS: own rows                                                                                    | sign-up trigger, `accept_terms`                                           |
| `platform_staff`       | RLS: staff, with a second factor                                                                 | operator (no RPC makes someone staff)                                     |
| `account_restrictions` | RLS: staff, with a second factor. The person reads theirs through `list_decisions_about_me`      | `staff_record_decision`, `staff_reverse_decision`                         |

**Staff have two accounts.** A `platform_staff` row's `user_id` is a staff
account: it does staff work and nothing else, because `require_user`, the
first line of everything a person does, refuses it (`staff_account`), active
or not. Its `person_id` is the staff member's own account: it carries the
staff badge so people see staff in their communities, and gains no powers.
An account is one or the other, never both (`private.check_staff_link`).
Staff work needs a session signed in with a second factor (an authenticator
app, `aal2`): `require_staff` refuses without one
(`second_factor_required`), and every staff read checks it
(`private.is_staff_session`, `private.has_second_factor`).

The access-token hook marks a staff account's token `staff_account: true`, so
the apps sign it out the moment sign-in returns, before anything loads
(`isStaffAccountToken` in `packages/shared`), and the staff site can refuse
everyone else. The claim is for clients only; nothing in the database reads
it. The hook cannot refuse the first password sign-in, because the
authenticator check needs that session, but it refuses to refresh a staff
session that never completed the check, so one opened anywhere else ends
within a token lifetime.

Everyone's view of a person is `profile_record` (name, picture, staff badge).
What only the person sees of their own profile (bio, the flair they chose) is
`get_my_profile`. `update_my_settings` keeps every setting it is not given,
so a new setting is one more argument. The privacy rules are settings (see
"Who may reach whom").

A profile has no foreign key to Supabase Auth. Deleting the login blanks the
profile and keeps the row, so a report, a ban or the other side of a
conversation still has something to point at. No table needs "on delete set
null" for a person.

### Files

| Table   | Read                                 | Written by                                              |
| ------- | ------------------------------------ | ------------------------------------------------------- |
| `media` | inside a message record; storage RLS | `create_upload`, then `send_message` or `set_my_avatar` |

Uploading is two steps. `create_upload` hands out a slot (a row and a path,
`<owner id>/<file id>`). Storage accepts an upload only into a pending slot,
only from its owner. Attaching checks the file is really there and takes size
and type from what storage received. Nobody can replace or delete a stored
file: there is no such storage policy.

Buckets: `media` (private), `avatars` (public), `evidence` (private, staff),
`previews` (public), `ota-bundles` (public).

### Notifications

| Table                      | Read          | Written by                                                             |
| -------------------------- | ------------- | ---------------------------------------------------------------------- |
| `notifications`            | RLS: own rows | `private.notify` (the only place one is created), `mark_notifications` |
| `notification_preferences` | RLS: own rows | `set_notification_preference`                                          |
| `push_devices`             | RLS: own rows | `register_push_device`, `unregister_push_device`                       |

The words of a notification are written once, in the row, so the inbox and
the phone say the same thing. Safety notices (a report's outcome, a
moderation decision) cannot be turned off. A notification is deleted 90 days
after it was made.

### Friends and blocks

| Table             | Read                      | Written by                                                                        |
| ----------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `friend_requests` | RLS: sender and recipient | `send_friend_request`, `answer_friend_request`                                    |
| `friendships`     | RLS: the two friends      | accepting a request, `remove_friend`                                              |
| `blocks`          | RLS: the blocker only     | `block_user`, `unblock_user`                                                      |
| `friend_links`    | RLS: the owner only       | `create_friend_link`, `revoke_friend_link`, `answer_friend_link`, the daily sweep |

A request row exists only while it waits. One row per friendship, smaller id
first. A block ends the friendship and looks like "no such person" from the
other side.

**Friend links.** A person's own invitation to be friends, handed to whoever
they choose. Opening one (`get_friend_link`) only shows who it is from; the
owner is not told. Then the person who opened it answers
(`answer_friend_link`): accepting makes them friends, uses the link once and
tells the owner who; declining uses nothing and tells the owner only
"Someone declined your friend link", once per person
(`private.friend_link_declines`, which nothing in the API can read). So a
link posted somewhere cannot make anyone friends by a click. A link is good
for one use and a week unless asked otherwise, at most 30 days. The daily
sweep tells the owner about a link that expired before it was used up, and
drops links a week after they expire. Every way a link can fail (expired,
used up, revoked, a block between the two) is the same `link_invalid`.

### Who may reach whom

Three rules, all in `user_settings`, all on one scale (`public.audience`):

| Rule                   | Decides                       | Default   |
| ---------------------- | ----------------------------- | --------- |
| `details_visible_to`   | who sees the bio and flair    | `friends` |
| `dms_from`             | who can start a conversation  | `friends` |
| `friend_requests_from` | who can send a friend request | `nobody`  |

`nobody`, `friends`, `community`, `everyone`: each step includes the ones
before it, so `community` is friends and anyone who shares a community. A
friend request rule of `friends` means nothing and is refused. A block beats
every rule. The defaults are closed on purpose; a person opens up by choice.

`private.audience_allows` is the only place the scale is read, and
`can_see_details`, `can_message` and `can_friend_request` are the only
callers. A new rule is a column, a `can_` function and one more argument to
`update_my_settings`.

Some things work whatever the rule says, because the person already said
yes: asking back someone who asked you first, and a friend link the person
handed out. A conversation that exists stays open while either person's
`dms_from` lets the other in, so you can always answer someone you let
message you; when neither does (a friendship ended between two people on
`friends`) it closes for both from the next message, and stays readable.

The app never works the rules out. `get_profile_card` says `can_message` and
`can_friend_request`, asked the same way the RPCs ask, so a screen offers
only what will work.

### Communities

| Table                                       | Read                  | Written by                                                                              |
| ------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------- |
| `communities`                               | RLS: members          | `create_community`, `update_community`, `transfer_ownership`, `delete_community`        |
| `community_members`                         | RLS: members          | `join_community`, `leave_community`, `kick_member`, `ban_member`, `set_nickname`        |
| `roles`, `role_permissions`, `member_roles` | RLS: members          | `create_role`, `update_role`, `delete_role`, `set_role_permissions`, `set_member_roles` |
| `channel_categories`                        | RLS: members          | `save_category`, `delete_category`                                                      |
| `collapsed_categories`                      | RLS: own rows         | `set_category_collapsed`                                                                |
| `invites`                                   | RLS: `manage_invites` | `create_invite`, `revoke_invite`                                                        |
| `community_bans`                            | RLS: `manage_bans`    | `ban_member`, `unban_member`                                                            |
| `community_audit_log`                       | RLS: `view_audit_log` | the RPCs above; rows are only ever added                                                |

Ownership is `communities.owner_id`, not a role. The owner has every
permission, is always a member (a deferred foreign key), and cannot be
removed. Everyone else has what their roles plus the everyone role allow.
Rank is the highest role position held. Someone managing roles or members can
only act on what is ranked below them and can only hand out permissions they
hold themselves.

The fourteen permissions: `view_channels`, `send_messages`,
`manage_channels`, `manage_channel_permissions`, `manage_messages`,
`manage_members`, `manage_roles`, `manage_community`, `manage_invites`,
`manage_bans`, `create_reports`, `manage_reports`, `view_hidden_messages`,
`view_audit_log`. An app asks once with `get_my_permissions(community)`.

### Channels and conversations

| Table                  | Read                              | Written by                                                                      |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `channels`             | RLS: channels the caller can see  | `create_channel`, `update_channel`, `move_channel`, `delete_channel`, `open_dm` |
| `channel_participants` | RLS: own conversations            | `open_dm`                                                                       |
| `channel_overwrites`   | RLS: `manage_channel_permissions` | `set_channel_overwrite`                                                         |
| `channel_user_state`   | RLS: own rows                     | `mark_channel_read`, `mute_channel`, sending                                    |

A direct conversation is a channel of kind `dm` with two participants. It
uses the same send, list, read-mark and mute RPCs as a community channel.

**Who can see, send in and manage a channel is one definition**, the view
`private.channel_access`. RLS, every RPC check and every realtime audience
read it:

1. the owner can do everything;
2. else an exception for this member decides;
3. else exceptions for the member's roles decide, and a "no" from any role
   beats a "yes" from another;
4. else an exception for the everyone role decides;
5. else the community-wide permission decides.

Sending and managing also need seeing. In a conversation, sending needs
either person's `dms_from` to let the other in ("Who may reach whom").

`channels.latest_message_id` is a high-water mark, so "is there anything
unread" is one comparison of ids. `get_unread_counts` counts up to 100.

**Voice.** The database decides who may join a voice channel; the voice
service holds who is talking. There is no voice table. The `voice-token`
function calls `get_voice_access(channel)` as the person asking, which also
says who they are, so the token is made in the database's name for them.
`send_voice_control(channel, person, session, action)` mutes, deafens or
removes one session: anyone for their own, `manage_members` and a higher rank
for someone else's. Apps call it through the `voice-control` function, which
for `remove` also disconnects the person at the voice service, because a
modified app could ignore the message.

### Messages

| Table               | Read                                                   | Written by                                       |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| `messages`          | `list_messages`, `get_messages`, `get_latest_messages` | `send_message`, `edit_message`, `delete_message` |
| `message_reactions` | inside the message record                              | `set_reaction`                                   |
| `link_previews`     | inside the message record                              | sending and editing; the preview worker          |

One shape for a message everywhere, `public.message_record`: every read
returns it and every realtime event carries it. Files, reactions and the link
preview are inside it, so a change to any of them is "this message changed".

The app names each send with a nonce (a random UUID), passed to
`send_message` and stored on the message. The record carries it back, so the
app can swap the copy it showed for the stored one. The same nonce from the
same person again is a retry: it returns the message already made, without
counting against the rate limit, and two at once still make one message
(a unique index on `(author_id, nonce)`). The id stays the database's;
ids are time-ordered, and the app's clock is not trusted with that.

Messages are deleted for real. Nothing of the text is kept except in a safety
report or case that was already filed about it. While someone is banned from
a community their messages there are hidden from everyone without
`view_hidden_messages`; that is worked out when read, not stored.

### Safety

| Table                     | Read                                              | Written by                                                                          |
| ------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `community_reports`       | `list_community_reports`, `list_my_reports`       | `file_community_report`, `set_community_report_status`, `escalate_community_report` |
| `community_report_notes`  | RLS: report readers                               | `add_community_report_note`                                                         |
| `platform_cases`          | RLS: staff. Reporter: `list_my_reports`           | `file_platform_case`, escalation, the scanner, the `staff_*` RPCs                   |
| `platform_case_events`    | RLS: staff                                        | every step; rows are only ever added                                                |
| `platform_case_decisions` | RLS: staff. The person: `list_decisions_about_me` | `staff_record_decision`, `staff_reverse_decision`                                   |
| `case_media`              | RLS: staff                                        | opening a case                                                                      |

The product rules are in [REPORTING.md](REPORTING.md). What the database
adds:

- **Nobody handles a report about themselves.** A moderator does not see, hear
  about or act on a report about them; the same for a staff member and a case
  about their staff account or their own account. Two functions hold that rule
  (`private.can_read_report`, `private.can_read_case`, which asks
  `private.staff_is`). Staff also do not decide a case their own account
  filed (`own_case`).
- **The database writes the evidence.** The snapshot (the message, ten before
  and after, who and where) is taken when the report is filed, by the
  database. A case holds the message's files; while it does, nothing deletes
  them.
- **Looking at evidence leaves a record.** Storage serves a case file only to
  a staff member who logged a view of that file in the last ten minutes
  (`staff_view_case_media`).
- **Apparent CSAM.** Flagging withholds the files from everyone except a CSAM
  reviewer, queues them to be moved to the `evidence` bucket, takes the
  content down, and starts a one-year hold (18 U.S.C. 2258A(h)). The hold is
  a trigger, so it also stops the service role and a person at a SQL prompt.
- **A restriction is one row.** A suspension or ban is a row in
  `account_restrictions`. Writes are refused because of it and sign-in is
  refused because of it. Nothing is written into Supabase Auth's tables.

### Operations

| Table                                         | Read                   | Written by                                     |
| --------------------------------------------- | ---------------------- | ---------------------------------------------- |
| `flairs`                                      | RLS: anyone signed in  | operator                                       |
| `user_flairs`                                 | RLS: own rows          | joining a community, an introduction, operator |
| `flair_grant_rules`                           | not readable           | operator                                       |
| `feature_flags`, `feature_flag_overrides`     | `get_my_feature_flags` | operator                                       |
| `onboarding_campaigns`, `onboarding_progress` | `list_my_onboarding`   | operator; `answer_onboarding`                  |
| `ota_releases`                                | service role only      | release tooling                                |

## Realtime

One private topic per person: `user:<their id>`. The database works out who
should hear about a change and sends the event to each of those topics
(`private.broadcast`). The policy on `realtime.messages` lets a person join
their own topic and no other.

Why not a topic per channel or community: Supabase checks topic access when a
client joins and caches the answer until the token refreshes. Someone removed
from a channel would keep hearing it. Choosing the audience at send time
means they stop on the very next event.

Tables whose rows everyone in the audience may see announce themselves by
trigger. Messages are announced by the RPC that changed them.

| Event                                   | Sent to                                                                          | Carries                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `message.created` `.updated` `.deleted` | people who can see the channel                                                   | message record (`{id, channel_id}` for deleted)                                                             |
| `channel.created` `.updated` `.deleted` | people who can see the channel                                                   | the channel row                                                                                             |
| `channel.read`                          | the person's own devices                                                         | `{channel_id, last_read_message_id}`                                                                        |
| `community.updated` `.deleted`          | members                                                                          | the row (`{id}` for deleted)                                                                                |
| `role.*`, `category.*`                  | members                                                                          | the row                                                                                                     |
| `member.joined` `.updated` `.left`      | members, and the person who left                                                 | the membership row                                                                                          |
| `member.banned` `.unbanned`             | members                                                                          | `{community_id, user_id}`                                                                                   |
| `access.changed`                        | members                                                                          | `{community_id}`                                                                                            |
| `profile.updated`                       | the person, shared communities, friends, waiting requests, conversation partners | profile record                                                                                              |
| `friend_request.*`, `friendship.*`      | both people                                                                      | the row                                                                                                     |
| `block.created` `.deleted`              | the blocker only                                                                 | the row                                                                                                     |
| `friend_links.changed`                  | the owner's devices                                                              | `{}`                                                                                                        |
| `notification.created`                  | the recipient                                                                    | the notification row                                                                                        |
| `notifications.changed`                 | the recipient                                                                    | `{}`                                                                                                        |
| `report.created` `.updated`             | report readers, never the person reported                                        | report record (no reporter)                                                                                 |
| `case.changed`                          | staff, never the person the case is about                                        | `{id}`                                                                                                      |
| `account.changed`                       | the person's own devices                                                         | `{}`                                                                                                        |
| `account.restricted`                    | the person                                                                       | `{ends_at}`                                                                                                 |
| `voice.control`                         | the person whose session it is                                                   | `{channel_id, community_id, channel_name, target_user_id, target_session_id, actor_id, actor_name, action}` |

`account.changed` means "something in your own account changed": settings,
the private part of the profile, terms accepted, flairs, feature flag
overrides, introductions answered. Each of those tables announces itself
by trigger, whoever wrote it, once per statement; the app loads the whole
account again. A new part of the account adds its table to those triggers.

`access.changed` means "what you may see or do in this community may have
changed": the app reloads that community's roles, permissions and channels.
It is sent once per statement, not once per row. A message from a banned
member goes only to people with `view_hidden_messages`.

Delivery is not guaranteed (Supabase Broadcast drops events to a client that
is offline). Apps reload on reconnect; ids make "what is newer than what I
have" a cheap question.

**Voice presence** is the only other topic: `voice:<channel id>`. Joining
needs the right to see the channel, and presence is the only thing a client
may send on it.

## Jobs and workers

Anything the database cannot do itself is a row in `private.jobs`. A worker
(an Edge Function with the service role) claims rows of its kind, does the
work, and reports back. Claiming is safe for several workers at once; a job
whose worker died is handed out again when its lease runs out; a failed job
retries with a growing delay and stops after eight attempts.

| Job kind           | Worker                   | Payload                             | RPCs the worker uses                                     |
| ------------------ | ------------------------ | ----------------------------------- | -------------------------------------------------------- |
| `push_send`        | `push-worker`            | `{notification_id}`                 | `worker_push_delivery`, `worker_push_token_invalid`      |
| `email_send`       | `mail-worker`            | `{template, case_id, decision_id?}` | `worker_email_content`                                   |
| `link_preview`     | `link-preview-worker`    | `{preview_id}`                      | `worker_link_preview_url`, `worker_link_preview_result`  |
| `media_delete`     | `media-worker`           | `{media_id}`                        | `worker_media_to_delete`, `worker_media_deleted`         |
| `media_quarantine` | `media-worker`           | `{media_id}`                        | `worker_media_to_quarantine`, `worker_media_quarantined` |
| `media_scan`       | `scan-worker` (none yet) | `{media_id}`                        | `worker_record_media_scan`                               |

All workers use `worker_claim_jobs(kind)` and `worker_finish_job(id, error)`.
The code is in `supabase/functions/` (see its README). There is no
`scan-worker` until a scanner vendor is chosen; `media_scan` jobs are only
queued once `private.set_setting('media_scan', 'on')` is set.
A new job wakes its worker over HTTP at once (at most once every two seconds
per worker); a cron job wakes any worker with work waiting once a minute, as
the fallback.

## Replacing the hosted database

The rebuild replaces the hosted project's schema and data (there were no real
users; see 2026-11-24). Checked against the hosted project that day: 128 old
migrations, 21 accounts, buckets `message-media`, `link-preview-images`,
`dm-message-media`, `profile-avatars` and `ota-bundles` (827 objects), four
old cron jobs, eight old Edge Functions, and the open realtime policy.

1. **Back up**, outside every repo (the data holds account emails). The CLI
   does not create the folder, and `db dump` runs `pg_dump` in a container, so
   Docker Desktop must be running: `mkdir -p ~/haven-backups` first, then
   `npx supabase db dump --linked -f ~/haven-backups/hosted-schema.sql`, and
   again with `--data-only -f ~/haven-backups/hosted-data.sql`. Download any
   stored files worth keeping from the dashboard.
2. **Stop the old cron jobs** (SQL editor): `select cron.unschedule(jobname) from cron.job;`
3. **Empty and delete every old bucket** (Storage, each bucket: Empty, then
   Delete). Required: the migrations create `ota-bundles` without
   `on conflict`, so an existing one stops them. SQL cannot delete stored
   files on the hosted project; use the dashboard.
4. **Reset.** From a checkout of this branch, linked to the project:
   `npx supabase db reset --linked --no-seed`. It drops the old schema and
   applies `supabase/migrations/` from the start.
5. **Check it took** (SQL editor). Expect 9 migrations, the two new cron jobs,
   only the `haven_user_created`/`haven_user_deleted` triggers on
   `auth.users`, and only the new realtime policies:
   ```sql
   select count(*) from supabase_migrations.schema_migrations;
   select jobname from cron.job;
   select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
   select policyname from pg_policies where schemaname = 'realtime';
   select id from storage.buckets;
   ```
   If an old realtime policy is still there, drop it:
   `drop policy "authenticated can receive broadcasts" on realtime.messages;`
   (and the same for `"authenticated can receive private_user broadcasts"`).
   On 2026-11-24 the reset did all of this by itself: 9 migrations, the two
   new cron jobs, the new triggers and policies, the five new buckets.
6. **Old accounts.** The reset also emptied `auth.users` (0 rows on
   2026-11-24), so everyone signs up again. If accounts are still there, run
   `delete from auth.users;` (the new delete trigger erases each one).
7. **Edge Functions.** Delete the old ones:
   `npx supabase functions delete voice-ice`, then `message-media-maintenance`,
   `link-preview-backfill`, `report-alert`, `expo-push-worker`. A reset
   keeps function secrets; `npx supabase secrets list` shows which are set
   (names and hashes only). `RESEND_API_KEY` and the `LIVEKIT_` three carried
   over on 2026-11-24. `EXPO_ACCESS_TOKEN` is optional and was left unset;
   the old `HAVEN_EXPO_ACCESS_TOKEN`, `HAVEN_WEB_PUSH_VAPID_*` and `XIRSYS_*`
   are read by nothing now. The worker secret is step 2 below. Deploy the new
   set: `npx supabase functions deploy push-worker mail-worker link-preview-worker media-worker voice-token voice-control update-manifest`.
8. Then "Setting up a project" below, steps 1–3 and 5.

The live web app (`main`) and installed builds stop working at step 4 until
the rebuild is promoted and released.

## Setting up a project

After the migrations are applied to a hosted project:

1. **Auth hook.** Dashboard, Authentication, Hooks, Customize Access Token:
   point it at `public.auth_hook_access_token`. Locally this is in
   `supabase/config.toml`. `npm run test:db:auth-hook` proves it is on.
2. **Workers.** `node tooling/scripts/hosted/set-worker-secret.mjs` does
   this for the linked project: it sets `edge_base_url` and a new random
   `worker_secret` in the database and the same value as the functions'
   `HAVEN_WORKER_CRON_SECRET`, without printing it. Run it again to rotate.
   By hand it is
   `select private.set_setting('edge_base_url', 'https://<ref>.supabase.co/functions/v1');`,
   `select private.set_setting('worker_secret', '<secret>');` and the same
   secret (16 characters or more) as `HAVEN_WORKER_CRON_SECRET`. Until both
   settings are set the database queues jobs and calls nobody. To check both
   sides match, compare the hash `npx supabase secrets list` shows with
   `select encode(extensions.digest(decrypted_secret, 'sha256'), 'hex') from vault.decrypted_secrets where name = 'haven.worker_secret';`.
3. **Staff.** Authentication, Multi-Factor: the authenticator app (TOTP) must
   be on for enrolling and verifying (locally it is in `supabase/config.toml`).
   Make a new account for the staff work, then
   `insert into public.platform_staff (user_id, person_id, can_review_csam, note) values (<staff account>, <their own account>, ...)`.
   The staff account enrolls an authenticator app before it can do anything.
4. **Scanner (when there is one).** `select private.set_setting('media_scan', 'on');`
5. **Realtime.** Private channels only. The current hosted project also has a
   hand-added policy `authenticated can receive broadcasts` with the condition
   `true`; it must be dropped, or anyone signed in may join any topic.
6. **Signing keys.** Settings, JWT Keys. Tokens are trusted because only
   Supabase can sign them. The hosted project signs with an ES256 key, but
   (checked 2026-11-18) the legacy `anon` key is still enabled, so the old
   shared JWT secret is still trusted, and anyone holding it can mint any
   token. Close it: give the apps the `sb_publishable_` key and the functions
   an `sb_secret_` key (they read `SUPABASE_SERVICE_ROLE_KEY` today, so that
   part is a code change), disable the legacy `anon` and `service_role` keys,
   wait at least 1 h 15 min, then revoke the legacy secret under
   "Previously used".

## Tests

`npm run test:db` rebuilds the local database and runs fourteen suites
(`supabase/tests/sql/`), each in its own transaction. Fixtures are built
through the same RPCs the apps call.

`npm run test:db:mutations` proves the suites: each line of
`supabase/tests/mutations/*.txt` breaks one rule, runs the suite that guards
it, and expects the suite to fail. 600 breaks on 2026-11-13, none survive
(the command prints the current count). A break that
survives means a rule nothing tests; add the assertion, do not delete the
line. See [supabase/tests/README.md](../../supabase/tests/README.md).

The layers above the database have their own tests, run against the same
local stack after `npm run test:db`:

| Command                            | What it proves                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run test:functions`           | Each Edge Function against the real database and storage; outside services stood in for locally |
| `npm run test:functions:mutations` | Breaks each function rule (`supabase/functions/tests/mutations.txt`) and expects a test to fail |
| `npm run test:backend`             | The shared backend clients, signed in as the fixture people, including realtime delivery        |

## Decisions and their reasons

| Decision                                          | Reason                                                                                                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Internals in a schema the API does not expose     | Supabase, [Hardening the Data API](https://supabase.com/docs/guides/database/hardening-data-api): keep anything not meant for clients out of the exposed schema                                           |
| Default privileges revoked                        | Supabase grants every new object in `public` to `anon` and `authenticated`; one forgotten RLS policy would then be an open table                                                                          |
| Writes only through RPCs                          | A rule that spans tables (rank, "hold it yourself", rate limits, audit) cannot be stated as a row policy; an RPC states it once                                                                           |
| Messages read through RPCs                        | Access is checked once per page instead of once per row, and every reader gets the same record                                                                                                            |
| Version 7 ids                                     | RFC 9562. Time-ordered ids make paging and "newer than" an index comparison and keep inserts at the end of the index                                                                                      |
| Errors as status + reason                         | [PostgREST](https://docs.postgrest.org/en/stable/references/errors.html) turns a raised `PTxxx` code into that HTTP status                                                                                |
| One topic per person                              | Realtime [authorization](https://supabase.com/docs/guides/realtime/authorization) is checked at join and cached; per-person topics with the audience chosen at send time cannot leak after access is lost |
| `(select auth.uid())` in policies                 | Supabase [RLS performance](https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations): evaluated once per query, not once per row                             |
| Restriction enforced by a row and an auth hook    | No writes into Supabase Auth's own tables, which Supabase may change; [custom access token hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)                               |
| `p_` on every RPC parameter                       | In a SQL function a column silently wins over a parameter of the same name                                                                                                                                |
| A refused call does not count toward a rate limit | The refusal rolls the transaction back, and the counted attempt with it. Limits bound how fast a thing can be done, not how often it can be tried                                                         |

### Product choices made while building (change any of them)

These were not specified anywhere. Each is one obvious place in the SQL.

- Deleting an account deletes the person's messages and files everywhere and
  leaves a blank profile. Files held by a safety case stay.
- `delete_my_account` is refused while the person owns a community with other
  members. If the login is deleted another way, the community goes to its
  highest-ranked, longest-standing member.
- Moderators are not told who filed a community report. Staff are, once it is
  escalated.
- A reporter is told when their community report is closed, not what was
  decided.
- You can only change the roles of members ranked below you.
- Invites are on by default for a new community.
- Privacy starts closed: details and conversations for friends, friend
  requests from nobody.
- A friend link is answered, never taken: opening one shows who it is from,
  and a decline is reported to the owner without the name.
- Notifications are kept 90 days. Cases and their evidence are kept
  indefinitely (privacy policy 5.3).
- A restricted person keeps read access through RLS until their token expires
  (at most an hour); every RPC refuses them immediately.
- Permission names changed from the old schema: `create_channels` folded into
  `manage_channels`; `manage_server` is `manage_community`;
  `can_view_ban_hidden` is `view_hidden_messages`; `view_audit_log` is new;
  refreshing a link preview needs authorship or `manage_messages`.

## What follows

Not done, in the order it makes sense to do it:

Done: the database, the dev seeds, the Edge Functions
(`supabase/functions/`), the generated types, the shared backend clients
(`packages/shared/src/lib/backend/`), the collections and `HavenCore` over
them ([COLLECTIONS.md](COLLECTIONS.md)), and desktop, web and mobile on them.
Left: **a scanner** (`scan-worker`) once a vendor is chosen.

The old migrations and suites are in git history before this change.
