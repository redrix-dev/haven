## Realtime: subscribeToProfileIdentities (global unfiltered)

File: packages/shared/src/lib/backend/controlPlaneBackend.ts

subscribeToProfileIdentities uses an unfiltered postgres_changes
subscription on profile_identities — every identity change for
every user on the platform flows through WAL decoding for every
connected client. RLS scopes delivery but compute cost scales
with platform size.

The private channel pattern does not fit here because identity
changes need to propagate to observers (anyone in a shared
community), not just the changed user. The correct long-term
fix is a broadcast mechanism scoped to shared community
membership — broadcast to all members of communities the user
belongs to when their identity changes.

Leave as-is until Haven reaches meaningful scale or this
becomes a measurable bottleneck.

## Realtime: subscribeToUserCommunities (migrate to private channel)

File: packages/shared/src/lib/backend/controlPlaneBackend.ts

subscribeToUserCommunities is a user-filtered postgres_changes
subscription on community_members. It triggers a full server
list refresh when the user's community membership changes.

This is a direct candidate for the private channel pattern —
a COMMUNITY_MEMBERSHIP event on private_user:{userId} would
replace this subscription cleanly, following the same pattern
as ROLE_CHANGE, NOTIFICATION, DM_CONVERSATION, and SOCIAL_CHANGE.

Currently low priority because the subscription is already
user-filtered and community membership changes are infrequent.
Migrate before 1.0 or when consolidating remaining
postgres_changes subscriptions.

## Presence and User Status System

### State machine
Four states with clean semantics:
- online — connected and active, auto-set on session start
- offline — not connected, auto-set on session end/disconnect  
- dnd — explicitly set by user, client-side sound suppression only,
  no server-side notification behavior changes
- invisible — explicitly set by user, broadcasts 'offline' to others
  but stored as 'invisible' in DB so it persists across reconnects.
  Notifications function normally.

No idle state — avoids inactivity detection complexity entirely.

### DB shape
user_presence (
  user_id uuid primary key references profiles(id) on delete cascade,
  status text not null default 'offline'
    check (status in ('online', 'offline', 'dnd', 'invisible')),
  last_seen_at timestamptz not null default now()
)

### Architecture
Leverages the existing private user channel infrastructure.
No new channel subscriptions needed on the client.

On status change:
1. Client writes to user_presence table
2. DB trigger fans out PRESENCE_CHANGE to private_user:{friend_id}
   for all friends via friendships table
3. DB trigger fans out COMMUNITY_PRESENCE_CHANGE to
   private_user:{member_id} for all shared community members
4. Trigger broadcasts the true status EXCEPT invisible which
   always broadcasts as 'offline'

Broadcast payload shape:
{
  user_id: string,
  status: 'online' | 'offline' | 'dnd',  -- invisible never sent
  display_name: string,
  avatar_url: string,
  last_seen_at: string
}

### Fanout cost mitigation
Client only writes on meaningful transitions — app focus/blur,
explicit status toggle, session start/end. Not on every
interaction. Keeps trigger fanout cost negligible.

### Invisible persistence
Client checks own user_presence row on reconnect. If status
is 'invisible', writes 'invisible' again instead of 'online'.
Invisibility persists across sessions automatically.

### DND sound suppression
Gate exists in notification audio playback code — check
user_presence.status === 'dnd' before playing sounds.
No server-side notification logic changes needed.

### What needs building
1. user_presence migration — table + RLS
2. Friend fanout trigger — PRESENCE_CHANGE to private_user:{friend_id}
3. Community fanout trigger — COMMUNITY_PRESENCE_CHANGE to
   private_user:{member_id} for shared community members
4. Client session writes — online on SIGNED_IN, offline on SIGNED_OUT
5. DND sound suppression gate in notification audio code
6. Invisible reconnect check in AuthContext session handler

### Surfaces
- Community member sidebar — real-time via COMMUNITY_PRESENCE_CHANGE
- Friends list — real-time via PRESENCE_CHANGE
- DM sidebar — last_seen_at timestamp from user_presence table
- Voice — derived from existing voice state, no new mechanism

## Username Change Backfill — messages.display_name

When a user changes their username, messages.display_name should
update to maintain thread coherence. Two-tier approach:

### Rate limiting
Enforce one username change per 24 hours at the RPC level
(not just client-side). Eliminates write storm scenarios
from frequent renamers. Should be implemented before the
backfill trigger to bound worst-case cost.

### Trigger design
After update of username on public.profiles, when
OLD.username is distinct from NEW.username:

Tier 1 — inline update for recent messages (< 48 hours old):
  update public.messages
  set display_name = NEW.username
  where author_user_id = NEW.id
  and created_at > now() - interval '48 hours';

Tier 2 — enqueue job for older messages:
  Insert a job row into a username_backfill_jobs table.
  Background worker processes in batches outside the
  transaction. Eventually consistent, no locks held.

### username_backfill_jobs table
  id uuid primary key
  user_id uuid references profiles(id)
  new_username text
  created_at timestamptz
  started_at timestamptz
  completed_at timestamptz
  rows_updated integer

### Cost considerations
- author_user_id index already exists on messages table
- Inline tier (< 48h) touches a small number of rows — safe
- Async tier handles the bulk — no transaction lock risk
- Rate limiting bounds the frequency of both tiers

### is_platform_staff stays immutable
Staff status on a message is a historical fact and should
not be updated retroactively even if the user loses staff
status later.
