# Principles

How Haven is built and maintained. Every rule here carries its _why_ — a rule whose
why is gone is a rule up for deletion. This file changes rarely and deliberately.

---

## 1. The prime rule

> **Prefer the correct _understandable_ path over the correct (but I can't explain
> why) path. Always.**

Code that works but can't be explained is a liability with a delay on it. If a
solution can't be narrated plainly — what it does, why it's shaped this way, what
breaks if you change it — it isn't done, even if it's green. Cleverness is welcome;
_unexplainable_ cleverness is not. When two correct approaches exist, take the one a
future maintainer (most likely: you, six months from now, tired) can read cold.

Corollary: argue for "do it right" only by demonstrating genuine clarity about why
it's right. "Best practice" with no mechanism behind it is cargo cult, and cargo
cult is banned here.

## 2. Decisions become enforcement

A decision that lives only in a doc or a memory will be violated by accident. The
decisions that matter are encoded as executable guards:

- `check:shared-portable` — `packages/shared` stays framework-free
- `mobile:ownership` — dependency ownership boundaries (react is mobile's, solid is desktop's)
- eslint boundary rules — UI never reaches around the data layer
- `check:themes` — generated theme outputs can't silently drift

**A broken guard is worse than no guard** — it teaches you to ignore red. When a
guard fails for a dumb reason, fix the guard that day or delete it.

## 3. The sorting test (logic vs. cache)

For every file and function in the data layer, ask: _"Is this logic, or is this a
cache?"_

- **Logic** = data in → data out. No held state, no notion of "a screen is watching."
  → lives in `packages/shared`, written once, identical on every platform.
- **Cache** = holds entities in memory and notifies the screen when they change.
  → lives per-platform, in that platform's native idiom.
- When unsure, it is **logic** until it provably must hold reactive state.

## 4. Share the smarts, not the memory

A reactive store is **never** shared across frameworks. Sharing the _cache_ across
React and Solid is the architectural mistake the 2026 rebuild exists to undo — it
forced snapshot caches, revision counters, and selector factories that existed only
to prop up the sharing. The thin "hold + notify" shell may be written twice;
**duplicating something dumb is cheap and safe; duplicating something smart is the
bug factory.** All the thinking lives once, in shared.

## 5. One canonical home per module

Every module has exactly one implementation. If two import paths must coexist
temporarily, one of them is a one-line re-export shim of the other — never a copy.
Copies drift (proven here: duplicated test files diverged within days). Shims are
bridges with an expiry, not architecture.

## 6. Deletion is part of finishing

A migration is not done when the new path works; it is done when the old path is
**gone** — code, configs, dependencies, scripts, docs, aliases. Budget the deletion
into the task. "I'll clean it up after it ships" is how this repo once accumulated
three generations of the same module tree.

## 7. Mobile is live. Don't break it.

The iOS app has real users. Its data layer changes only deliberately, gated, on its
own schedule — never as a side effect of desktop/web work. `test:cleave` green is
the floor, not the ceiling.

## 8. Spikes are disposable by declaration

Exploratory code is declared throwaway _before_ it's written, lives on a branch that
never merges, and is deleted on exit. Only the findings survive. Pre-deciding
disposability removes the sunk-cost pressure to "save what we wrote" — the pressure
that caused prior refactor pain.

## 9. Every phase has an exit gate

Work is planned as: goal → deliverable → **exit criteria** ("how do we _know_ this
is done and we're allowed to move on"). The gate is the point; it's what resists
scope drift. No gate, no phase.

## 10. Security lives in the database

Every permission check is an RLS policy or a security-definer RPC. The client
reflects what the database says; it does not decide. The anon key is public on
purpose — it can't do anything the policies don't permit. The source is public for
the same reason: if the security model works, it holds up to inspection.

## 11. Docs tell the truth or they leave

A living doc is updated **in the same change** that invalidates it. When work
completes or a plan is superseded, its document is dropped from the living set —
git history keeps the record, not a pile of stale files. A doc that describes a
world that no longer exists, sitting next to docs that describe this one, is worse
than no doc.
