# Haven — Chat App UI Kit

Faithful recreation of the **redrix-dev/haven** Electron + web chat app surface, lifted from the live source.

## Layout

The app has a **fixed three-pane shell** plus a 32px draggable title bar on top (Electron only):

```
┌─────────────────── TitleBar (32px, drag) ──────────────────┐
│ 🦉 Haven                                       –  □  ✕     │
├──────┬─────────────────┬─────────────────────────┬─────────┤
│ Srv  │ Channel sidebar │ Chat area               │ Members │
│ rail │ — header        │ — channel header        │ panel   │
│ 72px │ — channel list  │ — message list          │ (opt.)  │
│      │ — user card     │ — composer              │         │
└──────┴─────────────────┴─────────────────────────┴─────────┘
```

## Files

- `index.html` — full chrome rendered together with seed data (one community, three channels, several messages). Fully cosmetic.
- `TitleBar.jsx` — 32px draggable bar with the inline owl SVG and Windows traffic-light controls.
- `ServerRail.jsx` — 72px left rail with squircle (rounded-2xl) server tiles, "+" tile, "Discover" pill.
- `ChannelSidebar.jsx` — community name header, expandable channel groups (text + voice), per-channel rows with hash icon, unread pip, voice presence row, user card pinned to footer with status dot.
- `ChatArea.jsx` — channel header (`# general` / Voice icon), message list, composer pinned to bottom.
- `Message.jsx` — avatar + name + timestamp + body + (optional) reactions + reply chain.
- `Composer.jsx` — markdown-aware textarea row with attach / emoji / send.
- `UserCard.jsx`, `MemberList.jsx`, `Avatar.jsx` — supporting bits.

## Notes

- Reuses `Icon.jsx` and `Button.jsx` from `../site/` rather than duplicating; `index.html` loads them by relative path.
- Tokens come from `../../colors_and_type.css`.
- Lucide icons are used everywhere except the title-bar mascot (which uses the bespoke 16×16 inline SVG from `app/components/TitleBar.tsx` — the PNG would muddy at that size).
- Composer accepts text and posts a fake message into the list. No backend, no persistence.
