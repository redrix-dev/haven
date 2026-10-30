# Channels, end to end — a walkthrough

The channel domain answers one question for the whole app: **what channels
exist, which one is active, and how that changes over time.** It is built in two
layers, and seeing why is the point of this walkthrough:

| Layer         | File                                                           | Job                                                        |
| ------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| Shared nexus  | `packages/shared/src/nexus/channels/channelNexus.ts`           | All the logic: load, merge, CRUD, permissions, persistence |
| Solid binding | `packages/solid-client/src/data/channels/channelSolidNexus.ts` | Turn that state into reactive reads for Solid UI           |

Mobile has a third file, `channelReactNexus.ts`, that does the binding job for
React. Because the logic lives once in the shared class, a fix to channel
behavior lands on desktop, web and mobile in the same change.

---

## The three Solid ideas you need first

**1. `createStore` — a reactive object.** `createStore({...})` gives you an
object that looks normal, but Solid records _which fields a piece of UI reads_.
When a field changes, only the UI that read it re-runs. This is fine-grained
reactivity.

**2. `Accessor<T>` — a live value you read by calling it.** An accessor is a
function `() => T`. Calling it inside a component or memo both returns the
value _and_ subscribes you to it.

**3. `createMemo` — a cached derived value.** `createMemo(() => fn(state))`
re-runs only when something it read changes, and returns an accessor. It is how
"the channels for community X" stays current without recomputing on every
unrelated change.

---

## Layer 1: the shared nexus doesn't know Solid exists

`ChannelNexus` never imports Solid or React. It reads and writes its state
through a **port** it is handed in the constructor:

```ts
interface StatePort<S> {
  get(): S; // the current state
  set(partial: Partial<S>): void; // replace some top-level keys
}

export class ChannelNexus {
  constructor(
    protected readonly port: StatePort<ChannelState>,
    private readonly persistence: NexusPersistence,
    private readonly communityData: CommunityChannelBackend,
  ) {}
}
```

Writes are **immutable**: a method builds the next value and hands it to `set`.

```ts
removeChannel(id: string, communityId: string): void {
  const state = this.port.get();
  this.port.set({
    entities: omitKey(state.entities, id),
    byCommunity: {
      ...state.byCommunity,
      [communityId]: without(state.byCommunity[communityId], id),
    },
  });
  this.persist();
}
```

The file is grouped by job, with a banner per section:

- **reads** — `getChannel`, `getChannels(communityId)`, `getActiveChannelId`,
  `getLastChannelId`, `getDefaultChannelId`
- **loading** — `loadForCommunity` (channels + groups in one go, through a
  `LoadGate` so overlapping calls share one request), `ensureLoaded`
- **channel / group commands** — create, update, delete; group create, rename,
  delete, assign, collapse
- **channel permission editor** — load and save role/member overwrites
- **local writes** — `setChannels` (a load result), `upsertChannel` /
  `removeChannel` (realtime), `removeCommunity` (access loss), `setActiveChannelId`
  (which also remembers the last channel per community)
- **persistence + lifecycle** — `rehydrate`, `clear`, `persist`

`toHavenChannel()` sits at the top: the boundary where a raw database row
(`community_id`, `created_at`) becomes the app's clean `HavenChannel`
(`communityId`, `createdAt`). Everything past that line speaks clean.

---

## Layer 2: the Solid binding

The binding's whole job is to build the port from a Solid store and expose
reads:

```ts
export class ChannelSolidNexus extends ChannelNexus {
  readonly state: ChannelState;

  constructor(
    persistence: NexusPersistence,
    communityData: CommunityChannelBackend,
  ) {
    const port = createSolidStatePort(createInitialChannelState());
    super(port, persistence, communityData);
    this.state = port.tracked;
  }

  channels(communityId: Accessor<string>): Accessor<HavenChannel[]> {
    return createMemo(() => projectChannels(this.state, communityId()));
  }
}
```

Because it _extends_ `ChannelNexus`, every command (`loadForCommunity`,
`createChannel`, …) is available on `core.channels` — the binding only adds the
reactive reads (`channels()`, `channelGroups()`, `loading()`,
`channelPermissions()`).

### What the Solid port does with `set`

`createSolidStatePort` (`data/kit/solidStatePort.ts`) makes the shared class's
immutable writes fine-grained again. For each key in the partial it calls
Solid's `reconcile`, which diffs the new value against the store and touches
only what changed. So `removeChannel` builds a whole new `entities` record, but
Solid deletes one key; a list rendering another community never re-runs.

And `get()` returns the **live proxy**, so a shared getter like
`getChannels(id)` is itself reactive when a memo calls it.

---

## Reading from the UI

```ts
const core = requireHavenSolidCore();
const channels = core.channels.channels(() => params.communityId);
// in JSX: <For each={channels()}>…</For>
```

Writes go through methods: `core.channels.createChannel({...})`,
`core.channels.setActiveChannelId(id)`. Never touch `state` directly.

### Calling a command from an effect

Shared methods read the live store before their first `await` — for example
`ensureLoaded` checks whether the community's channels are cached. Inside an
effect, that read would subscribe the effect to the store the load is about to
write, and the effect would re-run itself. So track the id, then call
untracked:

```ts
createEffect(() => {
  const id = props.communityId; // the only thing this effect depends on
  untrack(() => void core.channels.ensureLoaded(id));
});
```

`test-support/__tests__/settingsSurfaces.tier2.test.ts` measures exactly this:
the bare call re-runs the effect three times, the untracked one once.

---

## How it changes over time

| Trigger                         | Path                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| App start                       | `rehydrate()` paints the cached list, then `loadForCommunity`                             |
| You open a community            | `createCommunityRouteSync` → `ensureLoaded` + `setActiveChannelId`                        |
| Someone creates/renames/deletes | realtime `CHANNEL_*` → `upsertChannel` / `removeChannel`                                  |
| Groups change                   | realtime `CHANNEL_GROUP_CHANGE` → `loadForCommunity`                                      |
| Your access changes             | realtime `ROLE_CHANGE` → `core.onRoleChange` reloads the list, moves off a hidden channel |
| You lose the community          | `core` access loss → `removeCommunity`                                                    |
| Sign-out                        | `clear()`; any load still in flight sees `stale()` and doesn't write                      |
