# How to build a `XSolidNexus` (the recipe)

Converting one domain from the old `XSolidCache` + `accessors.ts` + adapter into
a single cohesive nexus. Use `channels/channelSolidNexus.ts` as the worked
example — it's the template every step below points back to.

**You are not writing from scratch.** The old `XSolidCache.ts` already contains
the state shape, the raw→clean mapper, and the load logic. You're _transforming_
it: re-housing into the nexus shape, stripping the adapter, folding the accessors
back in as methods.

---

## What stays the same every time vs what changes

**Same (copy the shape from channels):**

- the `createStore` / `setState` wiring in the constructor
- projections returned as `createMemo(() => projectX(this.state, ...))`
- writes done with **path-based** `setState("slot", key, value)`
- the `createXSolidNexus(...)` factory and the `index.ts` export shape

**Changes per domain (read them off the old cache):**

- the state shape (its `initialState`)
- the raw→clean mapper, if the domain has one
- which shared pure selectors exist, and where they live
- the backend method names and the lifecycle (some domains paginate, etc.)

---

## The steps

### 0. Scout the FULL surface first (do this before writing a line)

The nexus has to satisfy everything that called the old cache — and that surface
lives in **three** places, not one. Skipping any of them means a green nexus that
fails typecheck the moment you wire it. (This step exists because the communities
pass learned it the hard way.)

1. **Feature components** — `grep -rn "createX\|core\.<domain>\." packages/solid-client/src/features`
   for the accessor factories and reactive reads the UI uses.
2. **`HavenSolidCore`** — `grep -nE "this\.<domain>\." packages/solid-client/src/core/HavenSolidCore.ts`.
   The core calls **imperative** methods the components never do — e.g. communities
   needed `getActiveId()`, `getCommunityIds()`, `loadDisplayOrder()`. These won't
   show up in a feature-component grep.
3. **The typed contract** — `@shared/core/realtimeMutationTarget.ts`. `HavenSolidCore
implements RealtimeMutationTarget`, whose `<domain>` property is a typed
   `Realtime<Domain>Cache` interface your nexus **must** implement. It also **dictates
   method names** — communities had to expose `load(userId)`, NOT `loadCommunities`.
   The interface is the source of truth for the name; don't rename it.

**The shortcut:** the old `XSolidCache` already satisfies all three (it was the
drop-in the core + realtime layer used). So **keep its public method names**
(`load`, `getActiveId`, `getCommunityIds`, …) and port faithfully — strip only the
adapter (`revision`/`notify`/`wireSolidReadableStore`), never the public surface.
Renaming a public method is what breaks the contract.

### 1. Create `XSolidNexus.ts`

Skeleton (fill the blanks from the old cache):

```ts
import { createMemo, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
// the domain's shared pure selectors — SEE THE NOTE BELOW on where they live
import { /* projectX, selectY */ } from "@shared/...";
import type { /* XNexusState, HavenX */ } from "@shared/...";
import type { /* XBackend */ } from "@shared/lib/backend/...";

const initialState = (): XNexusState => ({ /* copy from old cache */ });

// only if the old cache had one:
// const toHavenX = (raw: XRow): HavenX => ({ ... });

export class XSolidNexus {
  readonly state: XNexusState;
  private readonly setState: SetStoreFunction<XNexusState>;
  // copy any inflight maps / helpers the old cache had

  constructor(private readonly backend: XBackend) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState;
  }

  // ── reactive projections (fold in what accessors.ts did) ──
  someList(arg: Accessor<string>): Accessor<HavenX[]> {
    return createMemo(() => projectX(this.state, arg()));
  }
  someScalar(): /* T */ {
    return selectY(this.state); // a tracked read
  }

  // ── lifecycle: load / ensureLoaded / clear / rehydrate ──
  // copy the bodies from the old cache, but see step 3 on setState

  // ── writes + realtime: copy from old cache, then apply step 3 ──
}

export function createXSolidNexus(backend: XBackend): XSolidNexus {
  return new XSolidNexus(backend);
}
```

### 2. Fold `accessors.ts` in

Each `createSomething(cache, ...)` in the old `accessors.ts` becomes a **method**
here. The body is the same selector call, just over `this.state` instead of the
wrapped store. Drop the `createStoreSelector` / equality-fn wrapper — a plain
`createMemo` over `this.state` is enough.

### 3. Strip the adapter from every write

In the old cache, mutations looked like
`this.setState((s) => ({ slot: {...}, revision: s.revision + 1 }))` followed by
`this.reactiveStore.notify()`. Replace each with **path-based** writes and delete
the bookkeeping:

```ts
// old:  this.setState((s) => ({ entities: { ...s.entities, [id]: v }, revision: s.revision + 1 }));
//       this.reactiveStore.notify();
// new:
this.setState("entities", id, v);
```

Delete entirely: `wireSolidReadableStore`, `reactiveStore`, every `notify()`,
every `revision: ...`, and the per-read equality functions. Solid's fine-grained
store handles all of it.

### 4. Rewire

- `index.ts`: export `{ XSolidNexus, createXSolidNexus }`; remove the accessor
  exports.
- Delete `XSolidCache.ts` and `accessors.ts`.
- `core/HavenSolidCore.ts`: change the type (`XSolidCache` → `XSolidNexus`) and the
  build call (`createXSolidCache` → `createXSolidNexus`).
- Feature components: replace `createSomething(core.x, ...)` accessor calls with
  the new methods, e.g. `core.x.someList(() => ...)`.

### 5. Prove it

```
npx tsc --noEmit --project apps/tauri/tsconfig.json   # must be exit 0
npx eslint <the files you touched>                    # must be exit 0
```

Then grep for the deleted symbol names to be sure nothing dangles.

---

## Note: where the shared selectors live (a known wrinkle)

The shared pure logic isn't in one consistent home yet — some domains use
`@shared/nexus/<area>/<x>Selectors`, others use `@shared/features/<domain>/logic`.
Find the domain's by searching the old cache's imports. If a domain has **no**
shared projection at all, you can inline the projection in the memo for now and
flag it — consolidating those homes is a separate cleanup, not this conversion.

## The one rule

Read through the projection methods, write through the named methods. Never
expose `setState`, never let a caller mutate `state` directly.
