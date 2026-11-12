# Reporting

Status: **HAV-16 design, agreed 2026-11-12. Not built yet.** The "Today"
section describes `staging` as of that date. Everything from "Decisions" on is
the rebuild.

Reporting is how people tell someone that something is wrong. Haven has two
audiences for that, and the rebuild gives each one its own table:

1. **Community reports** go to one community's moderators. Community rules
   apply.
2. **Platform cases** go to Haven staff. Haven's Terms and the law apply.

## Today (being replaced)

Every report starts in one of five places:

| Entry                  | Clients                                                                                            | Path today                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Message in a community | Solid `MessageRow` → `CommunityView`; mobile `CommunityChatScreen` → `CommunityReportMessageModal` | `communityMessageNexus.report` → `communityReportBackend.reportMessage` (client inserts)     |
| Profile                | Solid `MembersPanel`, `CommunityView`; mobile `UserProfileModal` → `ProfileReportSheet`            | `HavenCore.reportUserProfile` → `reportUserProfile` / `reportPlatformUserProfile`            |
| Direct message         | Solid `DirectMessagesView`; mobile `DmReportSheet`                                                 | `directMessageNexus.reportMessage` → RPC `report_dm_message`                                 |
| Moderator escalates    | Solid `ModmailView`; mobile `MobileModmailPanel`                                                   | `communityModerationNexus.escalate` → `serverModmailBackend.escalateReport` (client inserts) |
| Staff act              | haven-site `/admin/reports` (service-role client)                                                  | Direct table updates; CSAM flag is a text marker in notes                                    |

Community and staff reports share `support_reports`, told apart by a
`destination` column. DM reports live in `dm_message_reports` with a different
status vocabulary.

**Why it is being rebuilt rather than patched:**

- Evidence depends on rows that other people can delete.
- The client captures the evidence snapshot, and a failed capture is ignored.
- "Both" and Escalate are several client writes that can stop halfway.
- Two status vocabularies, translated by the staff site.
- The CSAM flag is text in a notes field: no who, when, report ID or deadline.
- Profile reports never reach the moderators the reporter was told about.
- Report broadcasts reach every community member, not just moderators.
- Nobody is told anything after filing: not the reporter, not the user actioned.
- The staff site reads with the service role, so RLS never applies to it.

There are no real reports yet (every row is test data), so the rebuild drops
the old tables instead of migrating them.

## Decisions

Agreed 2026-11-12:

1. **Two tables, split by who reads them.** `community_reports` for moderators,
   `platform_cases` for staff. DM reports are platform cases; there is no
   separate DM table.
2. **Profile reports go to Haven staff only.**
3. **The reporter says what it is, not where it goes.** In a community, a
   message report is either "Break the community's rules" (community report) or
   "Illegal or dangerous" (platform case). "Both" goes away. Moderators can
   escalate any community report to staff.
4. **No appeal system for now.** Haven is a non-commercial side project, so
   DSA Art. 20 does not apply (Art. 19 exemption). Telling the reporter the
   outcome and telling the actioned user why are still built, because they are
   cheap once decisions are stored as rows.
5. **CSAM handling is part of the schema from the start.** Automatic scanning
   is a slot a vendor plugs into later; the vendor is researched separately.
6. **No data migration.** Old tables and their client code are deleted.
7. **Types come from the schema.** After the migration, `npm run
supabase:types` regenerates `packages/shared/src/types/database.ts`; no
   hand-written row types.

## The model

### Community report

`community_reports`: one community, one reported message or member.

| Column                                  | Notes                                                      |
| --------------------------------------- | ---------------------------------------------------------- |
| `id`                                    |                                                            |
| `community_id`                          | Required. `on delete cascade`: it goes with the community. |
| `reporter_user_id`                      | `on delete set null`                                       |
| `subject_kind`                          | `message` or `member`                                      |
| `subject_message_id`, `subject_user_id` | `on delete set null`; the snapshot keeps what was there    |
| `reason`                                | The reporter's words                                       |
| `snapshot`                              | jsonb, written by the RPC                                  |
| `status`                                | `open`, `in_review`, `resolved`, `dismissed`, `escalated`  |
| `escalated_case_id`                     | The platform case it became, if any. `on delete set null`  |
| `created_at`, `updated_at`              |                                                            |

Moderator notes are rows in `community_report_notes`, not JSON in a text
column.

### Platform case

`platform_cases`: everything Haven staff handle.

| Column                                        | Notes                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                                          |                                                                                                         |
| `source`                                      | `community_message`, `dm_message`, `profile`, `escalation`, `media_scan`                                |
| `reporter_user_id`                            | `on delete set null`. Null for scanner-opened cases.                                                    |
| `subject_user_id`                             | `on delete set null`                                                                                    |
| `community_id`, `community_report_id`         | Optional context. `on delete set null`                                                                  |
| `subject_message_id`, `subject_dm_message_id` | `on delete set null`                                                                                    |
| `reason`                                      |                                                                                                         |
| `snapshot`                                    | jsonb, written by the RPC: message text and context, usernames, community and channel names at the time |
| `status`                                      | `open`, `in_review`, `actioned`, `no_action`, `dismissed`                                               |
| `csam_flagged_at`, `csam_flagged_by`          | Set by `staff_flag_csam`, never cleared                                                                 |
| `ncmec_report_id`                             | The CyberTipline report number, once filed                                                              |
| `preserve_until`                              | Set to flag time + 1 year. Blocks deletion of the case and its media                                    |
| `created_at`, `updated_at`                    |                                                                                                         |

**Nothing a user can delete removes a case.** Every foreign key is
`on delete set null`; the snapshot holds what staff need to understand it. A
case is never deleted by any client path. That is the rule the old tables
broke.

Supporting tables:

- `platform_case_events`: append-only log of everything that happens to a case
  (filed, status changed, note added, decision, CSAM flag, NCMEC filed). Who,
  when, what. No update or delete grants for anyone.
- `platform_case_decisions`: the outcome. Action taken (`none`,
  `content_removed`, `user_suspended`, `user_banned`, combinations), the reason
  shown to the actioned user, and who decided. Writing one sets the case status
  and sends the notices.
- `case_media`: attachments referenced by a case (community or DM). Each row
  points at the original storage object and, once copied, at its copy in the
  private `case-evidence` bucket. Until the copy exists, the attachment
  deletion job skips the original. Media no longer expires (separate ticket),
  so the only deletions to guard against are a deleted message, account or
  community.

### Media scanning slot

`media_scans`: one row per uploaded attachment.

- `status`: `not_scanned` (no vendor configured), `pending`, `clear`,
  `match`, `error`.
- A `match` quarantines the object: storage RLS stops serving it, nothing
  deletes it, and the scanner opens a platform case with source `media_scan`,
  already CSAM-flagged.
- Until a vendor exists every row is `not_scanned` and files serve normally.
  The vendor is an Edge Function that reads `pending` rows and writes results;
  plugging it in changes nothing else.

### Actions

Every write is one security-definer RPC. Clients never insert or update these
tables directly.

| RPC                           | Who                                           | Does                                                                                |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `file_community_report`       | Members with `create_reports`                 | Builds the snapshot, inserts the report, notifies moderators                        |
| `file_platform_case`          | Any signed-in user with access to the subject | Builds the snapshot, inserts the case and its media rows, acknowledges the reporter |
| `set_community_report_status` | Owner, `manage_reports`                       | Moves the status, logs it                                                           |
| `add_community_report_note`   | Owner, `manage_reports`                       | Adds a note                                                                         |
| `escalate_community_report`   | Owner, `manage_reports`                       | Opens the case, links both, marks the report `escalated`, in one transaction        |
| `staff_set_case_status`       | Active staff                                  | Moves the status, logs it                                                           |
| `staff_record_decision`       | Active staff                                  | Writes the decision, applies the action, sends notices                              |
| `staff_flag_csam`             | Active staff                                  | Sets the CSAM fields and `preserve_until`, logs it                                  |
| `staff_record_ncmec_report`   | Active staff                                  | Stores the CyberTipline report number, logs it                                      |

### Who sees what

| Viewer               | Community report                          | Platform case                              |
| -------------------- | ----------------------------------------- | ------------------------------------------ |
| Reporter             | Own reports: status                       | Own cases: status and outcome              |
| Reported user        | Nothing                                   | The decision and its reason, when actioned |
| Community moderators | Their community's reports                 | Never. Their report shows "escalated" only |
| Other members        | Nothing, not even a broadcast             | Nothing                                    |
| Haven staff          | Only through the case it was escalated to | Everything, except CSAM media: see below   |

- The staff site signs in as a staff user and reads through RLS. The service
  role is for jobs only.
- CSAM-flagged media is viewable only by staff with the `csam_reviewer` staff
  role, and every view writes a case event.

### Notices

Sent through the existing `notification_events` pipeline (new kinds):

- **Report received**: to the reporter, when a case is filed.
- **Outcome**: to the reporter, when a decision is recorded (`actioned` or
  `no_action`, no detail about the other user).
- **Statement of reasons**: to the actioned user: what was actioned, which
  rule, and how to contact staff.

Community reports send no notices beyond the moderators' modmail update.

### Alerts and realtime

- Staff are emailed for new platform cases only. A failed alert is recorded on
  the case as an event, so it is visible, not just logged.
- Realtime for community reports goes to the community's report readers, not
  every member, and routes through `routeRealtimeEvent`.

### Deletion, in one table

| Deleted                 | Community reports                | Platform cases                                      |
| ----------------------- | -------------------------------- | --------------------------------------------------- |
| Community               | Deleted with it                  | Kept; `community_id` set null                       |
| Reported message or DM  | Kept; snapshot holds the content | Kept; snapshot holds the content; media copy kept   |
| Reporter's account      | Kept; reporter set null          | Kept; reporter set null                             |
| Reported user's account | Kept; subject set null           | Kept; subject set null                              |
| Staff member's account  | n/a                              | Kept; events keep a null actor and the display name |

Each row in this table is an SQL test, proven by breaking the rule it guards.

## What goes away

`support_reports`, `support_report_channels`, `dm_message_reports`,
`dm_message_report_actions`, `propagate_platform_action`,
`broadcast_report_status_updated`, the report-created broadcast trigger, the
client snapshot builders (`supportReportSnapshots.ts`),
`communityReportBackend.ts`, the report half of `serverModmailBackend.ts`, and
the haven-site status mapping.

## Testing

- **SQL**: every RLS rule, every RPC, and every deletion row above, each proven
  by breaking it.
- **Backend contract tests**: the nexus calls against local Supabase.
- **Real clients on the dev backend** (`docs/DEV_BACKEND.md`): a written matrix
  of every path (each report kind, escalate, each staff action, each deletion
  in the table above) run in desktop, web and mobile dev builds pointed at the
  devdb, ticked off with what was seen.

## Work plan

Sub-issues of HAV-16, in order:

1. **Database**: new tables, RPCs, RLS, deletion rules, media-scan slot, drop
   the old tables, regenerate types. SQL tests.
2. **Shared core and clients**: nexus and backend over the new RPCs; new
   reporter choices on Solid and mobile; modmail on `community_reports`;
   reporter notices.
3. **Staff site**: read the new tables through RLS as a staff user; decisions,
   CSAM fields, NCMEC number, notices.
4. **CSAM scanning research** (can run any time): free options, eligibility,
   NCMEC registration. Ends in a recommendation for the scanner Edge Function.
5. **Dev-backend test matrix**: write it, run it on real clients, fix what it
   finds. Done when every row passes.

## Legal checklist

Not legal advice. Each line needs a person to review it. "After rebuild" is what
the design above provides.

| Requirement                                                  | Today      | After rebuild                                                                                   |
| ------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------- |
| Apple 1.2: report offensive content                          | Met        | Met                                                                                             |
| Apple 1.2: timely response                                   | Gap        | Case age and status are queryable; staff alert per case. Response time is a practice, not code. |
| Apple 1.2: block abusive users                               | Met        | Met (`socialNexus` blocking)                                                                    |
| Apple 1.2: filter objectionable content                      | To confirm | Moderator removal and hiding, plus the scan slot. Confirm Apple accepts this.                   |
| Apple 1.2: published contact information                     | Met        | Met                                                                                             |
| 18 U.S.C. §2258A: report apparent CSAM to NCMEC              | Gap        | `staff_flag_csam` + `staff_record_ncmec_report`, logged. Needs NCMEC registration.              |
| §2258A (REPORT Act): preserve for one year                   | Gap        | `preserve_until`; case media copied and held; nothing deletes them before the date.             |
| DSA Art. 16: notice mechanism                                | Partial    | Signed-in reporting; email for everyone else.                                                   |
| DSA Art. 16: confirm receipt, tell the notifier the decision | Gap        | "Report received" and "Outcome" notices.                                                        |
| DSA Art. 17: statement of reasons to the actioned user       | Gap        | "Statement of reasons" notice from the decision row.                                            |
| DSA Art. 20: internal complaint system                       | N/A        | Art. 19 exemption (non-commercial, micro). Revisit if that changes.                             |
| UK OSA: illegal-content reporting                            | Partial    | "Illegal or dangerous" goes straight to staff.                                                  |
| UK OSA: complaints procedure                                 | Gap        | Contact route in the statement of reasons. A formal procedure is still a gap.                   |
| Privacy policy §5.3: reports retained indefinitely           | Partial    | Met: no deletion path removes a case.                                                           |
| Privacy policy §5: snapshots outlive the reported account    | Gap        | Met: server-written snapshots, `set null` references.                                           |
| Privacy policy: moderators see reports meant for them        | Gap        | Met: community reports are their own table, filed only on purpose.                              |
