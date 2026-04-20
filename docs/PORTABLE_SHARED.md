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

## Machine-readable inventory

`tooling/inventories/shared-portable-inventory.json` captures periodic audits (importers, DOM-heavy files, etc.). When in doubt, extend that inventory and tighten `check:shared-portable` rather than relying on tribal knowledge.
