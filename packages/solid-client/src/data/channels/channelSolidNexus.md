# `ChannelSolidNexus` — a walkthrough

This is the channel domain for the Solid (web/desktop) client. One file, one
class, one job: **be the single source of truth for "what channels exist, which
one is active, and how that changes over time"** — and hand the UI reactive
views into that truth. Everything the rest of the app knows about channels, it
learns by talking to this object.

Think of it as a small in-memory database for channels that (a) knows how to
fill itself from the backend, (b) knows how to patch itself when a realtime
event arrives, and (c) exposes live, auto-updating reads to the screen. When any
of those reads change, the components using them re-render themselves. You never
call "refresh." You mutate the data; the UI follows.

---

## The three Solid ideas you need first

This file leans on exactly three Solid primitives. Understand these and the
whole file is obvious.

**1. `createStore` — a reactive object.**
`const [state, setState] = createStore({...})` gives you a normal-looking object
(`state`) and a setter (`setState`). The magic: Solid watches _which fields you
read_. If a piece of UI reads `state.activeChannelId`, Solid quietly records
"this UI depends on `activeChannelId`." Later, when you
`setState("activeChannelId", "x")`, Solid re-runs _only_ the UI that read that
exact field. Nothing else recomputes. This is "fine-grained reactivity," and
it's the entire reason we don't need an adapter layer — Solid already does the
change-tracking by hand-tracking property access.

**2. `Accessor<T>` — a live value you read by calling it.**
An `Accessor<T>` is just a function `() => T`. You call it — `channels()` — and
you get the current value, _and_ you get subscribed to it. The naming convention
in Solid: a value you read as `foo()` is a reactive read; reading it inside a
component or a memo means "re-run me when this changes."

**3. `createMemo` — a cached derived value.**
`createMemo(() => expensiveThing(state))` runs the function, caches the result,
and only re-runs it when something _it read_ changes. It returns an `Accessor`.
It's how you build a derived view ("the channels for community X") that stays in
sync without recomputing on every unrelated change.

That's it. State you can read reactively, functions that re-run when their
inputs change, and a setter that triggers the whole chain.

---

## Top of the file: imports and what they're for

```ts
import { createMemo, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
```

The three primitives above, plus `SetStoreFunction` (the _type_ of the setter,
so we can store it as a private field with correct typing).

```ts
import {
  projectChannels,
  selectActiveChannelId,
} from "@shared/nexus/community/channelSelectors";
```

**This is the cross-platform seam.** `projectChannels` and
`selectActiveChannelId` are pure functions — no Solid, no React, no framework.
Given a plain state object, they compute "the channel list" and "the active id."
They live in `@shared` because **mobile uses the exact same two functions**.
That's the one piece of "selectors" worth keeping: it guarantees web and mobile
compute a channel list _identically_. The nexus doesn't re-implement that logic;
it calls it.

```ts
import type {
  ChannelNexusState,
  HavenChannel,
} from "@shared/nexus/community/channelTypes";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type { Channel, ChannelGroupState } from "@shared/lib/backend/types";
```

Pure type imports (notice `import type` — these vanish at compile time, zero
runtime cost):

- `ChannelNexusState` — the shape of our in-memory store (also shared with
  mobile).
- `HavenChannel` — the app's clean channel object (what the UI wants).
- `Channel` — the _raw_ backend row (snake_case, DB-shaped). The thing we get
  from Supabase.
- `CommunityDataBackend` — the interface for "the thing that fetches channels."
  The nexus depends on the _interface_, not a concrete backend, so it's testable
  and swappable.
- `ChannelGroupState` — channel grouping/collapsing info.

The `Channel` vs `HavenChannel` distinction matters: **raw goes in, clean comes
out.** That conversion is the next thing in the file.

---

## `initialState()` — the empty shape

```ts
const initialState = (): ChannelNexusState => ({ entities: {}, byCommunity: {}, ... revision: 0 });
```

A factory that returns a fresh, empty store. It's a _function_ (not a constant)
so every nexus — and every `clear()` — gets its own brand-new object, never a
shared reference. The shape is **normalized**, which is the standard way to hold
relational data in memory:

- `entities` — every channel keyed by id:
  `{ "chan_1": { data, partial, cachedAt } }`. The one true copy of each channel.
- `byCommunity` — for each community, an _ordered list of ids_:
  `{ "comm_1": ["chan_1", "chan_2"] }`. This is the ordering/membership, stored
  separately from the channel data.
- `groups` / `ungrouped` / `collapsed` — channel-group layout per community.
- `activeChannelId` — which channel the user is looking at.
- `loadingByCommunity` — per-community loading flags.
- `revision` — **vestigial.** The shared type still declares it because mobile's
  store needs it, so we have to initialize it. This Solid nexus never reads or
  increments it. You can mentally ignore it.

Why normalized (ids + a separate entity map) instead of just
`{ "comm_1": [channel, channel] }`? Because a realtime update to one channel
should touch _one_ entry in `entities`, not force you to find-and-replace it
inside every list it appears in. Normalization is what makes the realtime
patches in the bottom half cheap.

---

## `toHavenChannel()` — the raw→clean boundary

```ts
const toHavenChannel = (raw: Channel): HavenChannel => ({ id: raw.id, communityId: raw.community_id, ... });
```

The single place where a database row becomes an app object.
`community_id` → `communityId`, and only the fields the UI actually needs
survive. **Every entry point that takes backend data runs it through here** — so
the rest of the file, and the entire UI, never sees a snake_case DB shape. If the
backend schema changes, this one function absorbs it.

---

## The class: fields and constructor

```ts
export class ChannelSolidNexus {
  readonly state: ChannelNexusState;
  private readonly setState: SetStoreFunction<ChannelNexusState>;
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(private readonly communityData: CommunityDataBackend) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }
```

- **`state` is `readonly` and public** — anyone can _read_ it, but the `readonly`
  keyword means they can't reassign it, and (crucially) they have no `setState`.
  So the outside world can observe the data but can only _change_ it by calling
  the nexus's methods. That's the encapsulation: all writes funnel through named,
  intentional methods.
- **`setState` is private** — the write key, kept inside the class. This is the
  whole "owner" idea: one object owns mutation.
- **`inflight`** — a map of in-progress loads, keyed by community id. It exists to
  prevent a stampede: if three components all ask to load community X at once,
  only the first actually fetches; the others get handed the same promise. (Used
  in `loadForCommunity` below.)
- **`communityData`** — the backend, received via constructor. The
  `private readonly` in the parameter is TypeScript shorthand for "store this as
  a private field." The nexus never imports a concrete backend; it's _given_
  one. That's dependency injection, and it's why this class is trivially testable
  with a fake backend.

The constructor just builds the empty reactive store and stashes both halves.

---

## Reading: the reactive projections

These are how the UI _gets at_ the data. They're listed first in the class
because they're the public face — what most callers touch.

```ts
channels(communityId: Accessor<string>): Accessor<HavenChannel[]> {
  return createMemo(() => projectChannels(this.state, communityId()));
}
```

Read this carefully — it's the heart of the design.

- It takes `communityId` as an **`Accessor`** (a `() => string`), not a plain
  string. Why? Because the community you're viewing _changes_ (you click a
  different server). By taking a getter, the projection stays live: when the
  active community switches, `communityId()` returns the new id and the memo
  recomputes automatically. If we took a plain string, you'd be frozen on
  whatever community was active at call time.
- It returns a `createMemo` that calls the **shared pure function**
  `projectChannels(this.state, communityId())`. Inside that call, Solid sees the
  memo read `this.state.byCommunity[<id>]` and the relevant `this.state.entities[...]`.
  It records those as dependencies.
- Result: this memo recomputes **only** when _those specific channels_ change, or
  when the community id changes. A new message arriving, a profile updating, a
  channel in a _different_ community appearing — none of it wakes this memo.

So `core.channels.channels(() => activeCommunityId() ?? "")` gives you a live
`Accessor<HavenChannel[]>` that's always correct and never over-fires.

```ts
activeChannelId(): string | null {
  return selectActiveChannelId(this.state);
}
```

Simpler — no parameter, so no memo needed. It just reads
`this.state.activeChannelId` (through the shared selector). Because it reads a
store field, **calling it inside a reactive scope subscribes you to that field.**
Call `core.channels.activeChannelId()` inside a component or a memo, and that
scope re-runs when the active channel changes. Call it in plain non-reactive code
and you just get the current value once. Same function, behavior depends on where
you call it — that's normal Solid.

---

## Lifecycle: filling and emptying the store

```ts
async loadForCommunity(communityId: string): Promise<void> {
  const existing = this.inflight.get(communityId);
  if (existing) return existing;
  const promise = (async () => { ... })();
  this.inflight.set(communityId, promise);
  return promise;
}
```

Fetch a community's channels from the backend and write them in. The `inflight`
dance at the top is the de-dupe: already loading? hand back the same promise.
Inside the async body it:

1. sets the loading flag,
2. fetches channels (`listChannels`) and their group layout (`listChannelGroups`),
3. **degrades gracefully** — if the groups call throws, it falls back to
   "everything ungrouped" rather than failing the whole load,
4. commits everything via `setChannels`,
5. in `finally`, clears the loading flag and removes itself from `inflight` so a
   future load can run.

```ts
async ensureLoaded(communityId: string): Promise<void> {
  const ids = this.state.byCommunity[communityId] ?? [];
  if (ids.length > 0) return;
  await this.loadForCommunity(communityId);
}
```

The "load it if we don't already have it" convenience. This is what the route
sync calls on navigation — cheap to call repeatedly, only fetches the first time.

```ts
rehydrate(): void {}
clear(): void { this.setState(initialState()); }
```

`rehydrate` is an intentional no-op (a hook the core calls on all caches during
bootstrap; channels have nothing to restore from disk, so it's empty but present
to satisfy the shared shape). `clear` resets to empty — called on
logout/teardown. Passing a whole object to `setState` replaces the store
wholesale.

---

## Writing: lifecycle and realtime patches

Every method here is **path-based `setState`** — `setState("entities", id, value)`
reaches straight to one spot in the tree and updates it. No spreading whole
objects, no `revision++`, no `notify()`. Solid sees the path you touched and
wakes exactly the readers of that path.

```ts
upsertChannel(raw: Channel | unknown): void {
  const channel = toHavenChannel(raw as Channel);
  this.setState("entities", channel.id, { data: channel, partial: false, cachedAt: Date.now() });
  const communityIds = this.state.byCommunity[channel.communityId] ?? [];
  if (!communityIds.includes(channel.id)) {
    this.setState("byCommunity", channel.communityId, [...communityIds, channel.id]);
  }
}
```

**The realtime entry point.** When a "channel created/updated" event arrives over
the wire, this is what's called. It writes the one channel into `entities`
(keyed by id — so an update overwrites in place), and _only if it's new_, appends
its id to that community's ordered list. Two surgical writes. Any `channels()`
projection watching that community recomputes; everything else stays asleep. This
is the optimistic, low-cost realtime patch the whole architecture exists to make
easy.

```ts
removeChannel(id, communityId): void {
  this.setState("entities", id, undefined!);
  this.setState("byCommunity", communityId, (ids = []) => ids.filter(...));
  this.setState("ungrouped", communityId, (ids = []) => ids.filter(...));
  this.setState("groups", communityId, (groups = []) => groups.map(... filter channelIds ...));
}
```

The inverse: drop the channel from the entity map and scrub its id out of every
list that referenced it (membership, ungrouped, and inside any group). Note the
**function form** of `setState`: `(ids = []) => ids.filter(...)` receives the
current value and returns the new one — the clean way to do "update based on
what's there," with `= []` defaulting the never-loaded case.

```ts
setChannels(communityId, channels, groupState): void { ... }
```

The bulk load committer (called by `loadForCommunity`). It sorts the raw channels
by `position`, converts each through `toHavenChannel` into `entities`, then sets
the ordered id list, groups, ungrouped, and collapsed state. One subtlety worth
noting: `collapsed` uses `(existing) => existing ?? groupState.collapsedGroupIds`
— **don't clobber the user's collapse choices on reload.** If they'd already
collapsed a group, a refetch keeps their preference rather than resetting it.
That's the kind of "experience" detail that's easy to lose and annoying when you
do.

```ts
setActiveChannelId(id: string | null): void {
  if (this.state.activeChannelId === id) return;
  this.setState("activeChannelId", id);
}
```

Sets the active channel, with an early-out if it's unchanged (no point waking
subscribers for a no-op write). Called by `CommunityRouteSync` — remember, the
**URL is the source of truth**; the route reads the params and pushes them in
here.

```ts
private setIsLoading(communityId, loading): void {
  this.setState("loadingByCommunity", communityId, loading);
}
```

Private helper for the loading flag. Private because only the load lifecycle
should touch it.

---

## The factory

```ts
export function createChannelSolidNexus(
  communityData: CommunityDataBackend,
): ChannelSolidNexus {
  return new ChannelSolidNexus(communityData);
}
```

A thin wrapper over `new`. The codebase prefers `createX(...)` factories over
`new X(...)` at call sites — it reads better and lets construction details change
later without touching callers. `HavenSolidCore` calls this once and holds the
result as `core.channels`.

---

## How to interface with it (the API reference)

You almost never construct this yourself — you get it from the bootstrapped core:
`const core = requireHavenSolidCore()` then `core.channels`.

**To read (in a component or memo):**

| Call                                            | Gives you                  | Notes                                                          |
| ----------------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| `core.channels.channels(() => communityId)`     | `Accessor<HavenChannel[]>` | Pass a _getter_. Store the result, read it as `list()`. Auto-updates. |
| `core.channels.activeChannelId()`               | `string \| null`           | Call inside a reactive scope to subscribe.                    |

**To change:**

| Call                                            | When                                              |
| ----------------------------------------------- | ------------------------------------------------- |
| `core.channels.ensureLoaded(communityId)`       | On navigation — fetches once, cheap to repeat.    |
| `core.channels.loadForCommunity(communityId)`   | Force a (de-duped) fetch.                         |
| `core.channels.upsertChannel(raw)`              | From a realtime "channel changed" event.          |
| `core.channels.removeChannel(id, communityId)`  | From a realtime "channel deleted" event.          |
| `core.channels.setActiveChannelId(id)`          | From route sync only — the URL drives this.       |
| `core.channels.clear()`                         | On logout/teardown.                               |

**The one rule:** read through the accessors, write through the methods. Never
reach into `core.channels.state` to mutate — it's exposed for reading, and
there's no setter out there anyway. If you find yourself wanting a new kind of
read, add a projection method here (built on a shared selector); if you want a
new kind of change, add a method here. The domain stays in one file on purpose.
