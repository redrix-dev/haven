# Reference — is this a name, or the language?

When you see a word like `triple` and can't tell if it's "special" or just a
made-up label, run one test.

## The test: could you rename it without breaking anything?

- **Rename works** → it was just a name. Its meaning lives where it was defined,
  not in the word.
- **Rename breaks everything** → it belongs to the language. Fixed meaning.

Proof — rename `triple` to `banana`:

```js
function multiplier(factor) {
  return (n) => n * factor;
}
const banana = multiplier(3);
console.log(banana(5)); // → 15  (identical — the word never mattered)
```

`multiplier(3)` is what made it times-three. `triple` was a sticker chosen to
describe the contents. Try renaming `const` or `return` or `console` → instant
breakage. That asymmetry is your detector.

## The three buckets

**1. Language keywords** — fixed, can't rename, editor colors them:

```
const  let  function  return  if  else  for  of  in  while
true  false  null  undefined  new  class  this  typeof
import  export  async  await
```

**2. Built-ins** — provided by the runtime, finite, learned by exposure:

```
console  Math  Date  Object  Array  Promise
.map  .filter  .sort  .find  .includes  .push  .length
```

**3. Made-up names** — everything else, all arbitrary:

```
triple  nums  channel  add  n  communityId  projectChannels
```

To know what a bucket-3 name means, **find where it was born:**

| You see | What it tells you |
| --- | --- |
| `const X = ...` / `let X = ...` | X means whatever is on the right |
| `function X(...) { }` | X is a function defined right here |
| `(X) =>` or `function f(X)` | X is a **parameter**: a placeholder, filled when the function is called |

The name is a sticker. The definition is the contents. (Same as tier 1: name =
box, value = what's inside.)

## The sneaky case — parameters

```js
function apply(fn, value) {
  return fn(value);
}
apply(triple, 5); // inside apply: fn becomes triple, value becomes 5
```

`fn` and `value` mean nothing on their own — they're promises: "whatever you hand
me, I'll call it this inside here." The same `fn` could be `triple` on one call
and `double` on the next.

## The trickiest case — a name after a dot

A word after a dot (`data.count`) is a **drawer label**, never a command. The dot
only ever looks up a label in the object on its left — it never searches or
computes. So "does this name mean something?" becomes "does that label exist in
the object?" — and you answer it by looking at where the object was built.

```js
const data = { count: 0 }; // one drawer, labeled "count"

data.count; // → 0          the drawer exists
data.missing; // → undefined   no such drawer — "nothing here", not a crash
data.nested; // → undefined   no such drawer either
```

`missing` and `nested` mean nothing — they're labels that aren't in the drawer
set. Rename proof: `data.banana` gives the same `undefined` as `data.missing`. The
flip side: `count` means something *only because* `{ count: 0 }` defined it — write
`data.kount` and you get `undefined`, because the access must match the
definition's label.

Reading habit: every time you see `data.something`, scroll to where `data` was
built and check if `something` is one of its labels. Yes → real value. No →
`undefined`. (And `data.nested?.deep` uses `?.` precisely because `nested` might not
exist — it lets the next step give up safely instead of crashing.)

Descriptive example names are the hardest case: a good label whispers "I mean
something" even when it's empty air.

## Single letters are just bucket 3 with a lazy sticker

`n`, `c`, and `triple` are all equally arbitrary. The letter just gives no hint —
so fall back on the tier-2 move: read the collection it came from
(`for (const n of nums)` → `n` is one num). See
[reference-single-letter-names.md](reference-single-letter-names.md).

## Two crutches (both legitimate)

- **Lean on editor colors.** Keywords, strings, and your names are each colored
  differently. Let the color pre-sort the buckets.
- **When you write code, choose loud stickers.** `tripleTheNumber`, not `triple`.
  `eachChannel`, not `c`. Over-name while learning.
