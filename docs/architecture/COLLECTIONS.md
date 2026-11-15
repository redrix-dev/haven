# Collections: the app's copy of the database

> Status: agreed design (2026-11-14), being built. It replaces the nexuses
> (`packages/shared/src/nexus/`). Built so far, in
> `packages/shared/src/collections/`: the kit (`rows`, `requests`, `events`,
> `deviceCopies`, `ids`, plus `StatePort` and `LoadGate` moved from the nexus
> kit), and the `channels`, `messages`, `communities`, `members`, `roles`,
> `categories`, `profiles`, `social`, `notifications`, `account`, `reports`,
> `cases` and `session` collections, `attachments` and `voice`, and the new
> `HavenCore` over them (`collections/core/`). Desktop and web run on it
> (`packages/solid-client`). Mobile does not yet: until it moves, the old
> `core/havenCore.ts` and `NEXUS_RECIPE.md` describe the code mobile runs.

The apps keep a copy of the records the person can see, kept current by
realtime events. This document is the shape of that copy. It follows the
database ([DATABASE.md](DATABASE.md)): one collection per kind of record the
database hands out, named and shaped the way the database names them.

## Why it changes

The nexuses grew around screens. Each one mixes four things that age
differently:

| Mixed into one nexus today | Where it goes                       |
| -------------------------- | ----------------------------------- |
| Records from the server    | a **collection**                    |
| Indexes over those records | **selectors**, worked out when read |
| What the person is doing   | **session state**                   |
| Whether a load is running  | **request status**, per request     |

They also save every change to the device as one JSON blob, which brings the
problems Slack wrote about when it stopped
([Making Slack faster by being lazy, part 2](https://slack.engineering/making-slack-faster-by-being-lazy-part-2/)),
and keeps text the database has deleted. And since a direct message became a
channel, the community-message and direct-message nexuses are one thing
written twice.

Other chat apps settle on the same split: Discord's per-type stores,
Mattermost's entities, Linear's object pool, and TanStack's line between
server state and client state.

## The parts

**A collection** holds one kind of record by id, for example `channels`,
`messages`, `members`, `profiles`. It:

- loads rows through the backend clients (`packages/shared/src/lib/backend/`)
  and writes them as the database sent them;
- applies the realtime events about its own records (`message.created`,
  `message.deleted`, and so on);
- holds no UI state and no copies of other collections' records. Anything
  that combines records is a selector.

**Channels** (`collections/channels/`) hold every channel the person can
see, conversations included, with their own read mark, mute and unread
count on each. The database sends no channel event when a channel's newest
message changes, so a new message moves `latest_message_id` here, and counts
as unread unless it is the person's own (sending reads, as in the database).

**Messages** (`collections/messages/`) are one collection for every channel,
direct messages included. A channel that has been opened has a window: its
loaded ids oldest first, and whether it reaches the oldest and the newest
message. A new message joins a window that reaches the newest; one scrolled
back in history picks it up when it pages forward. At most `MAX_WINDOWS`
(20) are held; opening another lets go of the one opened longest ago, but
keeps its newest message, which sidebars show. After a reconnect, each open
window is reloaded from its newest page, which is taken as the truth: a
message deleted while away is gone from it.

A message being sent shows at once, as an **outgoing** message named by a
nonce the app makes (a random UUID). The database stores the nonce with the
message, and the stored message carries it back in the reply and in
`message.created`; whichever comes first replaces the outgoing one, and so
does a page that holds it. A refused send stays outgoing with its
`HavenError` until it is retried, under the same nonce, or discarded. A
retry of a send that did go through gets the same message back, sent once.
The message id is still the database's: ids are time-ordered, and a phone's
clock cannot be trusted with that. Outgoing messages are not saved to the
device, like any message text.

**Communities** (`collections/communities/`) hold the communities the person
belongs to, what they may do in each (`get_my_permissions`, never worked out
in the app), and, for people who manage them, invites. One backend call loads
what a member needs to show a community: its members, roles and categories.
Those rows belong to **members**, **roles** and **categories**, so
`Communities` hands each of them its part (each is a `CommunityPart`), and
tells them when a community is gone: deleted, left, removed, or missing from
the list when it loads again. `access.changed` is answered by loading the
community again (and its channels), because who holds which role and what
each role allows have no events of their own.

**Members** hold each community's memberships and nicknames, and the ban list
for people who manage bans. A ban ends the membership in the database, so it
does here too. **Roles** hold each community's roles, what each allows, and
who holds which; they are for showing roles, not for deciding what anyone may
do. **Categories** hold how each community's channels are grouped and which
groups the person collapsed (stored in the database, so every device agrees).

**Profiles** hold people as everyone sees them, fetched as they are needed
(`ensure` asks once per person), and the fuller card of someone being opened,
which says things about the viewer too and so is fetched each time.

**Social** holds the person's friendships, the requests waiting on either
side, the people they blocked, and their own friend links (loaded again on
`friend_links.changed`). Someone else's link is opened with `openLink`,
which only shows who it is from, into `openedLink`; both platforms ask the
same question from there, and the person accepts, declines or puts it away
(`answerOpenedLink`, `closeOpenedLink`). None of it is kept on the device.
**Notifications** hold the inbox, newest
first, the unseen count and the person's choices per kind. The database
sends `notification.created` for every notification, including ones not
meant for the inbox (`in_app` off); only inbox ones are added. Marking, here
or on another device, loads the inbox again.

**Account** (`collections/account/`) is the person's own account: settings,
what only they see of their profile (bio, the flair they chose), the terms they accepted, their flairs, feature flags, and the
introductions offered on this build. It loads as one `MyAccount`, and loads
again on `account.changed`, which the database sends to the person's own
devices when any part changes, by any path. So a new part of the account is
a field of `MyAccount` and a read in `loadMyAccount`, plus its table in the
`account.changed` triggers; the collection holds it as it is. Commands load
the account again after the database answers, except settings, whose new
row comes back. The privacy rules (who sees their details, who can message
them, who can send a friend request) are settings, changed with
`updateSettings`. A change to the profile goes through `account` and hands
back everyone's view of the person, for `profiles`. Whether the newest
terms are accepted, and which introduction comes next, are selectors; the
gates that use them are HavenCore's.

**Reports** (`collections/reports/`) hold what the person reported and the
staff decisions about them, and, for a community's moderators, that
community's reports and the notes on each one opened. Filing sends only what
is reported and why: the database writes the evidence. Moderators' lists stay
current from `report.created` and `report.updated`; a status, a note or an
escalation comes back as `report.updated`, this device included, so commands
do not patch. The person's own reports have no event and load again after
filing, on reconnect, and on a `report_outcome` or `moderation_decision`
notification. **Cases** (`collections/cases/`) are Haven staff's queue and
the case files they have open. Every case event sends `case.changed` to the
staff who may read it, which loads the queue again and the file if it is
open; commands wait for that load. Evidence opens one file at a time
(`viewMedia`), each view logged by the database, and the short-lived link is
not held. Neither is kept on the device.

**Session** (`collections/session/`) is what the person is doing on this
device: where they are (a community and its channel, a conversation, or
home), the channel last open in each community, and what they typed and did
not send (`body` and `reply_to_id`, cut to the database's 4000; attachments
are not kept). Nothing in it comes from the server. Screen state (which
dialog or tab is open) is the platform's and is not shared.

**Attachments** (`collections/attachments/`) hold links to the files on
messages. Message files are private, read through a signed link that
storage gives only to someone who may see the message, good for an hour.
A link is held in memory while it works and asked for again before it
stops; never on the device.

**Voice** (`collections/voice/`) is the call: which voice channel, muted or
deafened, who is in each channel (from the `voice:<channel id>` presence
topic), and the device's audio choices. It is not records, but it ends with
the session like them, and `voice.control` is applied to it. The media
connection itself (LiveKit, or the Linux sidecar) is the platform's.

**Request status** is a load's state (running, failed with which
`HavenError`, last finished at) kept by key next to the `LoadGate` that
dedupes it. A screen reads the status of the request it made. A load that
answers "this changed" (an event, or a command's own reload) uses `refresh`,
which never joins a load already running: that one started before the
change, and its answer is thrown away.

**HavenCore** (`collections/core/havenCore.ts`) builds the collections,
runs the session, owns the realtime subscription, and runs the commands that
touch more than one collection. The platform gives it `makePort` (its own
store for each collection), device storage, and where the app runs.

- **Signing in** puts back the device copies at once, joins the person's
  topic, and loads everything when the topic is listening, so no event falls
  between the load and the listening. If the topic takes longer than
  `CONNECT_WAIT_MS` (3 s) the load goes ahead, and runs again once it
  listens. Every reconnect loads everything again, open message windows and
  held profiles included: events sent while away are lost. `state` says
  `loading`, then `ready`, and whether the topic is `connected`.
- **A community gone** (left, removed, banned, deleted, or missing from a
  reload) is told by `communities` to its parts; the core is the last part,
  and takes the community's message windows, session place and drafts,
  channels and reports with it, then tells the platform.
- **`access.changed`** loads the community and its channels again; a channel
  no longer listed is forgotten everywhere, and a moderator who lost
  `manage_reports` loses that community's reports.
- **Across collections**: sending empties the draft; a profile or picture
  change goes into `profiles`; creating a community, or an introduction or
  invite that joins one, loads it with its channels; deleting a channel
  forgets its window, draft and place; opening a conversation with someone
  holds the channel and opens it.
- **Not records** go to the platform through `listen`: a community gone, the
  account restricted (the platform signs out and says why), a notification
  arriving (desktop plays a sound and shows a toast).
- **Signing out** (after the auth boundary ends the Supabase session) stops
  listening, empties every collection and removes this person's device
  copies. Work from the session that ended writes nothing.

Each platform makes the stores (`makePort`, typed by `StoreStates`) and
keeps them: desktop and web as `HavenSolidCore.stores`, live Solid store
proxies that screens read through the selectors. The old
`core/havenCore.ts`, over the nexuses, still runs mobile until it moves;
then it is deleted.

The platform seam stays as it is: shared code writes through `StatePort`, and
Solid and React only build the store and expose reads
([ARCHITECTURE.md](../ARCHITECTURE.md)).

## Events

`subscribeToMyEvents` hands HavenCore each event typed by `HavenEventMap`.
One table says which collection applies each event. The table is checked at
compile time: an event with no entry is a type error, so a new event in the
database cannot be dropped silently. An event the app deliberately ignores is
listed with the reason. The table is `HavenCore.eventTable`; today every
event is applied, none ignored. A handler that throws is logged and the next
event still arrives.

## Saving to the device

Opt-in, per collection and per piece of session state. A collection that
saves declares:

- a **name and a version**. A saved copy with another version is thrown away,
  not migrated;
- **what to keep**: a pick from its state, small on purpose.

The saved copy lives under a key with the person's id in it
(`haven:<user id>:<name>:v<version>`), so one account never reads another's.
Sign-out removes that person's keys. Writes are batched: a change marks the
copy dirty and it is written shortly after, or when the app goes to the
background, never on every change.

What is saved, for a fast first screen:

- the community list and each community's channels (`communitiesCopy`,
  `channelsCopy`), and their categories with which are collapsed
  (`categoriesCopy`), so the sidebar is laid out as it was left;
- the person's settings (`accountCopy`), so the first screen is in their
  theme;
- where the person was, the channel last open in each community, and their
  drafts (`sessionCopy`), so the app opens where it was left with the words
  still in the box.

What is never saved: message text, notifications, and anything a moderator or
staff can remove. The database deletes those for real, and a copy on the
device would keep them. If cold start on mobile measures slow, a message
cache can be added on purpose: encrypted, versioned, and cleared by
`message.deleted` and `access.changed`.

## Measuring

`perfTrace` ([PERF_TRACING.md](PERF_TRACING.md)) stays and grows:

- the sign-in phases (`BootstrapPhase`) and their spans stay;
- each collection load is a span named for the collection;
- each realtime event is a mark with its name and how long applying it took;
- each device write is a span with its size;
- desktop and web get the same switch mobile has, so every client can be
  measured the same way.

What gets saved changes when a measurement says so, not before.
