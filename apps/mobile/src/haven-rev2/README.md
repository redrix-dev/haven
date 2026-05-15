# haven-rev2 (mobile)

In-tree rebuild shell: **drawer + nested stacks** (Home drawer item hosts the community stack: list → channels → thread), **persistent DM bubble**, **community channel thread** (`Rev2ChannelThreadScreen`, production-style bundles + composer + RNKC), and **production DM inbox** inside the sheet via `DirectMessagesContainer`.

## How to launch

1. Open [`apps/mobile/src/config/havenMobileRev2.ts`](../config/havenMobileRev2.ts) and set **`USE_HAVEN_REV2`** to `true` (dev only).
2. Open [`apps/mobile/src/navigation/RootNavigator.tsx`](../navigation/RootNavigator.tsx) — it imports the same flag.
3. Set **`USE_UX_LAB`** to `false` if you do not want the UX lab navigator to take precedence.

```ts
// apps/mobile/src/config/havenMobileRev2.ts
export const USE_HAVEN_REV2 = __DEV__ && true;
```

```ts
// apps/mobile/src/navigation/RootNavigator.tsx (UX lab)
const USE_UX_LAB = __DEV__ && false;
```

4. Run the app as usual (`npm run ios` / Metro from `apps/mobile`).

## Layout docs

- [`docs/keyboard-chat.md`](./docs/keyboard-chat.md) — RNKC `KeyboardChatScrollView` + RNEM usage notes.
- [`docs/safe-area.md`](./docs/safe-area.md) — safe area vs keyboard boundaries.

## UX lab

`apps/mobile/src/dev/ux-lab/**` is **unchanged**; `DMBubbleHost` was adapted from `FloatingDMBubble` as a **copy** for intent only.

## Parity backlog (rev2 vs legacy shell)

Explicitly **not** tracking here: drawer vs **`HavenNavbar`** affordances, **bottom tab** model, and **DM modal shell / safe-area** polish (see [`docs/safe-area.md`](./docs/safe-area.md)).

Status: **items 1, 2, 3, and 6 below are implemented** in code; items **4**, **5**, and **7** remain intentionally out of scope.

### 1. Push notification tap routing — done

Wire the same surface as legacy **`HavenTabNavigator`**: call **`useMobilePushNotificationRouting()`** and register **`useMobilePushNavigationStore.setHandlers({ … })`** (`openDm`, `openFriends`, `openMention`, `openNotifications`, `refreshUrgentSurfaces`) from the rev2 root shell so cold starts and taps behave like production tabs.

### 2. Friends → Message → DM bubble — done (behavior spec)

When the user taps **Message** on a friend:

- **Open the DM bubble** (expand sheet if collapsed), not only `openDirectMessageWithUser` in context.
- If a **conversation already exists**: select that thread as the active open chat (same as today’s selection semantics).
- If **no thread yet** (first message): open a **thread view** with **no messages** and a single empty-state line: *“This is the beginning of your direct messages with [username]. Cheers to new friendships!”* The user can compose and send; on success the conversation appears in the inbox list as today.
- If the user **closes the bubble (or backs out) without sending** in that “new thread” state: **discard** — do **not** persist an empty inbox row or ghost conversation.

### 3. Home / communities list = legacy Home grid — done

Align **`Rev2CommunityListScreen`** with legacy **`HomeScreen`**: **4-column grid**, **create** tile, **join** (invite) tile, and the same create/join flows (modals + `useServers` / control plane), not list-only.

### 4. Drawer vs legacy navbar affordances — out of scope

### 5. Bottom tab model — out of scope

### 6. ModMail / moderation in the DM bubble — done

Real moderation UI in the bubble (when the user has managed communities), guided by:

- **API**: `packages/shared/src/lib/backend/serverModmailBackend.ts` and related moderation/report RPCs used by shared panels.
- **Desktop / chat-app wiring**: `packages/shared/src/app/chat-app/modals/ChatAppModalLayer.tsx` → **`ModerationChatModals`** → **`ServerModmailPanel`** / flows; staff DM reports: **`DmReportReviewPanel`** (`packages/shared/src/features/moderation/components/`).
- **Mobile precedent**: `apps/mobile/src/features/moderation/MobileModmailPanel.tsx` (reports list/detail using `getServerModmailBackend()`).

Mount or adapt the mobile panel (or a slim rev2 variant) for the **modmail** channel in the bubble sheet when the user has managed communities / staff access.

### 7. DM modal shell / safe-area polish — out of scope (see [`docs/safe-area.md`](./docs/safe-area.md))
