# Chat app composition controllers

Hooks in this folder are **composition slices** for [`useChatAppOrchestration`](../../hooks/useChatAppOrchestration.ts). They keep the facade readable and group related wiring:

| Module | Role |
| --- | --- |
| `usePermissionsReportSlice` | Batch permission hydration for joined servers; `managedReportServerIds` / modmail flag. |
| `useChatAppAccessAndBroadcastOrchestration` | Server/channel access loss, voice disconnect toasts, realtime ban/revoke broadcasts; registers handlers on [`communityAccessBroadcastBridge`](../realtime/communityAccessBroadcastBridge.ts). |
| `useChatAppElevationEffects` | Async elevation UI flags for current, voice, and members-modal contexts; uses `usePermissionsStore.ensureElevatedInServer`. |
| `useChatAppBusinessActions` | Invite redemption, attachments, reports, ban/kick, channel perm saves, account settings. |
| `useChatAppConfirmationHandlers` | UI-store confirmation drafts and `confirmPendingUiAction`. |
| `useChatAppLifecycleEffects` | Prompt trap, modmail gate, sign-out reset, empty-server UI reset, channel/message prefetch. |

**Composition vs owned domain logic**

- Put **cross-feature shell wiring** here or in `useChatAppOrchestration` (navigation + multiple stores + backends in one flow).
- Put **single-feature state** in `features/*` hooks (e.g. `useChannelGroups`, `useDirectMessages`, `useMessages`); prefer **Zustand** (`permissionsStore`, etc.) for data shared across features instead of growing the orchestration return object.

Do not import these from feature packages directly unless a feature is intentionally becoming the new owner of that slice.
