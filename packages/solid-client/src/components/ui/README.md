# `components/ui/` — shared dumb primitives

Visual primitives any feature may use: Button, Avatar, Tooltip, … Props in, JSX
out. Full shape + reasoning:
[docs/architecture/SOLID_CLIENT_SHAPE.md](../../../../docs/architecture/SOLID_CLIENT_SHAPE.md).

The lint-enforced contract: this layer is the **bottom** (alongside `data/`) — it
imports `@shared` and solid-js only. No `data/` access, no `core/`, no feature
knowledge. If a component needs to read a cache or know about a domain, it isn't
a primitive — it belongs inside the feature that needs it.

(`../DevLogin.tsx` sits outside `ui/` because it's disposable bootstrap
scaffolding, not a primitive — it dies when the first real auth screen lands.)
