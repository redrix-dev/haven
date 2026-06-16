# Tier 3 — functions

The big tier — but built entirely from pieces you already have. A function takes
inputs and hands back an output. The four ideas:

1. how to write one (the `() =>` arrow)
2. a function is a **value** — you can store it, pass it, return it
3. **callbacks** — handing a function to another function to run for you
4. **closures** — a function remembers the values it was born next to

Run anything by pasting into `scratch.js` and running `node scratch.js`.

---

## Card 3.1 — writing a function: the `() =>` arrow

**What it does:** packages some steps under a name, takes inputs in `( )`, hands
back an output with `return`.

**Run it:**

```js
// the classic "declaration" form
function add(a, b) {
  return a + b;
}

// the arrow form — same thing, different spelling
const add2 = (a, b) => {
  return a + b;
};

console.log(add(2, 3), add2(2, 3)); // → 5 5
```

**The one shortcut that explains most arrows you see:** if the body is a single
expression, drop the `{ }` and the `return` — the arrow returns it automatically:

```js
const double = (x) => x * 2; // implicitly returns x * 2
console.log(double(5)); // → 10
```

So `(x) => x * 2` reads as "a function that takes `x` and gives back `x * 2`."

**The gotcha that bites everyone — returning an object.** Because `{` starts a
function body, this is ambiguous:

```js
const broken = () => { n: 1 };   // ❌ JS thinks { } is the body, returns nothing
const fixed  = () => ({ n: 1 }); // ✅ parens say "this is an object to return"
console.log(fixed()); // → { n: 1 }
```

**You've seen it:** this is the *exact* reason your file writes
`const initialState = (): ChannelNexusState => ({ ... });` and
`const toHavenChannel = (raw) => ({ ... });` — those parens around the `{ }` mean
"return this object." Now the wrapping parens aren't mysterious; they're required.

**Your turn:** what prints?

```js
const shout = (word) => word + "!";
console.log(shout("hi"));
console.log(shout("tier 3"));
```

---

## Card 3.2 — a function is a value

**What it does:** the leap. A function can be stored in a `const`, passed as an
argument, and returned — exactly like a number or a string. It's a thing, not
just an action.

**Run it:**

```js
const double = (x) => x * 2;
const sameFn = double; // pass the function itself — note: NO parens
console.log(sameFn(5)); // → 10

function runTwice(fn) {
  // `fn` is whatever function you hand in
  return fn(fn(1));
}
console.log(runTwice(double)); // → 4   (double(double(1)) = double(2) = 4)
```

**The parens / no-parens distinction is the whole game** (and it's the same thing
you'll hit with Solid accessors):

- `double` — the function itself. The recipe. You're holding it, not running it.
- `double(5)` — **run** the recipe with `5`, get the result back.

When you write `runTwice(double)` you hand over the *recipe* and let `runTwice`
decide when to call it. That's the move that unlocks the next two cards.

**You've seen it:** `createMemo(() => projectChannels(this.state, communityId()))`
hands a function (the recipe) to `createMemo`, which decides when to run it.
You're not calling your function — you're giving it away to be called later.

**Your turn:** what prints?

```js
const add1 = (n) => n + 1;
function apply(fn, value) {
  return fn(value);
}
console.log(apply(add1, 10));
```

---

## Card 3.3 — callbacks: handing a function to `.map` / `.filter`

**What it does:** a **callback** is a function you pass into another function so it
can run it for you — usually once per item. `.filter` and `.map` are the two you
will see constantly. (Tier 4 digs into exactly what they return; here the point
is just: you're passing a function.)

**Run it:**

```js
const nums = [1, 2, 3, 4];

// .filter keeps the items where your function returns true
const evens = nums.filter((n) => n % 2 === 0);
console.log(evens); // → [ 2, 4 ]

// .map makes a new array by transforming each item
const doubled = nums.map((n) => n * 2);
console.log(doubled); // → [ 2, 4, 6, 8 ]
```

This is a loop from tier 2 with a function plugged in. `.map` is essentially:
"`for...of` the array, run my function on each, collect the answers." You hand
over the *what to do with each item*; it handles the looping.

**You've seen it:**

- `channels().filter((c) => c.kind === "text")` — keep only channels whose kind is
  text. The callback `(c) => c.kind === "text"` returns true/false per channel.
- `channels.map((channel) => channel.id)` — turn a list of channels into a list of
  their ids. The callback says "for each channel, give me its id."
- `[...channels].sort((a, b) => a.position - b.position)` — `.sort` hands your
  callback **two** items to compare (the `a`/`b` pair from the decoder card) and
  orders by the number you return.

**Your turn:** what prints?

```js
const words = ["hi", "there", "you"];
const lengths = words.map((w) => w.length);
console.log(lengths);
const long = words.filter((w) => w.length > 2);
console.log(long);
```

---

## Card 3.4 — closures: a function remembers where it was born

**What it does:** when you create a function, it quietly keeps a link to the
variables that were in scope around it — and remembers them even after that outer
code has finished. That remembered backpack is a **closure.**

**Run it:**

```js
function makeGreeter(greeting) {
  // the returned arrow remembers `greeting`
  return (name) => greeting + ", " + name;
}

const sayHi = makeGreeter("Hi");
const sayYo = makeGreeter("Yo");

console.log(sayHi("Cody")); // → Hi, Cody
console.log(sayYo("Cody")); // → Yo, Cody
```

`makeGreeter` finished running both times — but the little functions it handed
back still *remember* the `greeting` they were each born with. `sayHi` carries
`"Hi"`, `sayYo` carries `"Yo"`. Two functions, two private backpacks. That carried
memory is the closure.

**You've seen it — this is the accessor mechanism.** In your file:

```js
channels(communityId) {
  return createMemo(() => projectChannels(this.state, communityId()));
}
```

The arrow handed to `createMemo` is a closure: after `channels(...)` returns, that
arrow still remembers two things from where it was born — `this.state` (the store)
and `communityId` (the getter you passed in). That's *why* the accessor keeps
working later: it carries its inputs with it in its backpack. Closures are what
make "give me a live view tied to this community" possible.

**Your turn:** what prints?

```js
function multiplier(factor) {
  return (n) => n * factor;
}
const triple = multiplier(3);
console.log(triple(5));
console.log(triple(10));
```

---

## Tier 3 checkpoint

You can leave tier 3 when:

- `(x) => x * 2` reads instantly as "a function that returns `x * 2`"
- you know `fn` is the recipe and `fn()` runs it — parens matter
- a callback reads as "a function I hand to another function to run for me"
- a closure reads as "a function carrying a backpack of the values it was born with"

Next stop, tier 4 — shaping data: objects in full, the `.map` / `.filter` /
`.reduce` family for real, destructuring, the spread `...`, and the `?.` / `??`
operators. After tier 4, almost every line of the nexus is plain reading.
