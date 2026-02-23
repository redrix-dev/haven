# Moderation Reports Architecture

## Purpose
Explain Haven's current moderation-report model, with emphasis on the new DM moderation review workflow and how it differs from server support reports.

## Current Design

### Separate Systems (Current v1)
- Server/community moderation/support reporting (existing `support_*` model)
- DM reporting + review (new `dm_message_reports` workflow)

DM report review is intentionally separate in v1 to avoid destabilizing the older moderation/reporting flows while the DM system matures.

### DM Report Tables
- `public.dm_message_reports`
- `public.dm_message_report_actions`

### DM Report Statuses
- `open`
- `triaged`
- `in_review`
- `resolved_actioned`
- `resolved_no_action`
- `dismissed`

### Staff Review RPCs
- `list_dm_message_reports_for_review(...)`
- `get_dm_message_report_detail(...)`
- `list_dm_message_report_actions(...)`
- `list_dm_message_context(...)`
- `assign_dm_message_report(...)`
- `update_dm_message_report_status(...)`
- `add_dm_message_report_action(...)`

### Staff Eligibility
- `public.is_haven_moderator(...)`
- backed by `public.platform_staff` (`is_active = true`)

## Trust Boundary
- Reporter can create DM reports only for messages they can access via DM membership checks
- Reporter can only read their own report rows via RLS
- Haven staff access to DM context is granted through dedicated moderation RPCs (not general DM-member RLS)
- Staff actions are audited in `dm_message_report_actions`

## Sequence Flow: DM Report Review Lifecycle
1. User submits report via `report_dm_message(...)`
2. `dm_message_reports` row is created (reporter-scoped visibility)
3. Staff opens review UI (`DmReportReviewPanel`) via `ModerationBackend`
4. Staff lists reports and loads detail/context via staff-only RPCs
5. Staff assigns report (`assign_dm_message_report(...)`)
6. Staff changes status (`update_dm_message_report_status(...)`)
7. RPC validates transition with `can_transition_dm_message_report_status(...)`
8. Audit action rows added to `dm_message_report_actions`

## Failure Modes
- Invalid status transitions -> rejected by DB helper (hardening pass)
- Inactive staff row -> staff RPCs denied
- Duplicate user reports on same message/kind -> deduped by unique index/upsert behavior
- Over-broad DM access -> avoided by keeping staff context access inside dedicated RPCs

## Extension Path
- Unified moderation inbox across server reports + DM reports
- richer assignment queues / SLA metadata
- moderation outcome notifications (optional future producer)
- automated abuse heuristics / rate-limit escalation

## Files to Know
- `supabase/migrations/20260222_000034_add_dm_moderation_review_phase2.sql`
- `supabase/migrations/20260222_000036_phase5_hardening_and_test_support.sql`
- `src/lib/backend/moderationBackend.ts`
- `src/components/DmReportReviewPanel.tsx`
- `src/lib/backend/types.ts`

## Deferred / Future
- Unified moderation inbox
- Native OS notifications for moderation staff
- Staff tooling for bulk triage and escalations

