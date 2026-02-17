# Haven

Haven is a desktop community chat app built with Electron.

The goal is simple. Keep the parts people actually love about community chat, cut the bloat, and keep the system understandable enough that anyone can inspect how it works.

## Why this exists

I wanted a Discord-like app that feels focused again.

- Fast text chat
- Server scoped roles and permissions
- Clear ownership and moderation controls
- Voice channels that work in a practical MVP setup

This project started as a personal build to prove that a modern chat app can still be clean, predictable, and user respectful.

## Why I built it this way

- SQL first schema design so behavior is explicit and reviewable
- Role and permission model scoped to each server
- RLS policies as the core access control layer
- Realtime where it matters, not everywhere
- P2P voice first for MVP, with a clear path to SFU later

I care more about correctness and trust than fancy abstractions.

## Stack

- Electron Forge
- React + TypeScript
- Tailwind + shadcn/ui components
- Supabase (Auth, Postgres, Realtime, Edge Functions)
- WebRTC for voice transport
- Xirsys TURN for relay support when direct P2P is not possible

## Safety and trust model

No app is "trust me" safe by default, so Haven is built to be inspectable.

- Client uses Supabase publishable key only
- Service role key is not shipped in the renderer
- RLS policies are defined in SQL migrations and versioned in this repo
- Voice relay secrets stay in Supabase Edge Function secrets, not in client code
- Schema, permission logic, and migrations are committed and readable

## How to verify it yourself

1. Review client auth/data usage in `src/lib/supabase.ts` and backend seam files in `src/lib/backend/`.
2. Review access control logic in `supabase/migrations/`.
3. Review voice secret handling in `supabase/functions/voice-ice/index.ts`.
4. Run the app against your own Supabase project and inspect network calls in devtools.

## Current status

Haven is early and actively evolving. The focus right now is MVP completeness, permission correctness, and stable desktop updates.

## Local development

```bash
npm install
cp .env.example .env
# fill .env values
npm start
```

Package build:

```bash
npm run make
```

