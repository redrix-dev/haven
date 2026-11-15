# Starting the app

How each app goes from launch to a signed-in session, and back. The core it
starts is described in [COLLECTIONS.md](./COLLECTIONS.md), "HavenCore"; this
is the order things happen in, per app.

## The shape in one paragraph

The host builds one core at launch, before anyone is known: the collections
are empty and nothing has touched the network. The auth boundary watches the
Supabase session. When someone signs in it calls `core.signIn(userId)`, which
puts back what the device kept for that person (sidebar, theme, where they
were, drafts), joins their realtime topic, and loads everything once the
topic is listening, or after three seconds if it is slow. Every reconnect
loads everything again. Signing out calls `core.signOut()`, which stops
listening, empties every collection and removes that person's device copies.

## Launch: the host builds the core

| App     | Entry                                     | Builds                                      | Device storage                             |
| ------- | ----------------------------------------- | ------------------------------------------- | ------------------------------------------ |
| Desktop | `apps/tauri/src/main.tsx`, async `boot()` | `createTauriHavenCore()` → `HavenSolidCore` | tauri-plugin-store, read into memory first |
| Web     | `apps/web/src/main.tsx`, `boot()`         | `createWebHavenCore()` → `HavenSolidCore`   | localStorage                               |
| Mobile  | `apps/mobile/App.tsx`, module body        | `createReactHavenCore()` → `HavenReactCore` | MMKV                                       |

Each passes the Supabase client, its storage, and where it runs (`context`:
platform and distribution, which decide the introductions offered).

Device storage is synchronous (`getString` / `set` / `remove`), so what the
device kept can show on the first frame. Desktop's store is async, so
[`createTauriPluginStorePersistence`](../../apps/tauri/src/lib/createTauriPluginStorePersistence.ts)
reads it whole into a `Map` before the core is built, and writes go back
through to disk. That one read is why only the desktop factory is `async`.
Outside the native shell (Vite dev in a browser), or if the plugin fails,
desktop falls back to localStorage.

Building the core makes every collection's store through the platform's
`makePort` (a Solid store on desktop and web, a Zustand store on mobile) and
keeps them as `core.stores`. Desktop and web expose the core as
`window.__haven` for the console; mobile registers it for
`requireHavenCore()`.

Then each host renders. Mobile also: registers the app host and LiveKit's
globals, sets the Expo notification handler, writes device copies when the app
leaves the foreground (`core.flush()`), and holds its first paint until the
theme it saved is read. Desktop and web write device copies when the window
is hidden or closed.

## Sign-in

The auth boundary is the one place a Supabase session becomes the core's:

- desktop and web: `contexts/SessionProvider.tsx`;
- mobile: `hooks/useAuthSession.ts`.

Each reads the saved session, then follows `onAuthStateChange`. A user id
means `core.signIn(userId)` and `core.links.setSession(userId)` (links that
arrived before sign-in open now); none means sign-out. Signing in as the same
person again (Supabase fires several events for one sign-in) is the same
session.

`core.signIn(userId)`:

1. `phase` is `loading`. The device copies for this person are put back, so
   the sidebar, theme, place and drafts show at once.
2. The realtime topic for this person is joined.
3. When it is listening (`connected`), or after `CONNECT_WAIT_MS` (3 s),
   everything loads: account, communities and their structure and channels,
   conversations, friends, notifications and preferences, and the open
   channel's newest page. No event can fall between the load and the
   listening.
4. When the first load finishes, `phase` is `ready`. Each part records its own
   failure in its request status; none stops the others.

Reconnecting loads everything again, since events sent while away are lost.

## Between sign-in and the app

The account decides what stands in front of the app (desktop and web:
`AccountGate` in `routes/index.tsx`; mobile: `navigation/AccountGate.tsx`):

1. the newest terms, when the person has not accepted them;
2. then each introduction offered on this build, in the database's order.
   One that is not required can be skipped.

Until the account has loaded, the app shows what the device kept.

## Where the app opens

- Desktop and web: the route. `/` opens the last community; a community route
  opens the channel last open there (`CommunityRouteSync`).
- Mobile: `CommunityEntry` opens the community the person was last in, else
  their first, else the list of communities. With nothing on the device it
  waits for the first load of the person's communities.

## Sign-out

The auth boundary signs out of Supabase, then calls `core.signOut()`. Mobile
stops pushes to the phone first (`unregisterThisPushDevice`), while the
session can still ask. A restricted account (Haven staff) is signed out by
the core's `restricted` listener, which says why.

`core.signOut()` bumps the session generation, so a load still running
writes nothing; stops listening; empties every collection; and removes the
person's device copies. Voice keeps the device's audio choices.

## Gotchas

- Effects that open or load must not read what they write. On desktop and web
  that means `untrack` (the haven-solid-reactivity skill); on mobile, an
  effect's dependencies are ids, never the store state the command changes.
- A screen waits for its load to have answered (`answered(requests, key)`)
  before treating "not there" as gone: a device copy or nothing is not the
  database's answer.
