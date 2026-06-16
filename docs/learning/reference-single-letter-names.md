# Reference — decoding single-letter names

Single letters choke you because they hide their meaning. Two rules dissolve
most of it:

1. **Read the collection, not the letter.** `for (const x of channels)` → `x` is
   "one channel." The plural on the right names the singular on the left. Don't
   decode the letter; look at what's being looped or filtered.
2. **The name is yours and means nothing to the machine.** In your own code, use
   full words — `channel`, not `c`. The codebase abbreviates from habit; you are
   never required to.

## The letters you'll actually meet in this codebase

| You see | It means | Why that letter | Real example here |
| --- | --- | --- | --- |
| `c` | one channel (or community) | first letter of the collection | `channels().filter((c) => c.kind === "text")` |
| `raw` | a raw backend row, pre-cleanup | "raw" data before `toHavenChannel` | `for (const raw of sorted)` |
| `s` | the store/state | "state" | old cache code: `s.revision` |
| `a`, `b` | two items being compared | the sort function hands you a pair | `(a, b) => a.position - b.position` |
| `id` / `ids` | one id / a list of ids | literally "identifier" | `byCommunity[communityId]` is `ids` |
| `i`, `j` | a counter / index number | `i` = "index," from old math/C code | `for (let i = 0; i < 3; i++)` |
| `n` | a number, or a count | "number" | `for (const n of nums)` |
| `e` / `err` | an error | "error" | `.catch((err) => ...)` |
| `e` / `ev` | an event | "event" | `(e) => e.target.value` (in UI) |
| `el` | a DOM element | "element" | `(el) => el.focus()` (in UI) |
| `fn` / `cb` | a function / callback | "function" / "callback" | a function passed as an argument |
| `acc` | the accumulator | builds up a result in `.reduce()` | `(acc, item) => acc + item` |
| `x`, `y` | generic values or coordinates | math habit | `(x) => x * 2` |

## The "sort pair" one is worth its own note

`(a, b) => a.position - b.position` looks cryptic but it's a fixed pattern: when
you sort, JavaScript repeatedly hands your function **two items to compare** — it
calls them `a` and `b` by convention. You return a number:

- negative → `a` comes first
- positive → `b` comes first
- zero → leave them

So `a.position - b.position` means "order by position, smallest first." You'll
see this exact shape every time anything gets sorted. `a` and `b` aren't
meaningful names — they're "the two things being compared right now."

## Your habit

- **Writing your own code:** full words, every time. `channel`, `message`,
  `index`, `error`.
- **Reading the codebase:** glance at the collection on the right, read the
  letter as its singular, move on. Don't sit and decode it.
