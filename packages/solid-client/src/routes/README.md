# `routes/` — the registration point

Maps addresses to feature views. This is the **only** layer that imports from
`features/` (through each feature's `index.ts` barrel), and it's how `App.tsx`
stays small forever: new screens register here, they don't accumulate in the app
shell. Full shape + reasoning:
[docs/architecture/SOLID_CLIENT_SHAPE.md](../../../../docs/architecture/SOLID_CLIENT_SHAPE.md).

- `@solidjs/router` gets installed when the first real screen lands. Until then,
  pre-router scaffolding (the dumb-UI playground) is still exported through here —
  `App.tsx` never learns to import screens directly.
- Popout windows are routes too (e.g. `/popout/voice`): a Tauri window is just an
  OS viewport pointed at an address. Window _management_ (creating, sizing,
  always-on-top) belongs to `apps/tauri`, not here.
