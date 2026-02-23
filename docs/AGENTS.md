# AGENTS.md — Haven Application-Wide Contributor Guide

> File location: `docs/AGENTS.md`
>
> Intended scope: **the entire Haven application**, not only documentation.
> Keep this file in `docs/`, but treat it as the canonical playbook for AI-assisted work across the repo.

---

## 1) Mission and Product Context

Haven is a desktop community chat platform (Discord alternative) optimized for:
- practical realtime messaging,
- server-scoped roles and permissions,
- privacy/trust via inspectable architecture,
- voice channels that work today and can scale later.

Current stack:
- Electron (main + preload + renderer boundary),
- React + TypeScript UI,
- Supabase Auth/Postgres/Realtime/Storage/Edge Functions,
- WebRTC voice with TURN mediation (Xirsys via edge function),
- SQL-first schema + RLS as enforcement core.

Primary product reality:
- Solo-maintained, fast-moving, shipping-oriented codebase.
- Documentation and migrations are first-class operational artifacts.

---

## 2) Non-Negotiable Architecture Invariants

When changing code, preserve these invariants unless explicitly redesigning them:

1. **DB-enforced authorization**
   - UI convenience checks are not trusted.
   - Final authority is Postgres + RLS + SQL RPC helpers.

2. **Renderer/Main privilege separation**
   - Renderer must stay unprivileged.
   - Node/Electron access should go through preload + typed desktop client.

3. **Service secrets never in renderer**
   - Anon/publishable credentials only in client.
   - TURN/service secrets remain in trusted server-side runtime (Edge Function secrets).

4. **Backend seam is strategic**
   - Feature code should depend on backend interfaces, not low-level ad hoc data calls.

5. **Inspectable behavior over hidden magic**
   - Schema, permissions, and behavior should be traceable in repo.

---

## 3) Repo Structure Cheat Sheet

- `src/main.js`, `src/preload.js`, `src/main/*`
  - Electron main/preload runtime and OS integrations.
- `src/renderer.tsx`, `src/components/*`, `src/contexts/*`
  - Renderer orchestration and UI.
- `src/assets/*`
  - Renderer-bundled UI assets (images/audio/fonts) imported by React/TypeScript code.
  - Use for assets that should ship with the renderer bundle via webpack imports.
- `src/lib/backend/*`
  - Backend abstraction layer (control plane + community data).
- `src/lib/voice/*`
  - Voice-specific client behavior (ICE acquisition, etc.).
- `src/shared/*`
  - Shared contracts/utilities (desktop types/client, IPC keys/validation).
- `assets/*` (repo root)
  - Packaging/build assets (app icons, installer branding, forge/packager-referenced files).
  - These are separate from `src/assets/*` because they are consumed by build tooling, not treated as
    renderer-public assets unless explicitly copied/packaged for renderer access.
- `supabase/migrations/*`
  - Source of truth for schema, RLS, and policy evolution.
- `supabase/functions/*`
  - Trusted edge logic (voice ICE, workers, maintenance routines).
- `docs/*`
  - Architecture, process, and operational context.

---

## 4) Coding Conventions (Application-Wide)

## 4.1 General
- Prefer small, composable functions over large multi-purpose blocks.
- Keep naming explicit and domain-oriented (`community`, `channel`, `role`, `permission`).
- Avoid introducing hidden implicit behavior.
- Use existing utility layers before adding new one-off helpers.

## 4.2 TypeScript and React
- Prefer explicit types at module boundaries.
- Keep side effects isolated; avoid effect logic that mutates unrelated domains.
- Preserve predictable state transitions; avoid race-prone async patterns when possible.
- If adding complex state, prefer extracting focused hooks/modules over increasing `renderer.tsx` complexity.
- When using browser APIs with strict `lib.dom` typings (for example Web Audio `AnalyserNode` buffers),
  match the exact expected typed array shape in refs/arguments (e.g. `Uint8Array<ArrayBuffer>`),
  not a broader alias that may resolve to `ArrayBufferLike`.
- Treat DOM/Web API type signatures as part of the contract: lint passing is not enough to validate
  renderer TypeScript changes.

## 4.3 Electron boundary discipline
- Do not import `electron`, `node:*`, or main-process internals into renderer feature code.
- Keep desktop API changes synchronized across:
  1) shared desktop types,
  2) preload implementation,
  3) renderer desktop client.
- Reuse centralized IPC keys/validators; avoid ad hoc channel strings.

## 4.4 Supabase and DB access
- Prefer backend seam APIs (`src/lib/backend/*`) rather than raw scattered client queries in UI surfaces.
- Treat migrations as auditable contracts; explain *why* in SQL comments where non-obvious.
- Avoid policy bypasses for convenience.

## 4.5 Security hygiene
- Never commit secrets, raw tokens, or environment values.
- Avoid logging sensitive auth/session payloads.
- Validate external inputs at trust boundaries (IPC payloads, edge function payloads, mutation inputs).

---

## 5) Documentation Conventions (Still Required)

Even for code changes, keep docs in sync when behavior changes.

For subsystem docs include:
1. Purpose,
2. Current design,
3. Trust/security boundary,
4. Failure modes/edge cases,
5. Extension path,
6. Files to know.

Docs should be concrete, testable, and cross-linked to related docs.

---

## 6) Workflow Rules for AI-Assisted Development

1. **Read before write**
   - Inspect relevant code + docs + migrations first.

2. **Change minimally, coherently**
   - Modify the smallest set of files that fully solves the issue.

3. **Preserve invariants**
   - If a change alters trust boundaries, call it out explicitly.

4. **Prefer extension over rewrite**
   - Incremental refactors are favored unless a rewrite is requested.

5. **State assumptions**
   - If behavior is uncertain, annotate what was verified vs inferred.

6. **Ship-safe bias**
   - Add guardrails (validation, error handling, logging hooks) when touching risky codepaths.

---

## 7) Commands and Validation

Run from repo root for baseline validation:

```bash
npm run lint
```

When making behavior changes, also run the most relevant targeted checks available in repo tooling.
For TypeScript changes (especially renderer/UI and browser API integrations), run a typecheck:

```bash
npx tsc --noEmit --project tsconfig.json
```

This catches API-signature mismatches that ESLint will not catch (for example strict DOM generic types).
If no test exists for a risky path, add a minimal one if practical (and keep it).

---

## 8) Off-Limits / High-Risk Actions

Do **not** introduce changes that:
- expose privileged secrets to client/runtime logs,
- weaken RLS or permission checks without explicit migration rationale,
- bypass preload boundary with direct renderer Node/Electron usage,
- add destructive scripts/migrations without clear rollback strategy,
- create silent auth or moderation behavior changes without documentation.

---

## 9) Domain-Specific Engineering Expectations

When touching these areas, ensure:

### Auth
- Session transitions are explicit and recoverable.
- Deep-link auth paths handle missing/expired tokens safely.

### Realtime messaging
- Reconnect and out-of-order events do not corrupt visible state.
- High-frequency updates avoid unnecessary reload storms.

### Roles/permissions/moderation
- UI gating mirrors DB capabilities, but DB remains enforcement source.
- Hierarchy rules remain consistent for role and overwrite edits.

### Voice
- Authorization failures are distinguished from transient network failures.
- Device change/join/leave paths clean up peer state predictably.

### Desktop updates and OS integrations
- Failure paths degrade gracefully and are user-understandable.

---

## 10) PR and Change-Note Expectations

For each change, clearly state:
- What changed,
- Why now,
- Risk level,
- Validation performed,
- Follow-up work (if deferred).

If runtime behavior changes, include docs updates in the same PR whenever feasible.

---

## 11) Drift Control and Maintenance

- Keep architecture docs aligned with current code paths.
- Mark potentially stale docs with a warning and revalidation target.
- Prefer references to stable seams/contracts over brittle implementation details.
- Revisit this guide as architecture evolves (backend routing, SFU migration, moderation expansion, etc.).

---

## 12) Quick Final Checklist

Before finalizing any repo change:
- [ ] Architecture invariants preserved (or explicitly redesigned).
- [ ] Security boundaries respected.
- [ ] Relevant docs updated for behavior/contract changes.
- [ ] Validation commands executed and results recorded.
- [ ] No secrets/sensitive values introduced.

