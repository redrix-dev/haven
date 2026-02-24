# Internal Documentation Catalog (Refactor Reset)

## Purpose
Audit index for internal documentation after the renderer/main/preload refactor. This file records each document's purpose, audience, and current disposition so future cleanup work is reviewable instead of ad hoc.

## Classification Rules
- `Keep`: active reference material with ongoing value.
- `Review/Delete`: retained temporarily in `marked-for-deletion` pending manual confirmation.
- `User-facing`: belongs in `docs/users/` (none at time of this pass).

## Keep (Internal Reference)

| Document | Audience | Purpose | Necessity | Notes |
| --- | --- | --- | --- | --- |
| `docs/internal/contributor/AGENTS.md` | Internal contributors / AI agents | Repo-wide contributor rules and invariants | High | Internal-only guidance, not end-user content |
| `docs/internal/contributor/haven-workflow.md` | Internal contributors | Daily dev/release workflow and validation tiers | High | Primary operating workflow reference |
| `docs/internal/contributor/collaborator-setup.md` | Internal collaborators | Onboarding/setup and secret handling | High | Small-team operational onboarding |
| `docs/internal/operations/auto-updates.md` | Internal release/operator | Auto-update setup and publishing behavior | Medium-High | Release operations reference |
| `docs/internal/testing/rls-and-hardening-runbook.md` | Internal engineers | Local DB/RLS/backend test execution runbook | High | Active operational runbook |
| `docs/internal/testing/test-suite-breakdown.md` | Internal engineers | Test suite intent/boundary breakdown | High | Complements runbook; clarifies layering |
| `docs/internal/architecture/boundaries.md` | Internal engineers | Main/renderer/preload boundary rules | High | Core invariant reference |
| `docs/internal/architecture/context-menu-event-flow.md` | Internal engineers | Context menu behavior/event flow mapping | Medium | Useful for focus/pointer regressions |
| `docs/internal/architecture/direct-messaging.md` | Internal engineers | DM data model and behavior architecture | High | Domain architecture reference |
| `docs/internal/architecture/moderation-reports.md` | Internal engineers | Moderation report system architecture | High | Domain architecture reference |
| `docs/internal/architecture/notifications-and-delivery.md` | Internal engineers | Notification model and delivery flow | High | Domain architecture reference |
| `docs/internal/architecture/permissions-and-roles.md` | Internal engineers | Permission/role enforcement model | High | Security-sensitive reference |
| `docs/internal/architecture/renderer-entry-origin-parity.md` | Internal engineers | Renderer entry service parity and failure modes | High | Electron security/runtime behavior |
| `docs/internal/architecture/backend-seam.md` | Internal engineers | Backend seam design and layering | Medium-High | Still useful after refactor; path references updated |
| `docs/internal/architecture/voice-architecture.md` | Internal engineers | Voice architecture and future SFU path | Medium-High | Strategic architecture reference |

## Review/Delete (Moved to `marked-for-deletion`)

| Document | Reason Moved | Recommendation |
| --- | --- | --- |
| `docs/internal/marked-for-deletion/haven-deep-dive-analysis.md` | Long-form mentor-style analysis snapshot; mixes praise/advice with architecture and goes stale quickly | Delete after review unless preserved as personal learning notes |
| `docs/internal/marked-for-deletion/type-safety-phase-1.md` | Phase report for completed refactor milestone, not canonical architecture | Delete after confirming historical retention is unnecessary |
| `docs/internal/marked-for-deletion/type-safety-phase-2.md` | Phase report for completed milestone, not canonical architecture | Delete after review |
| `docs/internal/marked-for-deletion/renderer-refactor-checklist.md` | Temporary execution checklist for a now-completed refactor | Delete after confirming no need as audit artifact |
| `docs/internal/marked-for-deletion/hardening-audit.md` | Phase-specific audit snapshot; may be superseded by current runbook/test-suite docs | Review for useful findings, then delete or extract durable guidance |

## User-Facing Coverage Gap (Intentional)
No current documents were classified as user-facing. If end-user/admin docs are added later, place them in `docs/users/` and link them from `docs/README.md`.
