# Backlog — known debt & future designs

Work that is understood, deliberately deferred, and written down so it doesn't have
to be rediscovered. Each entry says why it's deferred and what would trigger it.
When an item ships, delete it here (the change records itself in git).

---

## Repo hygiene

### Retire the re-export shims
Several modules in `packages/shared` keep a second import path alive via one-line
`export *` shims (marked with a `Re-export shim:` comment — grep for it). Pick the
canonical path, codemod the handful of importers, delete the shims.
*Trigger: any convenient moment; ~30 minutes.*

### Workspace packages milestone
The alias → workspace-package conversion. Decided, not scheduled — full sequencing
rules in [SOLID_REBUILD.md](./SOLID_REBUILD.md#standing-decision--workspace-packages).

### React hooks linting on mobile
`eslint-plugin-react-hooks` was registered for months with zero rules enabled (and
has been removed). Adding it back **with** `rules-of-hooks`/`exhaustive-deps` scoped
to `apps/mobile` may surface real bugs — budget time for what it finds.
*Trigger: a quiet week, or the first hooks-ordering bug on mobile.*

### Version semantics
Root `package.json` is `1.8.1` (the old Electron release number); mobile is
`0.0.0`. Decide what "Haven's version" means now and make one source of truth.
*Trigger: next release that needs a number.*

---

## Shared-logic decomposition (hygiene, not blockers)

All portable and working; split for legibility when touched:

1. **`lib/backend/communityDataBackend.ts` (~2,500 lines)** — the god-file. Split
   by domain (roles, channels, members, voice, bans, invites). Highest value.
2. `lib/backend/controlPlaneBackend.ts` (~700) — verify cohesion; split if it's
   doing multiple unrelated jobs.
3. `lib/backend/notificationBackend.ts` / `serverModmailBackend.ts` (~580 each) —
   assess when next edited.
4. `lib/backend/types.ts` (~880, 103 exports) — optional split of the type barrel
   by domain; cosmetic, lowest priority.

---

## Mobile data layer

### Message cache: index-outside-store wart
`CommunityMessageCache`'s zustand store holds `{ entities, revision }` while the
channel index (byChannel, cursors, hasMore, loading flags) lives on the class —
forcing snapshot maps, selector factories, and a `revision` counter. Success
criterion: one store shape per platform —
`{ entities, byChannel, cursors, hasMore, initialLoadComplete, loadingInitial, loadingOlder, lastInitialLoadedAt }`
— after which the revision machinery has no reason to exist. (The Solid cache
should be built with the unified shape from day one.)
*Trigger: next substantial message-cache work, or as the template for the Solid build.*

### Consumer cleanup queue
1. Shrink mobile session contexts (`MobileMainSessionContext`, DM/notification
   contexts) toward landing-screen effects + direct selector-hooks.
2. `useMobileServerAdminActions` → direct `core.admin` calls at call sites when touched.
3. `useVoice` split — cache owns the session snapshot; the hook owns media/effects only.
4. `useFriendsModalData` search → `SocialNexus`; keep modal UI state local.

### Permission metadata consolidation
`apps/mobile/src/features/community/management/communityPermissionMeta.ts` is the
only copy of permission display metadata. When the Solid client grows a role
editor, lift it into `packages/shared` instead of duplicating.

---

## Realtime

### Open hole: reactions / attachments / link previews
Per-channel Supabase subscriptions were removed; child-row changes currently ride
on the next `MESSAGE_UPDATE` or page reload. Closing it requires server-side union
into the message payload or new private-channel events routed in
`routeRealtimeEvent`. Coverage matrix: [architecture/REALTIME.md](./architecture/REALTIME.md).

### `subscribeToProfileIdentities` (global unfiltered) — scale risk
Unfiltered `postgres_changes` on `profile_identities`: every identity change flows
through WAL decoding for every connected client; RLS scopes delivery but compute
scales with platform size. The private-channel pattern doesn't fit (observers, not
the changed user, need the event). Long-term fix: broadcast scoped to shared
community membership. *Trigger: meaningful scale or measured bottleneck.*

### `subscribeToUserCommunities` → private channel
User-filtered `postgres_changes` on `community_members`; a
`COMMUNITY_MEMBERSHIP` event on `private_user:{userId}` would replace it cleanly
(same pattern as `ROLE_CHANGE` / `SOCIAL_CHANGE`). Low priority — already filtered,
changes are infrequent. *Trigger: before 1.0, or when consolidating the remaining
postgres_changes subscriptions.*

### Voice moderation: durable kick enforcement
The kick broadcast channel (`voice:kick:{communityId}:{channelId}`) is best-effort
— an unsubscribed client misses it. Do **not** solve with client-side replay. The
durable truth should be server-side voice entitlement: kick writes a removal
record, `voice-token` minting refuses kicked users, clients re-validate on
reconnect. Broadcast stays as the low-latency fast path.

---

## Future feature designs (worked out, not started)

### Presence / user status
Four states — `online`, `offline`, `dnd` (client-side sound suppression only),
`invisible` (broadcasts `offline`, stored as `invisible` so it survives
reconnects). Deliberately **no idle state** — avoids inactivity-detection
complexity.

- **DB:** `user_presence(user_id pk → profiles, status check-constrained, last_seen_at)`.
- **Fanout:** DB triggers on status change → `PRESENCE_CHANGE` to each friend's
  `private_user:{id}` + `COMMUNITY_PRESENCE_CHANGE` to shared-community members.
  Trigger broadcasts the true status *except* invisible → always `offline`.
  Payload: `{ user_id, status, display_name, avatar_url, last_seen_at }`.
- **Cost control:** client writes only on meaningful transitions (focus/blur,
  explicit toggle, session start/end).
- **Invisible persistence:** on reconnect, client reads its own row; if
  `invisible`, re-writes `invisible` instead of `online`.
- **Build list:** migration + RLS · friend fanout trigger · community fanout
  trigger · session writes (SIGNED_IN/OUT) · DND gate in notification audio ·
  invisible reconnect check in the mobile auth handler.
- **Surfaces:** member sidebar + friends list (realtime), DM sidebar
  (`last_seen_at`), voice (derived from existing voice state).

### Username change backfill (`messages.display_name`)
Keep thread coherence when a username changes, without write storms:

- **Precondition:** rate-limit username changes to one per 24h *at the RPC level*
  (bounds worst-case trigger cost; implement before the trigger).
- **Tier 1 (inline):** trigger updates messages newer than 48h
  (`author_user_id` is already indexed).
- **Tier 2 (async):** enqueue into `username_backfill_jobs(id, user_id,
  new_username, created_at, started_at, completed_at, rows_updated)`; a background
  worker batches the rest — eventually consistent, no long locks.
- `is_platform_staff` on a message is a historical fact — never retroactively updated.
