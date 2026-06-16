# Tier 2 — control flow

Making code decide and repeat. The four tools: `if` / `else`, the comparison
operators that feed them, the `for...of` loop, and the ternary `? :`.

A heads-up your own file gives us: `channelSolidNexus.ts` contains **no `else`
and no ternary** — on purpose. It uses "guard clauses" (bail out early with
`return`) and `??` instead. So you'll learn the standard tools here, and also see
the deliberate choice to avoid two of them. Both are worth knowing.

Run anything by pasting into `scratch.js` and running `node scratch.js`.

---

## Card 2.1 — `if` / `else` and the guard clause

**What it does:** run a block only when a condition is truthy (remember truthy
from tier 1). `else` is the fallback block.

**Run it:**

```js
const hour = 14;
if (hour < 12) {
  console.log("morning");
} else {
  console.log("afternoon"); // → afternoon
}
```

**The guard clause — the pattern your file actually uses.** Instead of wrapping
everything in `else`, handle the odd case first and `return` out. The rest of the
function then runs un-nested:

```js
function greet(name) {
  if (!name) return "hi, stranger"; // bail early on empty
  return "hi, " + name; // the normal path, no else needed
}
console.log(greet("")); // → hi, stranger
console.log(greet("Cody")); // → hi, Cody
```

Notice the `if` body here has no `{ }` braces. When the body is a single
statement, you can drop them: `if (!name) return "...";` is one line.

**You've seen it:** every guard in the nexus.
`if (existing) return existing;` in `loadForCommunity` reads as "already loading?
hand that back and stop." `if (ids.length > 0) return;` in `ensureLoaded` reads
as "already have channels? nothing to do." No `else` in sight — the early
`return` makes it unnecessary. That's why the whole file has zero `else`.

**Your turn:** what prints?

```js
function status(count) {
  if (count === 0) return "empty";
  return "has " + count;
}
console.log(status(0));
console.log(status(3));
```

---

## Card 2.2 — comparisons: `===`, `!==`, `<`, `>`, `!`

**What it does:** produce a true/false to feed an `if`. The big rule lives here.

**Run it:**

```js
console.log(1 === 1); // → true     equal? (value AND type)
console.log("a" !== "b"); // → true     not equal?
console.log(5 > 3); // → true
console.log(5 < 3); // → false
console.log(!true); // → false    ! flips a boolean
```

**The one rule that matters: always `===`, never `==`.** The double-equals does
sneaky type-conversion behind your back; triple-equals checks type *and* value
honestly:

```js
console.log(0 == ""); // → true    (== converts types — chaos)
console.log(0 === ""); // → false   (=== is honest — a number isn't a string)
console.log(1 == "1"); // → true    (== again, converting "1" to 1)
console.log(1 === "1"); // → false   (number vs string — different)
```

This codebase uses `===` / `!==` exclusively — you will not find a bare `==` in
it, and the linter would reject one. Treat `==` as a bug.

**The `!` (not) operator** flips truthy/falsy:

```js
const list = [];
console.log(list.length); // → 0       (falsy)
console.log(!list.length); // → true    (! turns falsy into true)
```

**You've seen it:** `if (this.state.activeChannelId === id) return;` in
`setActiveChannelId` — "already on this channel? do nothing." And
`if (!communityIds.includes(channel.id))` in `upsertChannel` — "if it does NOT
already include this id, then add it." The `!` reads literally as "not."

**Your turn:** which print?

```js
if (2 === 2) console.log("A");
if (2 == "2") console.log("B");
if (2 === "2") console.log("C");
if (!0) console.log("D"); // 0 is falsy...
```

---

## Card 2.3 — the `for...of` loop

**What it does:** run a block once per item in an array. `X` becomes each item
in turn.

**Run it:**

```js
const names = ["general", "random", "voice"];
for (const name of names) {
  console.log(name);
}
// → general
// → random
// → voice
```

Read `for (const name of names)` as "for each `name` of `names`." Clean and
direct — you almost never need anything fancier.

**The older `for` loop** you'll occasionally see, when you need the index number:

```js
for (let i = 0; i < 3; i = i + 1) {
  console.log(i); // → 0, then 1, then 2
}
```

Three parts in the parentheses: start (`i = 0`), keep-going test (`i < 3`), step
(`i = i + 1`). Fiddlier — reach for `for...of` unless you specifically need `i`.

**You've seen it:** `for (const raw of sorted)` in `setChannels` — once per raw
channel, build its entity. One heads-up: a lot of "loops" in this codebase are
hidden inside `.map()` and `.filter()` (tier 4) — those are loops in disguise.
But `for...of` is the honest, visible baseline they're built on.

**Your turn:** what prints?

```js
const nums = [10, 20, 30];
let total = 0;
for (const n of nums) {
  total = total + n;
}
console.log(total);
```

---

## Card 2.4 — the ternary `? :`

**What it does:** an `if` / `else` that *produces a value* instead of running
blocks. Shape: `condition ? valueIfTrue : valueIfFalse`.

**Run it:**

```js
const age = 20;
const label = age >= 18 ? "adult" : "minor";
console.log(label); // → adult
```

That one line replaces:

```js
let label;
if (age >= 18) {
  label = "adult";
} else {
  label = "minor";
}
```

Same result. The ternary is for when you want a *value*, not a block of actions.

**You've seen it:** ...actually you haven't, not in the nexus — it prefers guard
clauses and `??` (the nullish operator, tier 4) over ternaries. But the moment
you reach the UI (tier 8), ternaries are everywhere in JSX, like
`{loading ? "Loading…" : content}`. Learning the shape now means it won't look
alien then.

**Your turn:** what prints?

```js
const n = 7;
const kind = n % 2 === 0 ? "even" : "odd"; // % is remainder; 7 % 2 is 1
console.log(kind);
```

---

## Tier 2 checkpoint

You can leave tier 2 when:

- a guard clause `if (x) return;` reads instantly as "bail out early"
- you reach for `===` automatically and treat `==` as a mistake
- `for...of` reads as "once per item"
- a ternary reads as "an if/else that hands back a value"

Next stop, tier 3 — functions: the big one. Arrow functions (`() =>`), passing
functions as values, callbacks, and closures — the machinery behind every
`(channel) => channel.id` and every Solid accessor you've been staring at.
