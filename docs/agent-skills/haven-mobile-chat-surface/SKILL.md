---
name: haven-mobile-chat-surface
description: Use when changing Haven mobile community chat or DM chat layout, ChatInterface, ChatComposer, inverted message lists, RNKC KeyboardChatScrollView, KeyboardStickyView, KeyboardGestureArea, composer clearance, extraContentPadding, safe-area math, blankSpace, or keyboard lift behavior.
---

# Haven Mobile Chat Surface

## Golden Rule

Screens compose `ChatInterface` and `ChatComposer`. All React Native Keyboard
Controller layout belongs under `apps/mobile/src/components/chat/`.

```tsx
import { ChatComposer, ChatInterface } from "@/components/chat";

<ChatInterface
  data={items}
  renderItem={renderItem}
  keyboardScrollProps={{ keyboardLiftBehavior: "whenAtEnd" }}
  composer={<ChatComposer {...composerProps} />}
/>;
```

## Ownership

| Layer            | File                                                          | Owns                                                                                               |
| ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Shell            | `apps/mobile/src/components/chat/ChatInterface.tsx`           | Safe area, `KeyboardGestureArea`, `KeyboardStickyView`, inverted `FlatList`, `extraContentPadding` |
| Scroll wrapper   | `apps/mobile/src/components/chat/internal/ChatScrollView.tsx` | The only direct `KeyboardChatScrollView` wrapper                                                   |
| Constants        | `apps/mobile/src/components/chat/chatSurfaceConstants.ts`     | Composer min height, margin, list top padding formula                                              |
| Composer UI      | `apps/mobile/src/components/chat/ChatComposer.tsx`            | Input chrome only                                                                                  |
| Screens/features | community and DM screens                                      | Data, `renderItem`, composer props                                                                 |

## Required Pattern

- `SafeAreaView` bottom edge is owned by `ChatInterface`.
- The list is inverted and wired inside `ChatInterface`.
- Top padding is
  `CHAT_COMPOSER_MIN_HEIGHT + CHAT_SURFACE_MARGIN`.
- `extraContentPadding` is computed from sticky layout growth only:
  multiline composer, reply strip, media strip.
- `KeyboardChatScrollView` receives
  `offset={bottom - CHAT_SURFACE_MARGIN}` inside `internal/ChatScrollView.tsx`.
- `KeyboardGestureArea` uses `offset={CHAT_COMPOSER_MIN_HEIGHT}` and the shared
  composer native id.
- Composer bottom spacing is the chat surface margin inside the safe-area box.

## Never Do These

- Do not import `KeyboardChatScrollView` outside
  `components/chat/internal/ChatScrollView.tsx`.
- Do not place `KeyboardStickyView` or `KeyboardGestureArea` outside
  `components/chat/`.
- Do not use `blankSpace` for normal chat. It is for AI-streaming layouts, not
  composer clearance.
- Do not set screen-level `contentContainerStyle.paddingTop` for chat lists.
- Do not subtract safe-area bottom manually from composer bottom when
  `ChatInterface` already owns the bottom safe area.
- Do not "fix" overlap by increasing magic padding. Fix the shell/constant
  contract.

## Validation

- `npm run check:chat-surface`
- `npm run mobile:typecheck`
- `npm run mobile:bundle` when imports, navigation, or Metro resolution changed

Use the debug tooling under
`apps/mobile/src/components/chat/debug-tooling/` only during investigation.
Remove temporary wiring before handoff.
