# Haven

**Community chat for people who give a damn.**

[![Platforms](https://img.shields.io/badge/platforms-iOS%20·%20Desktop%20·%20Web-3b82f6)](#platforms)
[![Stack](https://img.shields.io/badge/TypeScript-Solid%20·%20Tauri%20·%20React%20Native-3178c6)](#stack)
[![Backend](https://img.shields.io/badge/backend-Supabase%20·%20LiveKit-3ecf8e)](#stack)
[![CI](https://github.com/redrix-dev/haven/actions/workflows/ci.yml/badge.svg)](https://github.com/redrix-dev/haven/actions/workflows/ci.yml)
[![License: BSL 1.1](https://img.shields.io/badge/license-BSL%201.1-orange)](./LICENSE.md)

Haven is a real-time community chat platform across desktop, web, and iOS. It exists because community chat stopped feeling like it was built for communities — and proving that it could be done differently was worth the effort.

![Haven chat interface](docs/assets/screenshot-chat.png)

---

## Highlights

- **Access control enforced in Postgres, not the UI.** Every permission check is an RLS policy or a security-definer RPC — the client reflects what the database says, it does not decide. A user with devtools cannot bypass it. [How it works ↓](#security-lives-in-the-database-not-the-ui) · [Verify it yourself ↓](#verifying-the-security-model)
- **One framework-free core, three clients.** Domain logic, types, and state live in `packages/shared` with zero React or Solid imports, bound to React Native on iOS and Solid on desktop/web. CI enforces the boundary mechanically. [How it works ↓](#the-monorepo-is-structured-around-a-stable-shared-core)
- **A custom OTA pipeline for iOS.** A from-scratch Expo Updates-compatible toolchain — asset hashing, bundle generation, manifest serving via a Supabase Edge Function — that replaces EAS Update and keeps update infrastructure under the same roof as the backend. [How it works ↓](#architecture)
- **Real-time everything.** Markdown text channels, WebRTC voice over LiveKit, direct messages, friends, media upload, moderation, and push notifications — over a single per-user realtime subscription.

---

## What it is

Haven gives streamers and their communities a space that works the way they'd expect — without the algorithmic feeds, ad targeting, or identity verification schemes that have crept into the platforms people used to love.

- Invite-only community spaces with server-scoped roles and permissions
- Real-time text channels with full markdown composition and rendering
- Voice channels via WebRTC
- Direct messages, friends, notifications, and push notifications
- Media upload and community management tools
- A moderation system enforced at the database level, not the client
- A permission model that's readable, versioned, and verifiable

## Platforms

**iOS** is in active TestFlight distribution and is the current production target. **Desktop and web** are being rebuilt on Tauri + Solid — the previous Electron/React clients shipped to production, proved the product, and were retired in favor of a lighter shell and a faster renderer. The rebuild runs against the same shared core and backend that mobile uses today.

The iOS client runs on a custom OTA update pipeline built on top of Expo Updates — asset hashing, bundle generation, and manifest serving are handled by a local toolchain that publishes to a Supabase-backed Edge Function. This replaces EAS Update entirely and keeps the update infrastructure under the same roof as the rest of the backend. Everything outside of voice works on mobile: DMs, reports, modmail, push notifications, community creation, invites, friends, media upload, and full rich text composition and rendering via [`react-native-enriched-markdown`](https://github.com/software-mansion-labs/react-native-enriched-markdown).

---

## Why it's built this way

### Security lives in the database, not the UI

Most chat platforms treat access control as a presentation problem — hide things from users who shouldn't see them. Haven treats it as a data problem. Every permission check is a Postgres RLS policy or a security-definer RPC. The client reflects what the database says. It does not decide.

This matters because a client can lie. A user can bypass UI guards with devtools. A Postgres row-level security policy enforced at the query level cannot be bypassed from the client regardless of what the frontend does. Moderation visibility, ban enforcement, channel access — all of it bottoms out at the database.

### The anon key being public is intentional

Haven uses Supabase's publishable anon key on the client. This is the correct approach, not a shortcut. The anon key cannot do anything the RLS policies do not permit. The service role key never ships in the renderer. Voice relay credentials live in Edge Function secrets and are only returned after the function validates the requesting user's JWT and confirms channel membership before responding.

### The source is public for the same reason

The schema, RLS policies, migration history, and voice relay function are all readable in this repo. If the security model works, it should hold up to inspection. If it doesn't, hiding it wouldn't make it safer.

### The monorepo is structured around a stable shared core

Business logic, types, and domain state live in `packages/shared` and are platform-agnostic — framework-free TypeScript with no React or Solid imports allowed (CI enforces this). Platform-specific behavior is isolated to each app target through a registration pattern rather than leaking into shared code. The iOS client and the Tauri/Solid rebuild run against the same tested core.

---

## Stack

| Layer             | Technology                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| Desktop & Web     | Tauri + Solid (in rebuild; previous Electron/React clients retired)         |
| iOS               | React Native + Expo (dev client, TestFlight)                                |
| Language          | TypeScript                                                                  |
| UI                | Solid (desktop/web), UniWind + RN primitives (iOS)                          |
| Backend           | Supabase (Auth, Postgres, Realtime, Edge Functions)                         |
| OTA Updates (iOS) | Custom Expo Updates-compatible pipeline via Supabase Edge Function          |
| Voice             | LiveKit Cloud + WebRTC                                                      |
| State             | Framework-free core (`zustand/vanilla`) with per-platform reactive bindings |
| Monorepo          | `packages/shared` across all platforms                                      |

---

## Architecture

At a glance — one law, dependencies point inward:

```
packages/shared (pure logic)  →  per-platform cache  →  per-platform UI
   framework-free TypeScript      React (iOS) /            React Native (iOS) /
   shared by every platform       Solid (desktop, web)     Solid (desktop, web)
```

Haven is a monorepo with two app targets and two core packages:

- `apps/mobile` — React Native + Expo, actively distributed via TestFlight
- `apps/tauri` — Tauri shell for the desktop/web rebuild (in progress)
- `packages/shared` — framework-free types, domain state, and business logic shared across all platforms
- `packages/solid-client` — Solid UI layer for the desktop/web rebuild

Domain state lives in framework-free stores (`zustand/vanilla`) inside `packages/shared`; each platform binds those stores to its own reactivity system (React hooks on mobile, Solid signals on desktop). Components subscribe only to the slice of state they need, which produces real and measurable render isolation rather than theoretical benefits.

The iOS OTA pipeline is a custom implementation of the Expo Updates protocol. A local toolchain handles asset fingerprinting, bundle generation, and manifest construction. The manifest is served by a Supabase Edge Function and the client fetches and applies updates at launch without going through EAS. This gives full control over the update cadence and keeps update infrastructure consolidated with the rest of the backend.

Full documentation — engineering principles, architecture, the active rebuild plan, the backlog, and the release cadence — starts at [docs/README.md](docs/README.md).

---

## Verifying the security model

1. Client auth and data access — `packages/shared/src/lib/createHavenSupabaseClient.ts`
2. RLS policies and schema — `supabase/migrations/`
3. Voice secret handling — `supabase/functions/voice-token/index.ts`

Run the app against your own Supabase project and inspect network calls in devtools. Nothing load-bearing is hidden.

---

## Testing

Haven includes a local Supabase-backed regression harness covering SQL, RLS policies, and backend seam contracts.

```bash
npm run test:db        # SQL + RLS regression suite via psql against local Supabase
npm run test:backend   # Backend seam contract and integration tests
npm run test:unit      # Shared-core and mobile unit tests
npm run test:report    # Human-readable proof report with full logs
```

---

## Status

Haven is in active production use on iOS. The desktop and web clients are being rebuilt on Tauri + Solid against the same shared core; the previous Electron and React web clients shipped to production and were retired in June 2026.

---

## License

Haven is source-available under the [Business Source License 1.1](./LICENSE.md). The source is inspectable but commercial use, competing platforms, and hosted clones require a separate license.

Change Date: 2030-01-01 · Change License: MIT · Inquiries: legal@redrixx.com
