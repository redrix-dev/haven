# `components/ui/` — shared dumb primitives

Visual primitives any feature may use: Button, Avatar, Tooltip, … Props in, JSX
out. Full shape + reasoning:
[docs/architecture/SOLID_CLIENT_SHAPE.md](../../../../docs/architecture/SOLID_CLIENT_SHAPE.md).

The lint-enforced contract: this layer is the **bottom** (alongside `data/`) — it
imports `@shared` and solid-js only. No `data/` access, no `core/`, no feature
knowledge. If a component needs to read a cache or know about a domain, it isn't
a primitive — it belongs inside the feature that needs it.

Current inventory: `cn` (class merge), `Button`, `TextField`, `Avatar`,
`Tooltip` (Kobalte wraps styled with the semantic theme tokens), and
`Markdown/` — the chat markdown renderer and data-free composer toolbar. Its
underscore/italic/bold grammar, formatting actions, shortcuts, and
`||spoiler||` support are contractually aligned with mobile via
`@shared/features/messaging/utils/communityMarkdownParity.ts`.

Styling rule: use **semantic** Tailwind utilities only (`bg-card`,
`text-foreground`, `bg-surface-panel`, …). The generated theme bridge
(`packages/shared/src/styles/globals.css`) does not emit utilities for the raw
primitive scale, so classes like `bg-surface-2` or `text-text-primary` silently
do nothing.
