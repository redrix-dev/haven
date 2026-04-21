# Portable `packages/shared` boundary

This document is the **authoritative** rule set for what may live under `packages/shared/src`, how Supabase is wired, and where non-portable UI belongs.

## North star

Code under `packages/shared/src` should be **importable** from **web (Vite), Electron renderer, React Native (Metro), and Node (Vitest)** without host-specific polyfills or “remember to alias this on mobile.”

- **Web-only** (heavy DOM assumptions, Radix primitives, TipTap, etc.) and **Electron-only** renderer UI should **not** be added to `packages/shared` going forward. Prefer `packages/web-client` or `apps/web` / `apps/electron` (see below).
- **Data access** is centralized: hosts construct one `HavenSupabaseClient` via `createHavenSupabaseClient` and call `initializeHavenDataFromClient` so backends resolve through `createHavenDataRuntime` / `requireHavenDataRuntime()`.

## Composition root (Supabase)

1. **Hosts** read public URL + anon key from their own config (`process.env` on Vite/webpack, `expo-constants` `extra` on mobile, test harness env in Vitest).
2. They call `createHavenSupabaseClient(url, key, options)` then `initializeHavenDataFromClient(client, …)` from `@shared/lib/bootstrap/initializeHavenDataFromClient`.
3. Shared modules use **`getCommunityDataBackend`**, **`getControlPlaneBackend`**, etc. from `@shared/lib/backend`. Those accessors read the **runtime registry**, not `process.env` at import time.

There is **no** `packages/shared/src/lib/supabase.ts` singleton anymore; CI (`npm run check:shared-portable`) fails if it returns.

## Portable uploads

Binary uploads in shared portable paths use **`Blob`** (or `ArrayBuffer` wrapped as `Blob`) plus filename metadata — not web-only `File` in shared APIs. Web and other hosts may still obtain blobs from `<input type="file">` before calling shared code.

## Zustand and globals

Stores keep **cache and UI state**. They must **not** import backend singletons or call `getCommunityDataBackend()` internally. Call sites (hooks, message loaders, etc.) obtain backends from `@shared/lib/backend` and pass narrow interfaces into store actions (see `permissionsStore.ensureElevatedInServer`).

## Where web UI lives

- **Reusable DOM UI** extracted from the old `@shared/app/ui/*` tree lives in **`packages/web-client/src/app-ui/`**. TypeScript path `@shared/app/ui/*` may still alias there for incremental migration of import strings.
- **Product-specific web surfaces** stay in `apps/web` and `apps/electron` as appropriate.

## Portable logic vs platform UI

Every module in `packages/shared/src` must be classified as one of:

- **portable-logic**: safe to import and execute in web, Electron renderer, React Native, and Vitest without host polyfills.
- **platform-ui**: web/desktop rendering code that is intentionally non-portable.

Rules:

1. Hooks, stores, orchestration, domain logic, backend accessors, and helpers that mobile imports are `portable-logic`.
2. `portable-logic` must not reference browser globals (`window`, `document`, `navigator`, `history`, `localStorage`, etc.) or web-only UI libraries.
3. Platform-specific behavior for `portable-logic` is provided by host-level runtime wiring, not per-feature wrappers.
4. React components under feature/app component folders may remain platform-specific when they are not imported by mobile.
5. If a module cannot meet `portable-logic` constraints, move it to a platform UI location or split out the portable core.

Anti-patterns:

- Adding `if (typeof window !== "undefined")` branches inside shared portable hooks to compensate for missing runtime support.
- Creating parallel mobile copies of logic-heavy hooks that already exist in shared.
- Introducing adapter/wrapper stacks per feature instead of one host composition root wiring surface.

## Machine-readable inventory

`tooling/inventories/shared-portable-inventory.json` captures periodic audits (importers, DOM-heavy files, etc.). When in doubt, extend that inventory and tighten `check:shared-portable` rather than relying on tribal knowledge.
