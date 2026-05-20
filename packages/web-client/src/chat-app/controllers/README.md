# Chat app controllers (deprecated)

Controller slices were folded into:

- **HavenCore.bootstrapSession** — permissions bulk hydrate, profile upsert, realtime subscribe
- **ChatAppSessionProvider** — web session composition (`useChatAppSessionState`)
- **AppRoot / access handlers** — community access broadcast registration (see `communityAccessHandlers`)

Do not add new `use*Orchestration` or controller hooks. Read domain state from HavenCore nexuses.
