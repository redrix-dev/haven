# Tier 1 — language bedrock

The ground floor. Names, values, and the one idea that explains half of the
"why is the code doing that" moments later: **value vs reference.**

How to run anything here: drop the snippet into a file called `scratch.js`, then
run `node scratch.js` in a terminal. The `// →` comments show what prints.

Each card has four parts:

1. **the token** — the actual symbol
2. **what it does** — one sentence
3. **run it** — a tiny standalone snippet
4. **you've seen it** — where it already lives in `channelSolidNexus.ts`

---

## Card 1.1 — `const` and `let`

**What it does:** binds a name to a value. `const` = a box you fill once and
can't refill. `let` = a box you can refill later.

**Run it:**

```js
const name = "general"; // filled once
let count = 0; // can change later
count = count + 1; // fine
console.log(name, count); // → general 1

// name = "random";      // would crash: Assignment to constant variable
```

`const` doesn't mean "the value can never change" — it means **the name can't be
re-pointed.** (You'll see later that a `const` array can still have things pushed
into it. That's value-vs-reference, card 1.3.)

**You've seen it:** nearly every line. `const channel = toHavenChannel(...)` —
named once, never re-pointed. And the one `let` in the file:
`let groupState: ChannelGroupState;` in `loadForCommunity` — declared empty, then
assigned in either the `try` or the `catch`. That's exactly why it's `let` and
not `const`: it gets filled on a later line, sometimes two different ways.

**Your turn:** what prints?

```js
let x = 5;
const y = x;
x = 10;
console.log(x, y); // predict before running
```

---

## Card 1.2 — values: `string`, `number`, `boolean`, `null`, `undefined`

**What it does:** the five "primitive" values — the atoms. Text, numbers,
true/false, and two different flavors of "nothing."

**Run it:**

```js
const text = "hello"; // string
const n = 42; // number
const ok = true; // boolean

let notSetYet; // declared, never assigned → undefined
console.log(notSetYet); // → undefined

let cleared = null; // deliberately "empty on purpose"
console.log(cleared); // → null
```

The `null` vs `undefined` distinction trips everyone:

- `undefined` = "this was never given a value." The language hands it to you.
- `null` = "I am intentionally setting this to empty." You choose it.

**You've seen it:** `activeChannelId: string | null` — a channel id, or
deliberately nothing (no channel selected). Meanwhile a community you've never
loaded — `this.state.byCommunity["never-loaded"]` — is `undefined`, because
nobody ever put anything there. Same "emptiness," two different stories.

**Your turn:** what prints?

```js
const obj = { a: 1 };
console.log(obj.a); // ?
console.log(obj.b); // ? (b was never set)
```

---

## Card 1.3 — value vs reference (the big one)

**What it does:** decides what `=` actually copies. **Primitives copy their
value. Objects and arrays copy a _pointer_ to the same thing.** This is the most
important idea in the tier — half the codebase's habits exist because of it.

**Run it:**

```js
// primitives: independent copies
let a = 1;
let b = a; // b gets its own copy of the value
b = 2;
console.log(a, b); // → 1 2   (a untouched)

// objects/arrays: shared pointer
const list1 = ["x"];
const list2 = list1; // list2 points at the SAME array
list2.push("y");
console.log(list1); // → [ 'x', 'y' ]   (list1 changed too!)
```

Read that twice. `list1` and `list2` are two names for **one** array in memory.
Touch it through either name, both see it. That surprise — "I only changed
list2!" — is the #1 source of mystery bugs, and avoiding it is why you'll
constantly see code make a fresh copy with `[...]` (that's the spread operator,
tier 4) instead of reusing an array directly.

**You've seen it:** `byCommunity: {}` and `entities: {}` in `initialState()` are
fresh objects every call — deliberately, so two nexuses never accidentally share
one. And `[...communityIds, channel.id]` in `upsertChannel` builds a **new**
array instead of pushing into the existing one, precisely so the old reference
stays untouched and Solid can tell something changed.

**Your turn:** what prints?

```js
const original = { count: 1 };
const alias = original;
alias.count = 99;
console.log(original.count); // predict
```

---

## Card 1.4 — truthiness

**What it does:** when you put a value inside `if (...)`, JavaScript bends it to
true or false. Most values are "truthy." A short list is "falsy."

**The falsy six** (memorize these — everything else is truthy):
`false`, `0`, `""` (empty string), `null`, `undefined`, `NaN`.

**Run it:**

```js
if ("hello") console.log("non-empty string → truthy");
if (0) console.log("never runs");
else console.log("0 → falsy");

const ids = [];
if (ids.length) console.log("never runs"); // [].length is 0 → falsy
else console.log("empty list → length 0 → falsy");
```

**You've seen it:** `if (existing) return existing;` in `loadForCommunity` —
`existing` is either a Promise (truthy → bail out, reuse it) or `undefined`
(falsy → keep going). No `=== undefined` needed; truthiness handles it. Same with
`ensureLoaded`'s `if (ids.length > 0)` — though notice that one is _explicit_
(`> 0`) rather than relying on truthiness. Both styles appear; explicit is
clearer when the number matters.

**Your turn:** which of these print?

```js
if ("") console.log("A");
if ("0") console.log("B"); // careful — string "0", not number 0
if (null) console.log("C");
if (42) console.log("D");
```

---

## Tier 1 checkpoint

You can leave tier 1 when these feel obvious:

- `const` locks the **name**, not the contents
- `null` is chosen-empty, `undefined` is never-set
- assigning an object/array shares it; assigning a primitive copies it
- you can recite the falsy six

Next stop, tier 2 — control flow: `if` / `else`, the loops (`for...of` is the one
this codebase actually uses), and `===` vs `==`.
