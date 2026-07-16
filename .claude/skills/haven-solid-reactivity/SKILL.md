---
name: haven-solid-reactivity
description: Use when writing or changing any createEffect, createMemo, store subscription, or realtime handler in packages/solid-client — including effects that call a nexus load/open/mark method. Covers the self-retriggering effect class that strobes the UI, the untrack rule, the async-prefix trap, and the settle test every new effect ships with.
---

# Haven Solid Reactivity

## Read Before Editing

- [docs/architecture/SOLID_CLIENT_SHAPE.md](../../../docs/architecture/SOLID_CLIENT_SHAPE.md)
- [docs/architecture/HAVEN_CORE.md](../../../docs/architecture/HAVEN_CORE.md)

## The Failure This Prevents

An effect subscribes to a store, calls something that writes that store, and
retriggers itself forever.

**It does not throw. It does not error. Nothing logs.** The only evidence is a
strobing pane and RPC spam in the network tab. There is no error boundary, no
telemetry, no stack trace — it can only be caught by a human watching it or by a
test that counts. That asymmetry is why this skill exists and why the rule below
is not negotiable.

Canonical instance: commit `86a20e0`. The DM conversation-open effect called
`openConversation()` directly; that function's synchronous store read leaked into
the effect's deps, `markRead` wrote the same store, and the effect looped —
spamming `list_dm_messages` / `mark_dm_conversation_read` and strobing the chat
pane. An afternoon to diagnose.

## The Rule

**Never call a store-writing function synchronously inside an effect without
`untrack`.**

An effect should depend on _navigation and identity_ — a route param, an id, a
permission flag — not on the store its own body mutates.

```ts
// WRONG - the call's synchronous reads join the effect's deps
createEffect(() => {
  const id = props.communityId;
  if (!id) return;
  void core.channels.ensureLoaded(id);
});

// RIGHT - effect tracks props.communityId only
createEffect(() => {
  const id = props.communityId;
  if (!id) return;
  untrack(() => void core.channels.ensureLoaded(id));
});
```

Read the tracked values _first, at the top_, then do the work inside `untrack`.

## The Trap

`async` and `void` look like they defer. They do not.

**An async function body runs synchronously up to its first `await`.** Every
reactive read before that `await` happens inside the caller's tracking scope. So
`void someAsyncThing()` inside an effect still subscribes the effect to whatever
`someAsyncThing` reads on its way to the first `await`.

This is what makes the class near-invisible in review: the code reads as
fire-and-forget, and it isn't. If you only remember one thing from this skill,
remember this paragraph.

## Self-Check Before You Write An Effect

1. What does this effect _intend_ to depend on? (Usually one or two ids.)
2. Does anything it calls — at any depth, before any `await` — **read** a store?
3. Does anything it calls **write** that same store?
4. If 2 and 3 overlap, wrap the call in `untrack`.
5. If a guard (`if (already.length > 0) return;`) is the only reason it settles,
   that is not a defense — it is a coincidence one refactor away from a loop.

## Reference Patterns

Defended, copy these:

- [DirectMessagesView.tsx](../../../packages/solid-client/src/features/direct-messages/DirectMessagesView.tsx) — the `86a20e0` fix
- [CommunityOverviewTab.tsx](../../../packages/solid-client/src/features/community/settings/CommunityOverviewTab.tsx) — reads props, then `untrack(() => load(id))`

Known-naked, do not copy, fix if you touch it:

- [CommunityChannelsTab.tsx](../../../packages/solid-client/src/features/community/settings/CommunityChannelsTab.tsx) — calls `ensureLoaded` bare; settles only on the early-return guard in
  [channelSolidNexus.ts](../../../packages/solid-client/src/data/channels/channelSolidNexus.ts)

## Ship The Test With The Effect

A new or changed effect lands **with** its settle test in the same change — not
as a follow-up. The bug has no runtime signal, so the test is the only durable
proof.

- Assert the effect settles in a bounded number of runs for one reactive change.
- The harness must **throw** past the cap. A real loop hangs vitest instead of
  failing it; a test that hangs is worse than no test.
- Prove the test detects the class: remove the `untrack` and confirm it fails.
  A settle test that passes both with and without the guard is testing nothing.
- Counting backend calls per tick is a useful second assertion — it catches the
  case where the effect settles but a downstream subscriber does not.

Nexus-side store writes belong to `haven-solid-nexus`; component structure and
layer law belong to `haven-solid-feature-slice`. This skill owns the reactive
graph between them.

## Validation

- `npm run typecheck:solid`
- `npm run lint`
- `npm run test:unit` — includes the settle tests
- `npm run check:agent-skills` when editing this skill
