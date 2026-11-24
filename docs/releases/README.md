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

## The site article

The "What's new" page on haven-site is drafted from the same file:

```
npm run release:site-draft -- desktop-v2.1.0              # writes ../haven-site/content/releases/2-1-0.json
npm run release:site-draft -- desktop-v2.1.0 --stdout     # print it instead
```

Options: `--site <path>` if haven-site is somewhere else, `--date YYYY-MM-DD`
(defaults to the tag's commit date, else today), `--force` to replace a draft.

How a release file becomes an article (`tooling/scripts/site/draft-site-release.mjs`):

| In the markdown                   | On the site                                                  |
| --------------------------------- | ------------------------------------------------------------ |
| Paragraphs before the first `###` | Summary                                                      |
| `### Known issues`                | The callout                                                  |
| `### Install`                     | Dropped: installer names belong on the GitHub Release        |
| Any other `###` section           | A domain module, picked from the heading (`SECTION_DOMAINS`) |
| `- **Title** — body`              | One change                                                   |
| First bold title of each section  | Highlights, one per section in turn, at most six             |

So write the file to fit: an intro paragraph first, `###` sections, and bullets
that start with a bold title. The tagline and "what's next" are left empty for
a person to write. The draft is a branch on haven-site, never `master`: it goes
live when its PR merges.
