# Documentation Layout

## Purpose
This repo now separates documentation by audience:

- `docs/users/`: user-facing or operator-facing docs that should be shareable/referenceable publicly.
- `docs/internal/`: internal reference, design notes, contributor workflow material, and review queues.

## Policy
- New public/shareable docs belong in `docs/users/`.
- Internal design notes, architecture snapshots, and workflow references belong in `docs/internal/`.
- `docs/internal/` is git-ignored for new files by default to reduce accidental churn. Tracked files already in git remain trackable and editable.

## Review Workflow
- Docs proposed for removal should be moved into `docs/internal/marked-for-deletion/`.
- Add/update rationale in `docs/internal/marked-for-deletion/README.md` before deleting anything.
- Use `docs/internal/document-catalog.md` as the audit index for purpose/necessity decisions.

## Permission Wiring Crosswalk
| DB key | Backend flag | Primary UI surfaces | SQL enforcement |
|---|---|---|---|
| `manage_channels` | `canManageChannelStructure` | Channel create/rename/delete/grouping actions | `channels_insert_manager`, `channels_update_manager`, `channels_delete_manager`, `channel_groups_*` policies |
| `manage_channel_permissions` | `canManageChannelPermissions` | Channel overwrite editing in channel settings | `channel_role_overwrites_mutate_manager`, `channel_member_overwrites_mutate_manager` policies |
| `manage_server` | `canManageServer` | Community settings general tab | `communities_update_manager`, `community_settings_update_manager` |
| `manage_roles` | `canManageRoles` | Role editor and member role assignment | `roles_*`, `role_permissions_mutate_manager`, `member_roles_*` |
| `manage_members` | `canManageMembers` | Member management surfaces | Member-management RLS and RPC checks |
| `manage_messages` | `canManageMessages` | Message moderation actions | `messages_delete_self_or_moderator` and related checks |
| `manage_invites` | `canManageInvites` | Invite creation/revocation | Invite RLS policies and RPC checks |
| `manage_bans` | `canManageBans` | Ban management surfaces | Ban policies and moderation RPC checks |
| `manage_developer_access` | `canManageDeveloperAccess` | Developer access settings | Developer access policies/RPC checks |

## Reserved Permissions
- `mention_haven_developers`: reserved/internal and hidden from owner-facing role permission editing.
- Channel overwrite `can_manage`: schema-compatible but hidden from owner-facing channel overwrite UI.

## Adding A Permission Lever Checklist
1. Add the key to `permissions_catalog` migration flow.
2. Add/adjust RLS policies or RPC checks that enforce the key.
3. Map the key in backend permission shaping (`fetchServerPermissions`) if it drives app gating.
4. Add owner-facing label/scope metadata (or explicitly mark as reserved/hidden).
5. Add SQL tests covering allow/deny behavior and register the suite in `services/supabase/tests/run_order.txt`.
6. Update `tooling/scripts/test/generate-test-report.mjs` scenario catalog when a new suite is added.
