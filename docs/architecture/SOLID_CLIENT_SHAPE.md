# The Solid client shape

The committed folder shape and dependency law of `packages/solid-client`. This was
decided **before** the UI build on purpose — the rules below are enforced by ESLint
from file one, so the shape can't erode one convenient import at a time. If this
file disagrees with the code, the code wins and this file gets fixed in the same
change. Governing mindset: [PRINCIPLES.md](../PRINCIPLES.md).

---

## Why this shape exists (the Electron lesson)

The retired Electron client died of a specific disease: **code organized by
technical role instead of by feature.** The renderer file was "the place where
rendering happens," so every feature had a legitimate claim to live there, and it
grew with the product forever. Moving everything into an orchestrator file didn't
fix it — "orchestration" is also a role, so it was the same god file with a new
name, one layer deeper.

The test that catches this disease early:

> **When I add feature N+1, what files do I touch?**

In a role-organized app the answer is "the same god files everyone touches," and
they grow without bound. In this shape the answer is **one new folder plus one
route registration line.** That is the contract every rule below exists to protect.

## The shape

```
packages/solid-client/src/
  App.tsx          Mounts providers + routes + window chrome. NOTHING else.
                   This file stays small forever — that's the whole point.
  bridge.ts        Shell-agnostic capability interface (Tauri/browser inject impls).
  routes/          The registration point: maps addresses → feature views.
                   Includes popout routes. The ONLY layer that imports features.
  features/        Vertical slices — one folder per product feature
                   (community, direct-messages, voice, settings, …).
                   Mirrors mobile's apps/mobile/src/features/ naming.
  components/ui/   Shared DUMB primitives (Button, Avatar, …). No data access,
                   no feature knowledge. Props in, JSX out.
  contexts/        Solid providers (SessionProvider, …).
  auth/            The auth service layer (framework-free imperative calls).
  data/            Solid caches + accessors — the reactive read layer.
                   Shape and rules: its own README (data/README.md).
  core/            HavenSolidCore — the session composition root.
```

## The dependency law

Dependencies point **down** this table, never up, never sideways between features.

| Layer           | May import                                                 |
| --------------- | ---------------------------------------------------------- |
| `App.tsx` (app) | routes, contexts, core, ui, other root files               |
| `routes/`       | features (**index barrel only**), contexts, core, ui       |
| `features/*`    | data, ui, contexts, auth, core — **never another feature** |
| `contexts/`     | core, auth, data                                           |
| `auth/`         | core                                                       |
| `core/`         | data                                                       |
| `data/`, `ui/`  | nothing above — only `@shared` and solid-js                |

(Everything may import `@shared` — that's the floor under all of it.)

Three rules with teeth, all enforced by the **"Solid client shape boundaries"**
section of [eslint.config.mjs](../../eslint.config.mjs) (the
`boundaries/dependencies` and `no-restricted-imports` rules), which runs in
`npm run lint` and therefore in `test:cleave`:

1. **Features never import each other.** If two features need the same thing, it
   moves **down** — into `data/`, `components/ui/`, or `@shared`. When a lint
   error blocks you, the answer is almost always "move the shared thing down a
   layer," not "allow the import."
2. **A feature is entered only through its `index.ts` barrel.** The barrel is the
   feature's public surface; everything else inside the folder is internal and
   free to change without anyone outside noticing.
3. **`solid-client` never imports `@tauri-apps/*`** (or react, or mobile's cache).
   The same app must run under Tauri and in a plain browser tab; shell
   capabilities are injected at bootstrap through `bridge.ts`.

## What a feature is

A feature is a **vertical slice**: its views, its components, its local state
wiring, in one folder. The boundary is the contract — the **inside** of a feature
is deliberately unregulated. A three-file feature does not need
`components/views/hooks` subfolders; a big one can have whatever internal
structure it wants. Forcing identical internal taxonomy on every slice is
ceremony, not architecture (mobile's features differ internally too, and that's
fine).

Rules of thumb:

- It renders a screen or major surface a user navigates to → **feature**.
- It's a visual primitive any feature might use, with no data access → **`components/ui/`**.
- It's reactive state more than one feature reads → **`data/` accessor**.
- It's logic that isn't Solid-specific → **`@shared`** (the three-layer law,
  [ARCHITECTURE.md](../ARCHITECTURE.md)).

Feature folder names mirror mobile's `features/` domains wherever the domain
exists on both platforms — cross-platform parity in naming is worth more than any
local preference.

## The window model

**A window is an OS-level viewport pointed at a route.** The Solid app does not
know or care how many windows exist — there is no "main window code" and "popout
code," there are only routes.

- The main window loads the app at the root route.
- A popout (voice, later maybe more) is a **second Tauri window pointed at a
  popout route** (e.g. `/popout/voice`). The app boots, sees the address, renders
  that surface. No architectural change per popout — just a route.
- `apps/tauri` owns **window management**: creating windows, sizing,
  always-on-top, deciding which route each window loads. That's shell capability,
  same injection seam as everything else.
- The web shell maps the same routes to URLs; popouts become `window.open` or
  inline panels. The app doesn't change.

**Known cost, written down so future-us isn't surprised:** each Tauri window is a
separate webview with **separate JS state**. Solid stores do not magically sync
across windows. When the first popout lands, the sync strategy (shell-relayed
events vs. popout fetches its own data) gets decided and documented — it must not
be hacked in on an assumption of shared memory.

## Routing

`@solidjs/router` is installed and mounted: `App.tsx` mounts `<Router>`, and
`routes/index.tsx` exports the `RouteDefinition[]` it renders. New feature = new
folder in `features/` + one registration in `routes/`. `App.tsx` gains a line
only when providers or window chrome change.

**Router-mode decision record (2026-06-10):**

1. **History mode is the default.** Route definitions are mode-agnostic — the
   integration is one line at the mount point in `App.tsx`, so this is a cheap
   decision to revisit per shell, never a rewrite.
2. **Web never compromises on history mode.** Real URLs
   (`haven.app/community/x`) are shareable product surface; hash URLs would be a
   permanent cosmetic scar. Web production needs the standard one-line SPA
   rewrite in the Vercel config when that shell lands.
3. **Tauri production reload is a known-unknown.** Dev is fine (Tauri loads the
   Vite server, which falls back to `index.html` on any path). The bundled app
   serves from Tauri's custom protocol, and whether reloading on a deep path
   like `/community/x` resolves to `index.html` or 404s gets **tested
   empirically at the first `tauri:build` smoke test** — don't trust anyone's
   memory of protocol fallback behavior, including ours. If it 404s, the
   contained fix: flip the Tauri shell to hash routing (desktop has no URL
   aesthetics — nobody sees the address bar) or configure the protocol
   fallback. Either way, zero route definitions change.
