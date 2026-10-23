# How to add or change a nexus (the recipe)

Every domain is one shared class plus one thin binding per framework:

```
packages/shared/src/nexus/<domain>/
  xTypes.ts            XState + domain types
  xNexus.ts            class XNexus — all the logic, over a StatePort
  xSelectors.ts        pure projections both platforms read (optional)
packages/solid-client/src/data/<domain>/xSolidNexus.ts   Solid binding
apps/mobile/src/data/<domain>/xReactNexus.ts             React binding
```

`packages/shared/src/nexus/channels/` and
`packages/solid-client/src/data/channels/channelSolidNexus.md` (a walkthrough)
are the worked example. Changing existing behavior is usually step 2 alone.

---

## 0. Scout the full surface first

A nexus is called from more places than the UI. Before writing, find all of
them:

1. **Feature code** — `rg "core\.<domain>\." packages/solid-client/src apps/mobile/src`
2. **HavenCore** — `rg "this\.<domain>\." packages/shared/src/core/havenCore.ts`.
   The core calls imperative methods the UI never does (`getActiveId`,
   `removeCommunity`, …).
3. **The realtime contract** — `packages/shared/src/core/realtimeMutationTarget.ts`.
   Its `Realtime<Domain>Cache` interface **dictates method names** (`load(userId)`,
   not `loadCommunities`); the nexus must keep them.
4. **Mobile hooks** — `apps/mobile/src/data/hooks/<domain>.ts` read state field
   names directly.

## 1. State: types and a fresh initial value

```ts
// xTypes.ts
export type XState = {
  byId: Record<string, X>;
  isLoading: boolean;
  lastLoadedAt: number;
};

// xNexus.ts
export const createInitialXState = (): XState => ({
  byId: {},
  isLoading: false,
  lastLoadedAt: 0,
});
```

Always a factory, never a shared constant: values written through the Solid
port become store-owned and are morphed in place.

## 2. The shared class

```ts
export class XNexus {
  private readonly gate = createLoadGate();

  constructor(
    protected readonly port: StatePort<XState>,
    private readonly backend: XBackend, // inject exactly what it calls
  ) {}

  getX(id: string): X | undefined {
    return this.port.get().byId[id];
  }

  load(): Promise<void> {
    return this.gate.run("load", async (stale) => {
      this.port.set({ isLoading: true });
      try {
        const rows = await this.backend.listX();
        if (stale()) return; // cleared (sign-out) while we waited: don't write
        this.port.set({ byId: indexById(rows), lastLoadedAt: Date.now() });
      } finally {
        this.port.set({ isLoading: false });
      }
    });
  }

  clear(): void {
    this.gate.clear(); // marks in-flight loads stale
    this.port.set(createInitialXState());
  }
}
```

Rules:

- **No framework imports.** `check:shared-portable` enforces it.
- **Write immutably**: build the next value, hand it to `port.set`.
- **Loads go through a `LoadGate`**, and check `stale()` after every `await`
  before writing data or an error. A method that drops one key's data also
  calls `gate.forget(key)`, or the load in flight writes it back.
- **Persistence** (if the domain survives restarts): `rehydrate()` /
  `persist()` via the injected `NexusPersistence` and a key in
  `NEXUS_STORAGE_KEYS`.
- **Errors** become state (`messageFromError`) when a screen shows them; decide
  per domain whether the load also rethrows, and keep it uniform within the
  nexus.

## 3. The Solid binding

```ts
export class XSolidNexus extends XNexus {
  readonly state: XState;

  constructor(backend: XBackend) {
    const port = createSolidStatePort(createInitialXState());
    super(port, backend);
    this.state = port.tracked;
  }

  x(id: Accessor<string>): Accessor<X | null> {
    return createMemo(() => this.state.byId[id()] ?? null);
  }
}
```

Reads only. If rows are keyed by something other than `id`, pass
`{ keys: { rows: "userId" } }` to `createSolidStatePort`.

## 4. The React binding and its hooks

```ts
export class XReactNexus extends XNexus {
  readonly reactiveStore: ReadableStore<XState>;

  constructor(backend: XBackend) {
    const port = createZustandStatePort(createInitialXState());
    super(port, backend);
    this.reactiveStore = port.store;
  }
}

// apps/mobile/src/data/hooks/x.ts
export function useX(nexus: XReactNexus, id: string): X | null {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => state.byId[id] ?? null,
  );
}
```

A hook returning a fresh object needs an equality function (`shallow`) and
stable fallbacks (module-level empty arrays), or it re-renders on every change.

## 5. Wire it into HavenCore

1. Add `x: XNexus` to `HavenParts` in `packages/shared/src/core/havenCore.ts`,
   plus `readonly x: P["x"]` and the assignment in the constructor.
2. Add `x: new XSolidNexus(...)` to `createSolidParts` and
   `x: new XReactNexus(...)` to `createReactParts`.
3. Clear it in `HavenCore.clearSession`. A missed line here leaks state across
   accounts.
4. Load it where it belongs: `bootstrapSession` if every session needs it, a
   screen's effect if only that screen does.
5. Add it to `createTestHavenCore` in `packages/shared/src/core/__tests__/`.

## 6. Prove it

- **Shared behavior** — a test in `packages/shared/src/nexus/__tests__/` over
  `createPlainStatePort`.
- **Anything spanning nexuses** — `createTestHavenCore()`.
- **Solid reactivity** (fine-grained updates, effects that settle) — a
  `*.tier2.test.ts` (jsdom + the real Solid store).
- Break what the test guards and watch it fail before trusting it.

```
npm run typecheck && npm run mobile:typecheck && npm run test:unit && npm run test:tier2
```
