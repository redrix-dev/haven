---
name: verify
description: Run right before every Haven commit that changes code, config or dependencies. Picks the gate by blast radius, runs it, and shows the real output and exit status. Claude Code runs a skill named verify before committing automatically; docs-only and tests-only commits skip it.
---

# Verify Before Commit

Prove the change, don't assert it. Run the gate, show its actual output, and
report the exit status of the gate itself.

## 1. Pick the gate

Use "Pick The Gate By Blast Radius" in
[haven-branch-ci-gates](../haven-branch-ci-gates/SKILL.md). The floor for any
code change is both of these, because CI's `fast` job runs `format:check` and
`test:cleave` does not:

```sh
npm run format:check
npm run test:cleave
```

Add the narrower gates that skill lists for DB, mobile, theme or sidecar
changes. A change under `.claude/skills/` also runs `npm run check:agent-skills`.

## 2. Run it so the status is true

- Capture each gate's own status. After a pipe `$?` is the last command's;
  use `${PIPESTATUS[0]}`, or redirect to a log and check `$?` on its own line.
- If `package.json` changed, the matching lockfile is staged in the same
  commit (`package-lock.json`, `apps/mobile/package-lock.json`).

## 3. When npm dies before running anything

`EBADDEVENGINES … does not match` is the global npm overriding the repo pin,
not a failing check. Fix: `corepack enable npm`. Stopgap: run the local
binaries in `./node_modules/.bin/` directly.

## 4. Report

Paste the tail of each gate's output and its exit status. If a gate was
skipped, say which and why. Commit only when every gate run returned 0.
