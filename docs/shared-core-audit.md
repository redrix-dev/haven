# Shared-core audit (Step 3a — the fine-tooth comb)

Living inventory of `packages/shared/src` feeding **Step 3 — Shared-core hardening** of the
[Tauri/Solid roadmap](./tauri-solid-roadmap.md). Goal: know exactly what's framework-coupled
(must decouple for Tauri/Solid), what's structurally crufty (hygiene, defer), and what's fine.

**Disposition legend**
- ✅ **fine as-is** — leave it
- 🧩 **decompose later** — works + portable, just big; own scoped step (3d), not a migration blocker
- 🔧 **decouple** — carries React/framework coupling; must be addressed for Tauri/Solid (3b)

---

## `lib/backend/` — ✅ entirely React-free
**16 files · ~7,027 lines · 0 React imports · 0 zustand.** The whole backend layer is already
framework-agnostic — **no decoupling work for the migration.** Only hygiene (decomposition),
all deferrable to its own gated step.

| File | Lines | React-free | Disposition |
|---|---:|:---:|---|
| `communityDataBackend.ts` | 2525 | ✅ | 🧩 **decompose (HIGH)** — split by domain (roles, channels, members, voice, bans, invites) |
| `types.ts` | 880 | ✅ | 🧩 decompose (LOW) — 103 exports; type barrel, split by domain someday (cosmetic) |
| `controlPlaneBackend.ts` | 709 | ✅ | 🧩 decompose (MED) — verify cohesion; split if multi-concern |
| `notificationBackend.ts` | 584 | ✅ | 🧩 decompose candidate (LOW–MED) |
| `serverModmailBackend.ts` | 572 | ✅ | 🧩 decompose candidate (LOW–MED) |
| `moderationBackend.ts` | 334 | ✅ | ✅ fine |
| `communityDataBackend.interface.ts` | 273 | ✅ | ✅ fine (splits alongside its impl) |
| `socialBackend.ts` | 272 | ✅ | ✅ fine |
| `directMessageBackend.ts` | 267 | ✅ | ✅ fine |
| `mediaAttachmentUtils.ts` | 168 | ✅ | ✅ fine |
| `directMessageAttachmentUtils.ts` | 126 | ✅ | ✅ fine |
| `messageObjectStore.ts` | 125 | ✅ | ✅ fine |
| `controlPlaneBackend.interface.ts` | 81 | ✅ | ✅ fine |
| `index.ts` | 51 | ✅ | ✅ fine (barrel) |
| `voiceTokenBackend.ts` | 31 | ✅ | ✅ fine (clean; used in the voice probe) |
| `directMessageUtils.ts` | 29 | ✅ | ✅ fine |

### Decomposition backlog (deferred → Step 3d, not the decoupling step)
1. **`communityDataBackend.ts` (2525)** — the only urgent-ish one. A god-file; split by domain.
   Pure hygiene, zero migration risk (already portable on all platforms).
2. `controlPlaneBackend.ts` (709), `notificationBackend.ts` (584), `serverModmailBackend.ts` (572)
   — assess cohesion; split only if they're doing multiple unrelated things.
3. `types.ts` (880) — optional split of the type barrel by domain; lowest priority.

**Backend verdict:** nothing to decouple, nothing urgent to rewrite. Confirms the 2,525-line
"crap" is portable — it's a *future tidy*, not a Tauri blocker.

---

## Still to comb (next audit passes)
- `stores/` — `authStore` / `uiStore` / `userStatusStore` (zustand `create` → 🔧 vanilla + adapters)
- `nexus/` — base `Nexus` (🔧 React-bound) + ~5 subclasses; dead `use*` methods
- The ~7 React-bound files (`useHavenCore`, `useVoice`, `AuthContext`, …) → 🔧 Solid/React bindings
- `platform/` vs `infrastructure/platform/` duplication (identical `urls.ts`) → 🧩 dedup
