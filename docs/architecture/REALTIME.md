# Realtime: what each event does

Each signed-in person listens on one topic, `user:<id>`. The database sends
every event about what they can see there ([DATABASE.md](./DATABASE.md#realtime)
has the list, the audiences and the payloads). The only other topics are
voice presence, `voice:<channel id>`, joined while looking at or sitting in a
voice channel.

One table applies every event, the same on every platform:
`eventTable()` in
[`collections/core/havenCore.ts`](../../packages/shared/src/collections/core/havenCore.ts).

## The contract

- **An event carries the record.** A message event carries the whole message,
  with its files, reactions and link preview; a channel event the whole
  channel. Applying it is a write, not a fetch.
- **One event, one table row.** Most go to one collection. The few that
  touch more (a message also moves its channel's latest and unread; a
  community gone forgets its channels, windows, drafts and reports) are the
  core's.
- **Screens write through commands; events update everyone else.** A command
  puts the database's answer in its own collection; the event that follows
  reaches the person's other devices and other people.
- **Missed is reloaded.** Events sent while the topic was down are lost, so
  every reconnect loads everything again (`core.signIn`, BOOTSTRAP.md).

## The table

| Event                                        | Applied by                                                                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message.created`                            | `messages.applyCreated`, `channels.applyMessageCreated` (latest, unread), `profiles.ensure` the author                                                     |
| `message.updated`                            | `messages.applyUpdated`                                                                                                                                    |
| `message.deleted`                            | `messages.applyDeleted`, `channels.applyMessageDeleted`                                                                                                    |
| `channel.created` / `.updated`               | `channels.applyChannel` (a conversation is a channel)                                                                                                      |
| `channel.deleted`                            | `channels.applyChannelDeleted`, and its window, draft and place are forgotten                                                                              |
| `channel.read`                               | `channels.applyRead`: a read mark made on one device clears the badge on the others                                                                        |
| `community.updated`                          | `communities.applyCommunity`                                                                                                                               |
| `community.deleted`                          | `communities.applyGone`: access loss, below                                                                                                                |
| `role.created` / `.updated` / `.deleted`     | `roles.applyRole` / `applyRoleDeleted`                                                                                                                     |
| `category.created` / `.updated` / `.deleted` | `categories.applyCategory` / `applyCategoryDeleted`                                                                                                        |
| `member.joined`                              | Someone else: `members.applyMember`. The person, on another device: their communities load again                                                           |
| `member.updated`                             | `members.applyMember`                                                                                                                                      |
| `member.left`                                | Someone else: `members.applyLeft`, `roles.applyLeft`. The person: access loss, below                                                                       |
| `member.banned`                              | `members.applyBanned`; `messages.applyBanned` hides their messages, or marks them hidden for those who may see them                                        |
| `member.unbanned`                            | `members.applyUnbanned`                                                                                                                                    |
| `access.changed`                             | The community's structure and channels load again; its reports too, or are forgotten without `manage_reports`                                              |
| `profile.updated`                            | `profiles.applyProfile`                                                                                                                                    |
| `friend_request.created` / `.deleted`        | `social.applyRequest` / `applyRequestDeleted`                                                                                                              |
| `friendship.created` / `.deleted`            | `social.applyFriendship` / `applyFriendshipDeleted`                                                                                                        |
| `block.created` / `.deleted`                 | `social.applyBlock` / `applyBlockDeleted`                                                                                                                  |
| `friend_links.changed`                       | `social.loadLinks`                                                                                                                                         |
| `notification.created`                       | `notifications.applyCreated`; a report outcome or decision reloads the person's reports; the platform's `notification` listener (desktop: sound and toast) |
| `notifications.changed`                      | `notifications.load`                                                                                                                                       |
| `report.created` / `.updated`                | `reports.applyCreated` / `applyUpdated`                                                                                                                    |
| `case.changed`                               | `cases.applyChanged` (Haven staff)                                                                                                                         |
| `account.changed`                            | `account.load`                                                                                                                                             |
| `account.restricted`                         | The platform's `restricted` listener: it signs out and says why                                                                                            |
| `voice.control`                              | `voice.applyRemoteControl`                                                                                                                                 |

## Access loss

Leaving (here or on another device), being removed or banned, and a community
being deleted all end with the person no longer in it: `member.left` for them,
or `community.deleted`. `communities.applyGone` tells each part to let go
(members, roles, categories), then the core forgets the community's channels,
windows, drafts, place and reports, and calls the platform's `communityGone`
listener, which leaves its voice channel and says so (desktop:
`CommunityAccessLossHost`; mobile: `MainNavigator`). The screen on it moves
off once the community is no longer in the store.

Losing one channel, or what the person may do, arrives as `access.changed`:
the community reloads, and a channel no longer there is forgotten.
