# haven-rev2 (mobile)

In-tree rebuild shell: **drawer + nested stacks**, **persistent DM bubble**, **community channel thread** (`Rev2ChannelThreadScreen`, production-style bundles + composer + RNKC), and **production DM inbox** inside the sheet via `DirectMessagesContainer`.

## How to launch

1. Open [`apps/mobile/src/navigation/RootNavigator.tsx`](../navigation/RootNavigator.tsx).
2. Set **`USE_HAVEN_REV2`** to `true` (dev only).
3. Set **`USE_UX_LAB`** to `false` if you do not want the UX lab navigator to take precedence.

```ts
const USE_HAVEN_REV2 = __DEV__ && true;
const USE_UX_LAB = __DEV__ && false;
```

4. Run the app as usual (`npm run ios` / Metro from `apps/mobile`).

## Layout docs

- [`docs/keyboard-chat.md`](./docs/keyboard-chat.md) — RNKC `KeyboardChatScrollView` + RNEM usage notes.
- [`docs/safe-area.md`](./docs/safe-area.md) — safe area vs keyboard boundaries.

## UX lab

`apps/mobile/src/dev/ux-lab/**` is **unchanged**; `DMBubbleHost` was adapted from `FloatingDMBubble` as a **copy** for intent only.
