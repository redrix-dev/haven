# Hardening Audit (Phase 5)

## Purpose
Track the Phase 5 hardening scope and the issues/risks the pass is intended to address.

This document is the source of truth for:
- what was intentionally included,
- what was intentionally deferred,
- how fixes map back to audit findings or test failures.

## Scope Freeze (Current)
Included in this pass:
- DB/RLS regression suite (SQL + `psql`)
- backend seam contract/integration tests (local Supabase)
- minimal renderer tests for notification/DM UX
- abuse-control hardening (friend requests, DMs, DM reports)
- DM moderation status transition hardening
- mention trigger guardrails
- username case-insensitive uniqueness enforcement
- CI automation
- docs/runbooks

Deferred/backlogged:
- `community_notification_preferences`
- `channel_notification_preferences`
- server/channel notification preference UI
- mention preference hierarchy beyond global defaults (Phase 4)
- native OS desktop notifications
- full Electron e2e automation

## Audit Categories and Findings

### 1) Authorization / RLS Drift
Status: `must-fix`

Findings:
- RLS-sensitive features (notifications/social/DMs/moderation/mentions) had no automated regression suite.
- Core community role/channel/message authorization regressions were still mostly manual to verify.

Fixes in this pass:
- Added SQL RLS/RPC regression suites under `supabase/tests/sql/*`
- Added role/JWT impersonation helpers under `supabase/tests/_helpers/*`

### 2) RPC Safety / Mutation Correctness
Status: `must-fix`

Findings:
- DM moderation status updates allowed broad transitions without an explicit transition matrix.
- Recent social/DM/report mutation RPCs lacked DB-enforced abuse throttles.

Fixes in this pass:
- Added `public.can_transition_dm_message_report_status(...)`
- Hardened `public.update_dm_message_report_status(...)`
- Added rate-limit helper functions and patched friend/DM/report mutation RPCs

### 3) Abuse Controls / Spam Amplification
Status: `must-fix`

Findings:
- Friend request spam not throttled server-side.
- DM send spam not throttled server-side.
- DM report spam not throttled server-side.
- Mention trigger had no fan-out cap per message.

Fixes in this pass:
- Rate limits inside `send_friend_request`, `send_dm_message`, `report_dm_message`
- Mention extraction capped to 20 unique handles per message
- DM report dedupe unique index `(message_id, reporter_user_id, kind)`

### 4) Data Integrity
Status: `must-fix`

Findings:
- Exact username friend search depends on case-insensitive uniqueness, but DB only had case-sensitive uniqueness.

Fixes in this pass:
- Collision precheck + normalized unique index on `lower(trim(username))`

### 5) Realtime / Client Robustness
Status: `partially addressed`

Findings:
- Reconnect/refresh storm behavior is still mostly validated manually.
- Sound replay dedupe behavior needs broader automated coverage over time.

Changes in this pass:
- Minimal renderer tests added for notification/DM UX entry points.
- CI now runs unit tests and backend/DB suites.

Follow-up backlog:
- deeper realtime subscription storm/load testing
- richer renderer integration coverage

### 6) Operational Resilience
Status: `must-fix`

Findings:
- No explicit notification retention maintenance path was documented/implemented.
- No CI enforcement for RLS regressions.

Fixes in this pass:
- Added notification maintenance RPC (`dismiss_old_read_notifications_before`)
- Added GitHub Actions CI jobs for lint/typecheck/unit + Supabase DB/RLS + backend contract tests

## Must-Fix Completion Bar (Phase 5)
- [ ] `npm run lint` green
- [ ] `npx tsc --noEmit --project tsconfig.json` green
- [ ] `npm run test:unit` green
- [ ] `npm run test:db` green (local)
- [ ] `npm run test:backend` green (local after fixtures)
- [ ] CI workflow green
- [ ] docs/runbooks updated

## Files to Know
- `supabase/migrations/20260222_000036_phase5_hardening_and_test_support.sql`
- `supabase/tests/`
- `scripts/test/*`
- `.github/workflows/ci.yml`
- `docs/testing/rls-and-hardening-runbook.md`

