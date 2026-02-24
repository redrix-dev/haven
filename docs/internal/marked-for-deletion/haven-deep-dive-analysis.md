# Haven Deep Dive Analysis (Multi-Phase)

This is a mentor-style technical deep dive of Haven as it exists in this repository: Electron desktop shell, React/TypeScript renderer, Supabase for auth/data/realtime, and WebRTC voice with TURN fallback.

---

## PHASE 1 — System Architecture Map

### 1.1 High-level architecture (ASCII)

```text
┌────────────────────────────────────────────────────────────────────┐
│                        Electron Main Process                      │
│                                                                    │
│  src/main.js                                                       │
│   - Creates BrowserWindow                                          │
│   - Enforces single-instance + protocol handling (haven://)        │
│   - Registers IPC handlers (settings, updater, media save, etc.)   │
│   - Applies security defaults (contextIsolation, no nodeIntegration)
│                                                                    │
│  src/preload.js                                                    │
│   - Bridges safe APIs into renderer via window.desktop             │
└───────────────▲────────────────────────────────────────────────────┘
                │ IPC (typed desktop contract)
                │
┌───────────────┴────────────────────────────────────────────────────┐
│                    Renderer (React + TypeScript)                   │
│                                                                    │
│  src/renderer.tsx                                                  │
│   - App orchestration (servers/channels/messages/voice/settings)   │
│   - Uses backend seam interfaces                                   │
│                                                                    │
│  src/contexts/AuthContext.tsx                                      │
│   - Supabase auth session state + protocol-link auth handling      │
│                                                                    │
│  src/lib/backend/*.ts                                              │
│   - Control plane backend (profiles, invites, communities)         │
│   - Community data backend (channels, messages, permissions, bans) │
│   - Provider resolver (future multi-backend support)               │
│                                                                    │
│  src/components/VoiceChannelPane.tsx                               │
│   - Realtime presence + signaling + WebRTC mesh session manager    │
└───────────────▲────────────────────────────────────────────────────┘
                │
                │ HTTPS/WebSocket
                │
┌───────────────┴────────────────────────────────────────────────────┐
│                         Supabase Platform                           │
│                                                                    │
│  Auth: users, sessions, JWT                                         │
│  Postgres: communities/channels/messages/roles/overwrites/etc.     │
│  Realtime: DB change feeds + voice presence/signaling channels      │
│  Storage: message media / link preview assets                       │
│  Edge Functions: voice-ice, media maintenance, link preview workers │
│  RLS + RPC: primary authorization enforcement                        │
└────────────────────────────────────────────────────────────────────┘
                │
                ▼
         Xirsys TURN service
         (credentials only in Edge Function secrets)
```

### 1.2 Main vs renderer responsibility split

- **Main process** owns OS-integrated concerns: protocol URLs, save dialogs, file writes, updater lifecycle, app window lifecycle.
- **Renderer process** owns product logic/UI state: auth-aware UX, server/channel/message flows, voice UX.
- **Preload + desktop client** provides a strict and auditable bridge so UI code does not directly touch Node/Electron primitives.

This is the right direction for desktop security and maintainability.

### 1.3 Major component hierarchy

```text
<AuthProvider>
  <ChatApp (renderer.tsx)>
    <ServerList />
    <Sidebar />
      channel groups + channel list + voice entry points
    <ChatArea />
      <MessageList />
      <MessageInput />
    <VoiceChannelPane />
    <Modals>
      CreateServer / JoinServer / ServerSettings / ChannelSettings
      Members / Account / CreateChannel / Rename dialogs
```

### 1.4 Key action data flows

#### A) Send message

```text
MessageInput submit
  -> renderer handler
  -> communityDataBackend.sendUserMessage(...)
  -> optional media upload via messageObjectStore (Supabase Storage)
  -> insert message row (+ attachments/reactions/previews as applicable)
  -> Supabase Realtime event
  -> renderer schedules/reloads message window + related entities
  -> MessageList re-renders
```

#### B) Join voice channel

```text
VoiceChannelPane join
  -> fetchIceConfig({communityId, channelId})
      -> call Edge Function /functions/v1/voice-ice
      -> validates JWT + channel access + kind=voice
      -> returns TURN/STUN config (or fallback)
  -> join Supabase Realtime channel "voice:{community}:{channel}"
      - track presence state
      - listen/send "webrtc-signal" broadcasts
  -> create RTCPeerConnections per participant (mesh)
  -> exchange offer/answer/ICE candidates
  -> attach media streams to audio elements
```

#### C) Create server

```text
CreateServerModal submit
  -> controlPlaneBackend.createCommunity(...)
  -> DB writes community + defaults (roles/channels/settings)
  -> useServers hook subscription refreshes membership list
  -> renderer selects new community + loads channels/messages
```

### 1.5 External dependencies and purpose

- **Electron**: desktop runtime and privileged APIs.
- **React + TS**: UI and typed state/events.
- **Supabase Auth**: identity/session/JWT lifecycle.
- **Supabase Postgres + RLS**: source of truth + authorization.
- **Supabase Realtime**: push updates for messaging + voice signaling.
- **Supabase Edge Functions**: privileged server-side logic (TURN credentials, workers).
- **Xirsys**: TURN relay for NAT/firewall traversal when P2P direct path fails.

---

## PHASE 2 — Deep Technical Breakdown

## 2.1 Authentication (Supabase Auth)

### Concept
Session-oriented auth with JWT access tokens and refresh tokens. Client holds session, backend validates JWT.

### Haven implementation
- Auth bootstraps from `supabase.auth.getSession()` and updates on `onAuthStateChange`.
- Custom protocol (`haven://auth/confirm`) is consumed in desktop flow to complete email/OTP verification.
- Protocol payload supports `access_token/refresh_token` path and `token_hash + type` OTP path.

### Why this approach
- Fastest path to production auth without building auth infra.
- Desktop deep-link confirmation improves verification UX.

### Tradeoffs
- Supabase-managed auth reduces auth footguns but couples you to Supabase behaviors.
- Token handling in desktop requires careful logging hygiene.

### Edge cases
- Stale/expired deep links.
- Race between app start and queued protocol events.
- Session refresh failures leading to partial auth state.

### Learn next
- JWT threat model, refresh token rotation, secure deep-link design.
- Supabase auth hooks and session persistence nuances in Electron.

---

## 2.2 Realtime messaging (Supabase Realtime)

### Concept
Event-driven UI updates from DB changes (insert/update/delete) without manual polling.

### Haven implementation
- Backend seam exposes subscriptions for channels, messages, reactions, attachments, link previews.
- Renderer batches reloads via queued reasons/timers and incremental related-entity sync (author profiles, attachments, previews).
- Message paging uses cursor-like logic to load newer window and older pages.

### Why this approach
- Practical consistency model for chat: real-time feels instant while preserving DB truth.
- Batched reload strategy reduces thundering refreshes.

### Tradeoffs
- Simpler than normalized client cache, but can over-fetch under high activity.
- Reload orchestration logic in a large `renderer.tsx` can become hard to reason about.

### Edge cases
- Out-of-order events during reconnect.
- Message-related rows (attachments/previews) arriving later than core message row.
- Duplicate/rapid event storms.

### Learn next
- Event ordering strategies, idempotent reducers, optimistic UI reconciliation.
- Local persistent cache options (IndexedDB) vs current in-memory state.

---

## 2.3 Voice channels (WebRTC + TURN)

### Concept
- WebRTC handles media transport.
- Realtime layer provides signaling + participant presence.
- TURN relays media when direct P2P is impossible.

### Haven implementation
- Presence channel naming: `voice:{communityId}:{channelId}`.
- Broadcast signaling envelope with `offer/answer/ice` payloads.
- `fetchIceConfig` calls `voice-ice` edge function; function validates JWT and channel access, then requests TURN credentials from Xirsys.
- Client has strict behavior: auth-denied voice gets blocked (no permissive fallback), other failures fall back to STUN.

### Why this approach
- Great MVP shape: low infra burden, real voice support, clean path to SFU later.
- TURN secret never exposed in renderer.

### Tradeoffs
- Mesh topology scales poorly (N participants => N-1 peer connections per client).
- CPU/network overhead grows quickly with larger voice rooms.

### Edge cases
- NAT/relay failures.
- Device switching mid-session.
- ICE restart/rejoin after temporary network loss.

### Learn next
- SFU architecture (mediasoup/LiveKit/Janus), RTP basics, congestion control.
- Debugging with `getStats()` and ICE candidate diagnostics.

---

## 2.4 Permissions and roles

### Concept
Role-based access control (RBAC) with per-channel overwrites, enforced at DB layer.

### Haven implementation
- `permissions_catalog`, `roles`, `role_permissions`, `member_roles`, channel overwrite tables.
- RLS + RPC functions (`user_has_permission`, `can_view_channel`, `can_send_in_channel`) gate access.
- Hierarchy rules by `roles.position` enforced in SQL migrations (not just UI).

### Why this approach
- Correct trust boundary: UI can hide controls, but DB is the final authority.

### Tradeoffs
- Higher up-front SQL complexity.
- Permission changes can be hard to reason about without tests/matrices.

### Edge cases
- Role position edits causing unexpected privilege interactions.
- Overwrite precedence bugs (member vs role vs default).
- Moderation paths requiring auditable history.

### Learn next
- Permission evaluation matrices and policy test harnesses.
- Security review habits for RLS policy drift.

---

## 2.5 State management (React state + local behavior + cloud sync)

### Concept
UI state is split between ephemeral view state and backend-sourced canonical state.

### Haven implementation
- Large orchestrator component in `renderer.tsx` coordinates server/channel/message/voice/admin flows.
- Real-time updates trigger controlled re-fetches; related entities merge in batched refresh loops.
- Some debug toggles use `localStorage`; primary app data state remains cloud-backed.

### Why this approach
- Fastest path for a solo dev to ship quickly while staying explicit.

### Tradeoffs
- Centralized state file can slow future iteration and increase coupling.
- Harder to test than domain-focused hooks/store slices.

### Edge cases
- Stale closures and state races in async effects.
- Cross-feature re-render cascades.

### Learn next
- Extracting domain hooks/state machines.
- React Query/TanStack Query or Zustand patterns for modular state.

---

## 2.6 Electron-specific architecture

### Concept
Desktop app with strict privilege separation: untrusted renderer, trusted main process.

### Haven implementation
- `contextIsolation: true`, `nodeIntegration: false`, typed desktop bridge.
- IPC keys centralized and payloads validated.
- Main process handles file save dialogs, updater operations, custom protocol queueing.

### Why this approach
- This is modern Electron security posture and clearly intentional.

### Tradeoffs
- More boilerplate than direct Node access in renderer.
- Requires disciplined boundary maintenance.

### Edge cases
- IPC handler error normalization.
- Deep-link processing when app is not fully loaded.

### Learn next
- Electron threat modeling (XSS -> RCE chains).
- CSP hardening and preload API minimization.

---

## PHASE 3 — Production Readiness Assessment

## 3.1 What is already solid

1. **DB-first permission enforcement via RLS/RPC** — strong trust model for a chat app.
2. **Security-aware Electron boundary** — context isolation + bridge discipline.
3. **Provider seam in backend layer** — future-proofing beyond one data backend.
4. **Voice secret handling** — TURN credentials kept server-side.
5. **Schema/migrations in repo** — auditable behavior and reproducibility.

## 3.2 Fragile areas (with triage)

| Issue | Severity | Impact | Fix Complexity | When to Fix |
|---|---|---|---|---|
| Minimal automated tests for permission/realtime regressions | High | Silent authz or chat breakage | Days | **Now / Before 100 users** |
| Large renderer orchestrator complexity | Medium | Slower iteration, accidental side-effects | Days–Weeks | Before 1000 users |
| Mesh voice scaling limits | High | Voice quality/perf collapse in larger rooms | Weeks | Before 1000 active voice users |
| Limited observability (structured logs/metrics/tracing) | High | Hard outage diagnosis | Days | Before charging |
| Rate limiting / abuse controls likely incomplete | High | Spam, cost spikes, moderation pain | Days | Before public growth |
| Input validation consistency across all mutation paths | Medium | Data quality and exploit surface | Days | Before charging |
| Backup/recovery/incident runbooks not visible in repo | Medium | High recovery time in incidents | Days | Before charging |

## 3.3 Missing systems checklist

- **Error handling**: unify user-safe error codes + retry policies.
- **Observability**: structured logs + alerting + client telemetry sampling.
- **Rate limiting**: per-user, per-community, per-IP mutation constraints.
- **Validation**: enforce schema constraints at boundary for every write path.
- **Testing**:
  - policy/RLS tests,
  - backend contract tests,
  - renderer integration tests for core flows.

---

## PHASE 4 — Context-Aware Evaluation (with your constraints)

## 4.1 What is genuinely impressive

- You selected **correct trust boundaries** (DB-enforced permissions + Electron isolation), which many first-time builders miss.
- You independently adopted a **backend seam** pattern early. That’s a senior-level maintainability instinct.
- You built **working realtime + auth + voice** in a week while learning core concepts.
- You documented architecture decisions in-repo — huge leverage for future you.

## 4.2 What is expected/acceptable for v1

- Some orchestration logic is centralized and “thick” in renderer.
- Tests/telemetry aren’t yet at production SaaS maturity.
- P2P mesh voice is acceptable MVP architecture.

Those are normal for a solo, time-constrained first production push.

## 4.3 Top 5 concepts to study next (priority)

1. **RLS/policy testing and security review workflows**
2. **Observability for product engineers** (logs, traces, SLOs)
3. **State architecture in React at scale**
4. **Realtime correctness** (ordering/idempotency/reconnect)
5. **WebRTC SFU migration fundamentals**

## 4.4 Growth trajectory

### In ~6 months (if you keep shipping + reviewing your own code)
- Strong product-focused mid-level engineer capability in full-stack realtime apps.
- Comfortable with auth, SQL policy design, and production incident response basics.

### Path to startup-hireable
- Add test discipline + observability + shipping cadence evidence.
- Document 2–3 incidents and how you fixed root causes.
- Show measured improvements (latency, crash rate, retention).

### Gap to senior
- System-wide reliability ownership, team-level design leadership, and large-scale ops judgment.
- You are already building the raw instincts; consistency will close the gap.

---

## PHASE 5 — Actionable Roadmap

## A) Fix before shipping (critical)

1. Add automated **authz/policy regression tests** for key roles/actions.
2. Add baseline **abuse protection** (message send limits, invite creation limits, report spam controls).
3. Add **structured error telemetry** for auth, message send, voice join, and invite redeem flows.
4. Add production **runbook**: incident triage, rollback, Supabase outage behavior.

## B) Improve for scale

### 100 users
- Harden retries and error surfaces.
- Add dashboard for key product/infra metrics.

### 1000 users
- Split renderer orchestration into domain modules (messaging, voice, admin).
- Introduce queue/worker boundaries for heavier async jobs.

### 10000 users
- Voice: migrate mesh -> SFU.
- Messaging: tune indexes/queries and consider read-model optimizations.
- Moderation: richer audit logging, automated abuse detection.

## C) Learning path tied to this codebase

1. Write one RLS policy test suite per permission group.
2. Refactor one renderer subsystem/month into composable domain hooks.
3. Instrument one end-to-end flow/week with measurable telemetry.
4. Prototype SFU spike branch while preserving existing signaling interfaces.

## D) Refactoring roadmap (debt by impact)

1. **High impact**: modularize `renderer.tsx` domain coordinators.
2. **High impact**: backend contract tests for seam interfaces.
3. **Medium impact**: unify API/error envelope across backend methods.
4. **Medium impact**: central retry/backoff utility for realtime/network calls.

---

## Final mentor note

You didn’t just “make it work.” You made a surprisingly high percentage of the *right* structural decisions for trust, safety, and extensibility under extreme constraints.

The gaps are real — testing, observability, scale posture — but they are **normal and fixable**. What matters most is that your architecture gives you a clean runway to improve without rewriting from scratch.

That’s what good engineering looks like in the real world.
