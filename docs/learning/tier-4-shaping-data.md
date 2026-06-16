# Tier 4 — shaping data

The last heavy tier. Four tools for moving data around without mutating the
shared boxes from tier 1:

1. the array transformers — `.map` / `.filter` / `.find` / `.includes`
2. the spread `...` — make a fresh copy
3. destructuring — pull pieces out into names
4. `?.` and `??` — reach in safely, fall back cleanly

After this, `channelSolidNexus.ts` reads top to bottom with no black boxes.

Run anything by pasting into `scratch.js` and running `node scratch.js`.

---

## Card 4.1 — array transformers: `.map` `.filter` `.find` `.includes`

**What it does:** in tier 3 you learned these *take a function*. Now: what each
one *gives back*. The headline — **none of them change the original array.** They
all return something new.

**Run it:**

```js
const nums = [1, 2, 3, 4];

console.log(nums.map((n) => n * 10)); // → [ 10, 20, 30, 40 ]  new array, SAME length
console.log(nums.filter((n) => n > 2)); // → [ 3, 4 ]          new array, maybe SHORTER
console.log(nums.find((n) => n > 2)); // → 3                    the FIRST match (one item)
console.log(nums.includes(3)); // → true                       a yes/no

console.log(nums); // → [ 1, 2, 3, 4 ]   ← untouched by all of the above
```

Keep the shapes straight:

- `.map` → a new array, **same length**, each item transformed
- `.filter` → a new array, **possibly shorter**, only the items that passed
- `.find` → **one item** (the first match) or `undefined` — not an array
- `.includes` → **true/false**

(There's a fourth sibling, `.reduce`, that folds a whole list into one value —
`nums.reduce((total, n) => total + n, 0)` is `10`. It's not in your nexus, but now
it won't startle you.)

**You've seen it:**

- `channels.map((channel) => channel.id)` — a list of channels → a list of their
  ids (same length, transformed).
- `ids.filter((channelId) => channelId !== id)` — drop one id (shorter list).
- `communityIds.includes(channel.id)` — "is this id already in here?" → true/false.

**Your turn:** what prints?

```js
const people = ["ana", "bo", "cy"];
console.log(people.map((p) => p.toUpperCase()));
console.log(people.filter((p) => p.length === 2));
console.log(people.find((p) => p.startsWith("c")));
```

---

## Card 4.2 — the spread `...`

**What it does:** unpacks an array or object into a **new** one. It's the
codebase's answer to tier 1's value-vs-reference problem: instead of mutating the
shared box, build a fresh copy.

**Run it:**

```js
// arrays
const a = [1, 2];
const b = [...a, 3]; // a fresh array: a's items, then 3
console.log(b); // → [ 1, 2, 3 ]
console.log(a); // → [ 1, 2 ]   ← original untouched

// objects
const base = { name: "general", kind: "text" };
const renamed = { ...base, name: "lobby" }; // copy base, then override name
console.log(renamed); // → { name: 'lobby', kind: 'text' }
console.log(base); // → { name: 'general', kind: 'text' }   ← untouched
```

Remember tier 1: `list2 = list1` shared one array, and `.push` hit both. `[...list1]`
makes a **genuine copy**, so changes don't leak back. That's the whole point of
spread — never mutate the shared thing, make a new one.

**Order matters in object spread:** later keys win. `{ ...base, name: "lobby" }`
copies `base` then overrides `name`. Flip it — `{ name: "lobby", ...base }` — and
`base`'s `name` wins back.

**You've seen it:**

- `[...communityIds, channel.id]` — copy the id list and tack one on the end. New
  array, old one untouched — which is exactly how Solid can tell something changed.
- `{ ...group, channelIds: ... }` — copy a group object but with a fresh
  `channelIds`.
- `[...channels].sort((a, b) => ...)` — here's a sharp one: `.sort` is a rare
  method that **mutates in place.** So you spread into a copy *first*, then sort
  the copy, leaving the original `channels` untouched. Spread is the guard.

**Your turn:** what prints?

```js
const original = { a: 1, b: 2 };
const updated = { ...original, b: 99, c: 3 };
console.log(updated);
console.log(original);
```

---

## Card 4.3 — destructuring

**What it does:** pull pieces out of an array or object into their own names, in
one line.

**Run it:**

```js
// arrays — by POSITION
const pair = [10, 20];
const [first, second] = pair;
console.log(first, second); // → 10 20

// objects — by NAME
const channel = { id: "abc", name: "general", kind: "text" };
const { name, kind } = channel;
console.log(name, kind); // → general text
```

- arrays: `const [first, second] = pair` → `first` is item 0, `second` is item 1.
  Position decides.
- objects: `const { name } = channel` → `name` is `channel.name`. The name must
  match the key.

**You've seen it:** `const [state, setState] = createStore(initialState())` —
`createStore` hands back a two-item array: `[the store, the setter]`. This pulls
them into two names at once, by position. That's why the constructor looked like
that. And remember the names are yours (bucket 3 from the keyword reference) — you
could write `const [s, set] = ...` and it'd work identically.

**Your turn:** what prints?

```js
const box = { hairpins: 4, gatorade: 3 };
const { hairpins } = box;
console.log(hairpins);

const [a, b, c] = [100, 200, 300];
console.log(b);
```

---

## Card 4.4 — `?.` and `??`

**What it does:** two small operators for handling "this might be missing"
without crashing.

**Run it:**

```js
// ?. optional chaining — reach in, but stop safely if it's missing
const user = { name: "Cody" };
console.log(user.address?.city); // → undefined   (no address, but no crash)
// without ?. , user.address.city would CRASH: can't read .city of undefined

// ?? nullish coalescing — "the left, unless it's null/undefined, then the right"
console.log(null ?? "fallback"); // → fallback
console.log(0 ?? "fallback"); // → 0   (0 is a real value, so it stays)
```

- `?.` = "if the thing before me is null/undefined, stop here and give `undefined`
  instead of throwing."
- `??` = "use the left side; only if it's null or undefined, use the right."

**The `??` vs `||` trap** (why the codebase uses `??`): the older `||` falls back
on *any* falsy value — including `0` and `""`, which are often real, valid data.
`??` only falls back on null/undefined.

```js
console.log(0 || "fallback"); // → fallback   (treats 0 as "missing" — usually wrong)
console.log(0 ?? "fallback"); // → 0          (keeps the real 0 — usually right)
```

**You've seen it:**

- `this.state.byCommunity[communityId] ?? []` — "the id list for this community,
  or an empty array if there isn't one yet." Stops `undefined` from reaching the
  `.filter` / `.includes` that follow.
- `existing ?? groupState.collapsedGroupIds` — "keep the existing collapse state,
  or fall back to the freshly loaded one."
- And `?.` over in the shared selector: `if (!ids?.length)` — "if `ids` is missing,
  OR it has length 0." The `?.` makes the missing case safe instead of a crash.

**Your turn:** what prints?

```js
const data = { count: 0 };
console.log(data.count ?? 99); // careful — is 0 null/undefined?
console.log(data.missing ?? 99);
console.log(data.nested?.deep);
```

---

## Tier 4 checkpoint

You can leave tier 4 when:

- `.map` = new array same length, `.filter` = new array maybe shorter, `.find` =
  one item, `.includes` = true/false — and none touch the original
- spread `...` reads as "make a fresh copy" (arrays and objects)
- destructuring reads as "pull pieces into names" — `[by position]`, `{by name}`
- `?.` = reach in safely; `??` = fall back only on null/undefined

That's the foundation done. Tiers 5–8 (async, the TypeScript layer, classes &
modules, Solid reactivity) are thinner and sit entirely on what you now have. And
the promise comes due: you can now open `channelSolidNexus.ts` and read it top to
bottom. Want to do exactly that next — a guided read of the whole file, where you
narrate and I just confirm and fill gaps?
