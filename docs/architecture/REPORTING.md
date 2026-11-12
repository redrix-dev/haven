# Reporting

Status: **Phase 1 design for HAV-16, proposed, not yet agreed.** Nothing below
the "Proposed model" heading is built. Everything above it describes the code on
`staging` as of 2026-11-12, plus HAV-17 (PR #123).

Haven has two kinds of report that share one table today:

1. **Community reports.** A member tells their community's moderators about
   something. The community's rules apply, and moderators handle it in modmail.
2. **Platform cases.** Someone tells Haven staff. Haven's Terms and the law
   apply. Staff handle it in the haven-site admin (`/admin/reports`).

## Where reports start

Every report starts in one of five places. All of them write rows from the
client, except DM reports, which go through an RPC.

| Entry                     | Clients                                                                                            | Path                                                                                   | Rows written                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message in a community    | Solid `MessageRow` → `CommunityView`; mobile `CommunityChatScreen` → `CommunityReportMessageModal` | `communityMessageNexus.report` → `communityReportBackend.reportMessage`                | One `support_reports` row per destination, plus a `support_report_channels` link each. "Both" writes two rows.                                    |
| Profile, from a community | Solid `MembersPanel`, `CommunityView`; mobile `UserProfileModal` → `ProfileReportSheet`            | `HavenCore.reportUserProfile` → `reportUserProfile` and/or `reportPlatformUserProfile` | Always `destination = 'haven_staff'`, whichever destination the reporter picked (see "Known gaps").                                               |
| Profile, no community     | Same components, opened outside a community                                                        | `HavenCore.reportUserProfile` → `reportPlatformUserProfile`                            | One `haven_staff` row, `community_id` null.                                                                                                       |
| Direct message            | Solid `DirectMessagesView`; mobile `DmReportSheet`                                                 | `directMessageNexus.reportMessage` → RPC `report_dm_message`                           | One `dm_message_reports` row. Always for staff. No snapshot.                                                                                      |
| Moderator escalates       | Solid `ModmailView` "Escalate"; mobile `MobileModmailPanel` "Escalate"                             | `communityModerationNexus.escalate` → `serverModmailBackend.escalateReport`            | A new `haven_staff` row (reporter = the moderator; original reporter kept in `notes`), copied channel links, and the original set to `escalated`. |

The reporter picks the destination for message reports: "Community moderation
team" (the default), "Haven Moderation Team", or "Both". DMs have no community,
so DM reports always go to staff.

### Evidence

- `support_reports.snapshot` is the evidence. For a message report it holds the
  reported message and a few messages either side (text, author, avatar URL,
  time). For a profile report it holds the username and avatar URL. Snapshots
  are captured by the client before the insert. If capture fails, the report is
  filed with a null snapshot and only a `console.warn`.
- Attachments are not captured. Avatar URLs point at storage that is deleted
  with the account.
- `dm_message_reports` has no snapshot. It points at the live `dm_messages` row.
- `support_report_messages` was dropped in `20260514100000`. The haven-site
  detail page still queries it and shows a warning.

## Flow 1: community reports

```
member files report ─► support_reports (destination server_admins, status pending)
                          │
                          ├─ realtime: report_created → every community member's private channel
                          ├─ email: report-alert edge function → Haven staff inbox
                          ▼
moderator opens modmail (Solid ModmailView / mobile MobileModmailPanel)
   │  status: pending → under_review → resolved | dismissed
   │  internal notes: appended to notes JSON
   │  or Escalate → new haven_staff row; original becomes escalated
   ▼
realtime: report_status_updated → every community member's private channel
```

- **Who sees it.** The reporter, the community owner, and members with
  `manage_reports` (RLS `support_reports_select_visible`). Staff do not see
  `server_admins` rows unless they are escalated.
- **Who moves it.** Owners and `manage_reports` holders, through RLS
  `support_reports_update_manager_only`. Statuses: `pending`, `under_review`,
  `resolved`, `dismissed`, `escalated`, `resolved_by_platform`.
- **What the reporter is told.** A toast ("moderators will review it"). Nothing
  after that.
- **What the reported user is told.** Nothing.
- **Deletion.** Community reports are deleted with their community (HAV-17 made
  this explicit).

## Flow 2: platform cases

```
reporter (or "Both", or moderator Escalate) ─► support_reports (destination haven_staff)
reporter in a DM ─────────────────────────────► dm_message_reports (status open)
                          │
                          ├─ email: report-alert edge function → Haven staff inbox
                          ▼
staff open haven-site /admin/reports (service-role client, RLS does not apply)
   │  support_reports: pending → under_review → resolved | dismissed | escalated
   │  dm_message_reports: open → triaged/in_review → resolved_actioned | resolved_no_action | dismissed
   │  CSAM flag: a text marker added to notes / resolution_notes
   │  platform_action jsonb → trigger copies it to the paired community row ("Both" only)
   ▼
nothing is sent to the reporter or the reported user
```

- **Who sees it.** Active `platform_staff` and the reporter. Community
  moderators never see `haven_staff` rows. The site itself uses the service
  role, so this rule is enforced by RLS only for clients.
- **Two vocabularies.** `support_report_status` and `dm_message_report_status`
  differ. The site maps both onto one set of labels and back.
- **Linking.** Only "Both" rows link the staff row to the community row
  (`source_report_id`). Escalated rows keep the link in `notes` only, so a
  platform decision is never copied back to the community report.
- **Deletion.** Since HAV-17, a `haven_staff` row survives community deletion
  with `community_id` null. DM reports and reports a user filed are not yet
  protected; see "Known gaps".

## Known gaps

These are described plainly here. Exploit-level detail stays in the
maintainer-only notes.

1. **Profile reports never reach community moderators.** `HavenCore` sends a
   "community moderators" profile report to `reportUserProfile`, which writes a
   `haven_staff` row. The mobile sheet tells the reporter it goes to
   "<community> moderators and Haven staff". Moderators cannot see it. The
   contract test pins the staff-only behaviour, so the UI is the part that is
   wrong, or the intent changed and the backend needs to follow.
2. **"Both" and Escalate are several client writes.** Either can stop halfway
   and leave one side without its report.
3. **Report retention is incomplete.** Staff reports now survive their
   community, but not every other deletion path. DM reports have no snapshot at
   all.
4. **The CSAM flag is text in a notes field.** No who, when, NCMEC report ID or
   preservation date.
5. **Two status vocabularies, mapped on the site.** "Resolved" for a DM always
   becomes `resolved_actioned`; staff cannot record "no action" from the site.
6. **Broadcasts reach every member.** `report_created` and
   `report_status_updated` go to every member of the community, not only those
   who can read reports. The payload is IDs and status only, but it says that a
   report exists.
7. **Every community report emails Haven staff**, including ones staff cannot
   see. Alert failures are only logged.
8. **`destination` defaults to `haven_staff`.** A client that forgets it sends
   community business to staff.

## Proposed model

Two things, named for what they are.

### Community report

- Lives in `community_reports` (or `support_reports` with `server_admins`
  only, if renaming is not worth the migration).
- Always has a community. Deleted with it.
- Statuses: `open`, `in_review`, `resolved`, `dismissed`.
- The reporter does not choose staff here. They choose between "Tell this
  community's moderators" and "This is illegal or dangerous", which files a
  platform case instead.
- Moderators get **Escalate to Haven**: one security-definer RPC that creates
  the platform case, links it, and marks the community report `escalated`, in
  one transaction.

### Platform case

- Lives in `platform_cases`, one table for message, profile, DM and escalated
  cases (`subject_kind`: `community_message`, `profile`, `dm_message`,
  `escalation`).
- `community_id` and `community_report_id` are optional and `on delete set
null`. The case never depends on the community, the message, the reporter or
  the reported user still existing. Users are referenced with `set null`, and
  the snapshot carries what staff need.
- The snapshot is written by the RPC on the server, not by the client, so a
  case cannot be filed without its evidence.
- One status vocabulary: `open`, `in_review`, `actioned`, `no_action`,
  `dismissed`.
- Decisions are rows in `platform_case_decisions`: who decided, when, what
  action, the reason sent to the user, and whether an appeal is open. The
  reporter's confirmation and the actioned user's statement of reasons are
  generated from these rows.
- CSAM is a real column set: `csam_flagged_at`, `csam_flagged_by`,
  `ncmec_report_id`, `preserve_until`. A row with `preserve_until` in the future
  cannot be deleted. Its content is readable only by a staff role, not by the
  service-role default the site uses today.

### Who sees what

| Viewer               | Community report              | Platform case                           |
| -------------------- | ----------------------------- | --------------------------------------- |
| Reporter             | Own reports, status only      | Own reports, status and decision        |
| Reported user        | Nothing                       | Statement of reasons when actioned      |
| Community moderators | Their community's reports     | Never. Only "escalated" on their report |
| Haven staff          | Only when escalated           | All                                     |
| Other members        | Nothing, including broadcasts | Nothing                                 |

### Phases after this one

- **Phase 2, database.** HAV-17 is done. Next, one migration per item:
  `platform_cases` and its RPCs, retention for DM and reporter-deleted
  reports, the CSAM columns, the status vocabulary, the `destination` default,
  and broadcasts scoped to moderators. Each ships with an SQL test proven by
  breaking it.
- **Phase 3, shared core and clients.** Report creation and escalation become
  single RPC calls through the nexuses. Mobile and Solid get the new reporter
  choice and stop promising moderators a report they will not see.
- **Phase 4, haven-site.** Read the new tables, render the snapshot properly,
  record decisions and CSAM fields, send notices.

## Legal checklist

Not legal advice. Each line needs a person to review it before it is relied on.

| Requirement                                                              | Status     | Why                                                                                                                     |
| ------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Apple 1.2: report offensive content                                      | Met        | Message, profile and DM reporting on mobile.                                                                            |
| Apple 1.2: timely response                                               | Gap        | Staff are emailed, but nothing tracks age or response time.                                                             |
| Apple 1.2: block abusive users                                           | Met        | User blocking RPCs (`20260322000061`), in `socialNexus`.                                                                |
| Apple 1.2: filter objectionable content                                  | To confirm | No automated filtering found. Moderator removal and hiding exist. Check whether Apple accepts that.                     |
| Apple 1.2: published contact information                                 | Met        | `legal@redrixx.com` in the privacy policy.                                                                              |
| 18 U.S.C. §2258A: report apparent CSAM to NCMEC                          | Gap        | The policy promises it. Nothing records that a report was made, by whom, or its ID.                                     |
| §2258A (REPORT Act): preserve contents for one year                      | Gap        | No preservation hold. Snapshots hold text only; attachments are not captured. Some deletion paths still remove reports. |
| DSA Art. 16: notice mechanism                                            | Partial    | Signed-in users can report. People without an account have only the email address.                                      |
| DSA Art. 16: confirm receipt to the notifier, and tell them the decision | Gap        | A toast on submit. No receipt, no decision notice.                                                                      |
| DSA Art. 17: statement of reasons to the actioned user                   | Gap        | Actioned users are told nothing.                                                                                        |
| DSA Art. 20: internal complaint (appeal) system                          | Likely N/A | Art. 19 exempts micro and small enterprises. Confirm Haven qualifies, and revisit if it grows.                          |
| UK OSA: illegal-content reporting                                        | Partial    | Reporting exists, but "illegal" is not a choice and nothing routes it to staff by default.                              |
| UK OSA: complaints procedure                                             | Gap        | No way to complain about a decision.                                                                                    |
| Privacy policy §5.3: reports retained indefinitely                       | Partial    | Staff reports survive community deletion (HAV-17). DM reports and reports by a deleted reporter do not survive yet.     |
| Privacy policy §5: snapshots of reports about you outlive your account   | Gap        | Holds for community reports with snapshots; DM reports have no snapshot.                                                |
| Privacy policy: moderators see reports designated for server review      | Gap        | Profile reports designated for moderators go to staff only (gap 1).                                                     |
