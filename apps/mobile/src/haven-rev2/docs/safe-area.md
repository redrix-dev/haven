# haven-rev2: Safe area boundaries

**Goal:** Apply safe-area insets once per “shell edge,” not stacked with keyboard padding on the same axis.

## Current layout

1. **Drawer shell** — `Rev2DrawerNavigator` wraps the drawer in `SafeAreaView` with `edges={['top', 'left', 'right']}`. Bottom is intentionally **not** included so keyboard + `KeyboardStickyView` / `KeyboardChatScrollView` own the lower edge inside chat surfaces.
2. **Floating bubble + sheet** — `DMBubbleHost` uses `useSafeAreaInsets()` only for **bubble drag clamping** (same as ux-lab reference), not for duplicating a full-screen `SafeAreaView` around the sheet. Sheet is inset with `left` / `right` / `bottom: 0` from screen edges per design.
3. **DirectMessagesContainer** — retains `SafeAreaView edges={['bottom']}` from production; nested inside the bubble sheet. **REV2_INFERRED:** This may stack bottom inset with sheet `bottom: 0`; revisit if home-indicator padding feels doubled when testing on device.

## Follow-ups

- If ModMail or community composer adds bottom chrome, align `extraContentPadding` + safe-area in one place and remove redundant wrappers.
