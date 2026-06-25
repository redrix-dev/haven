# Release notes (`docs/releases/`)

One file per release tag: `docs/releases/<tag>.md` — e.g. `docs/releases/desktop-v2.0.0.md`.

**These files are the public release body.** The desktop release workflow
(`.github/workflows/release-desktop.yml`) reads `docs/releases/<tag>.md` verbatim
into the GitHub Release for that tag. If the file is absent, the workflow falls
back to a generic body.

## What goes here

Only the **sanitized public** test-signoff summary plus any human-written notes.
The signoff is generated on `staging`:

```
npm run test:signoff:release -- --release-label <tag> --environment staging
```

Copy from the **public** artifact only:

```
test-reports/<runId>.local/public/signoff.local.md   ← public, safe to publish
```

## What must NOT go here

Everything else the signoff writes under `test-reports/` is **internal** and
gitignored — never copy it into a release file:

- raw `*.stdout.log` / `*.stderr.log` / `*.combined.log` (unsanitized output)
- the full `signoff.local.md` / JSON (raw logs, local paths, log links)

See [../RELEASE_CADENCE.md](../RELEASE_CADENCE.md) § "Test signoff & release notes".
