# `data/` — Solid bindings over the shared nexuses

This folder is the **Solid read layer** for the desktop (Tauri) and web app.
The domain logic itself is not here: every domain is one shared class,
`XNexus`, in `packages/shared/src/nexus/<domain>/`, used unchanged by mobile
too. A Solid nexus is a thin subclass of it that does two things:

1. builds the shared class's `StatePort` from a Solid store
   (`kit/solidStatePort.ts`), and
2. exposes reads: `state` (the live store proxy) and `createMemo` accessors.

```
packages/shared/src/nexus (domain logic, framework-free)
        ↑ subclassed by
data/<domain>/xSolidNexus.ts (Solid port + reactive reads)  →  solid-client UI
```

Mobile does the same with `XReactNexus` over a zustand port, so a behavior
change is written once and both platforms get it.

## A binding, whole

```ts
export class ChannelSolidNexus extends ChannelNexus {
  /** The live store proxy. Read it inside a tracking scope. */
  readonly state: ChannelState;

  constructor(
    persistence: NexusPersistence,
    communityData: CommunityDataBackend,
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

That is the whole job. **No commands, loads or writes belong in a binding** —
add them to the shared nexus.

```
data/<domain>/
  xSolidNexus.ts   the binding (class XSolidNexus)
  index.ts         barrel: re-exports the class
```

## How the Solid port behaves

- **`get()` returns the live proxy**, so shared getters (`getPermissions()`,
  `getChannels()`) stay reactive when a memo or component calls them.
- **`set(partial)` reconciles each key**: Solid diffs the new value against the
  store and notifies only the leaves that changed. Editing one message updates
  one row; it doesn't re-run other channels or remount the row.
- **Rows keyed by something other than `id`** must say so when the port is
  built (`createSolidStatePort(initial, { keys: { participants: "userId" } })`),
  or a removal morphs every later row into its neighbour. Voice rosters do this.
- **Values passed to `set` become store-owned.** Initial state always comes from
  `createInitialXState()`, never a shared constant.

## The one rule for consumers

Read through `state` and the accessors; write through the nexus's methods.
Never expose or call the store setter, never mutate `state`, never spread the
proxy into a snapshot (`{ ...state }` kills tracking).

Because shared methods read the live store, **a method that reads and writes
must run inside `untrack` when called from an effect**: track the ids you
depend on, then `untrack(() => void core.x.load(id))`. The
`haven-solid-reactivity` skill explains why, and the tier-2 settle tests in
`test-support/__tests__/` hold the rule in place.

## Naming conventions

- **Files:** camelCase matching the folder's full name (`directMessageSolidNexus.ts`).
- **Classes:** PascalCase with a `SolidNexus` suffix (`ChannelSolidNexus`).
- **Folders:** the same domain names as `packages/shared/src/nexus/` and mobile.
- **No factories, no state aliases:** construct with `new`; state types come from shared (`ChannelState`).

## The `communities/` vs `community-management/` split

- **`communities/`** — the community **list**: which communities the viewer is
  in, the active one, display order.
- **`community-management/`** — **governance**: admin (members, bans, roles,
  settings, invites) and moderation (modmail).

## `session/`

Session-scoped stores (auth, ui, user status, viewer message policy). Each
exposes `getState()` returning the live store proxy — read it in a tracking
scope, like a nexus.

## Wiring

`core/HavenSolidCore.ts` builds every binding in its `createParts()` and hands
them to the shared `HavenCore`, which owns the session and routes realtime
events into them. See `docs/architecture/HAVEN_CORE.md`.
