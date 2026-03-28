# User Docs

## Purpose
This directory is reserved for user-facing documentation (end users, server admins, or external operators).

## Current State
User-facing docs are intentionally kept short and practical. Internal engineering docs remain under `docs/internal/`.

## Available User Docs
- `docs/users/web-install.md`
  - How to access Haven from the browser on desktop

## Community Permissions Cheat Sheet
- `Manage Community`: edit community-level settings.
- `Manage Roles`: create, edit, delete roles and role permission assignments.
- `Manage Members`: manage member-level administrative actions.
- `View Channels`: see channels in the community.
- `Send Messages`: send messages in visible channels.
- `Create Channels`: create new channels.
- `Manage Channel Structure`: rename/delete/reorder/group channels.
- `Manage Channel Overwrites`: edit role/member channel overwrites.
- `Manage Messages`: moderate and remove messages.
- `Manage Invites`: create and revoke invite links.
- `Create Reports`: submit reports.
- `Manage Reports`: review and handle reports.
- `Manage Bans`: apply and revoke community bans.
- `View Ban-Hidden Messages`: view messages hidden by community bans. This is owner-granted by default in the database and is intended for elevated moderation review.
- `Manage Developer Access`: configure Haven developer access controls.
- `Refresh Link Previews`: refresh cached link preview snapshots.

## Reserved Levers
- `Mention Haven Developers` is reserved/internal and not owner-facing in settings.
- Channel overwrite `Manage Channel` is reserved/internal and not owner-facing in channel permissions.

## Moderation Semantics
- `Kick` removes current access by removing the member from the server. It does not create a ban record and does not hide the user's historical messages.
- `Ban` removes current access, records an active community ban, and hides the banned user's historical messages until the ban is revoked and the user rejoins.

## Placement Rules
Put docs here only if they are intended to be shared outside the core development team without internal implementation context.
