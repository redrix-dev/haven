# Chat app composition controllers

Hooks in this folder are **composition slices** for [`useChatAppOrchestration`](../../hooks/useChatAppOrchestration.ts). They keep the facade readable and group related wiring:

| Module | Role |
| --- | --- |
| `usePermissionsReportSlice` | Batch permission hydration for joined servers; `managedReportServerIds` / modmail flag. |
| `useChatAppAccessAndBroadcastOrchestration` | Server/channel access loss, voice disconnect toasts, realtime ban/revoke broadcasts. |
| `useChatAppElevationEffects` | Async `isElevatedInServer` resolution for current, voice, and members-modal contexts. |
| `useChatAppBusinessActions` | Invite redemption, attachments, reports, ban/kick, channel perm saves, account settings. |
| `useChatAppConfirmationHandlers` | UI-store confirmation drafts and `confirmPendingUiAction`. |
| `useChatAppLifecycleEffects` | Prompt trap, modmail gate, sign-out reset, empty-server UI reset, channel/message prefetch. |

Do not import these from feature packages directly unless a feature is intentionally becoming the new owner of that slice.
