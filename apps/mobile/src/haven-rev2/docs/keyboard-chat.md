# haven-rev2: KeyboardChatScrollView + RNEM (audit)

**Pinned versions** (see `apps/mobile/package.json`): `react-native-keyboard-controller@1.21.0`, `react-native-enriched-markdown@^0.5.0`.

## KeyboardChatScrollView (RNKC 1.21)

Source of truth: installed typings under `node_modules/react-native-keyboard-controller/lib/typescript/components/KeyboardChatScrollView/types.d.ts` and the official “Building a chat app” guide.

### Props used in haven-rev2

| Prop | Where | Notes |
|------|--------|--------|
| `inverted` | `FlatList` on DM (`DirectMessagesContainer`) and community surfaces (`CommunityScreen`, `Rev2ChannelThreadScreen`) | List integration per RN chat pattern. |
| `extraContentPadding` | `DirectMessagesContainer` | Live composer stack height `SharedValue` (see RNKC chat guide). |
| `blankSpace` | `CommunityScreen`, `Rev2ChannelThreadScreen` | `useDerivedValue(() => composerHeight - bottom)`; `composerHeight` from `KeyboardStickyView` `onLayout`. |
| `keyboardLiftBehavior` | `Rev2ChannelThreadScreen` → `whenAtEnd` | ChatGPT-style lift at end of thread; DM and legacy community list use `ChatScrollView` defaults. |
| `automaticallyAdjustContentInsets` / `contentInsetAdjustmentBehavior` | `ChatScrollView` wrapper | Set `false` / `"never"` to avoid double insets with Safe Area + keyboard. |
| `keyboardDismissMode` | `ChatScrollView` | `"interactive"` for drag-to-dismiss. |
| `offset` | `ChatScrollView` | Small margin (`8`) between keyboard and scroll lift. |
| `freeze` | not set | Default `false`; use when emoji sheet / overlay would fight keyboard (future). |
| `ScrollViewComponent` | not customized | FlatList supplies scroll component via `renderScrollComponent` in DM pattern. |

### Shared wrapper

`@/features/community/ChatScrollView.tsx` centralizes the above defaults for both legacy and haven-rev2.

## react-native-enriched-markdown (0.5.x)

- **DM**: `DirectMessagesContainer` — `EnrichedMarkdownText` / `EnrichedMarkdownTextInput` with `markdownStyle` tokens derived from `useMobileThemeTokens` + `resolveColorProp`.
- **Community thread (rev2)**: `Rev2ChannelThreadScreen` — same bundle → `CommunityMessageBubble` + RNEM composer stack as production `CommunityScreen` (tokens via `useMobileThemeTokens` + `resolveColorProp`).

Confirm prop names against package README when upgrading minor versions.
