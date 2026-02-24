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
