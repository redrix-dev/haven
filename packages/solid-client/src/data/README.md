# `data/` — the Solid side of the collections

The records the app shows live in the shared collections
(`packages/shared/src/collections/`, docs/architecture/COLLECTIONS.md), used
unchanged by mobile. Desktop and web give them Solid stores, and nothing else:

```
packages/shared/src/collections   records, loads, commands, events (framework-free)
        ↑ each writes through a StatePort
data/kit/solidStatePort.ts        the Solid store behind every collection
core/HavenSolidCore.ts            makes one per collection and keeps each as core.stores.<name>
```

A screen reads `core.stores.<name>` (the live store proxy) through the
collections' selectors, and calls the commands on `core` and its collections:

```tsx
const core = requireHavenSolidCore();
const channels = createMemo(() =>
  communityChannels(core.stores.channels, props.communityId),
);
<button onClick={() => void core.channels.markRead(id, latest)} />;
```

**No commands, loads or writes belong here.** A behaviour is written once, in
the shared collection or HavenCore, so both platforms get it.

`screen.ts` is the one exception: screen state that is no record and no
session place (which panel is open). It is this platform's, in memory only.

## How the Solid port behaves

- **`get()` returns the live proxy**, so a shared method or selector that
  reads it inside a memo or component is reactive.
- **`set(partial)` reconciles each key**: Solid diffs the new value against the
  store and notifies only the leaves that changed. Editing one message updates
  one row; it does not re-run other channels or remount the row.
- **Rows keyed by something other than `id`** are named by the collection
  (`rowKeys` in `makePort`), or a removal morphs every later row into its
  neighbour. Voice rosters do this (`VOICE_ROW_KEYS`).
- **Values passed to `set` become store-owned.** Initial state always comes from
  a `createXState()` factory, never a shared constant.

## The one rule for screens

Read through `core.stores` and selectors; write through commands. Never write
a store, never mutate one, never spread a proxy into a snapshot
(`{ ...state }` kills tracking).

Because shared methods read the live store, **a command called from an effect
must run inside `untrack`**: track the ids you depend on, then
`untrack(() => void core.messages.open(id))`. The `haven-solid-reactivity`
skill explains why, and the tier-2 settle tests in `test-support/__tests__/`
hold the rule in place.
