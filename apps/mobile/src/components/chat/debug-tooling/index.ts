/**
 * Chat surface layout diagnostics (RNKC / composer clearance investigations).
 *
 * Not wired in production `ChatInterface`. To re-enable during a layout debug session:
 *
 * 1. Import `useChatSurfaceLayoutDebug` in `ChatInterface.tsx`.
 * 2. Pass `surface` label (e.g. `"community"` | `"dm"`).
 * 3. Wire hook outputs:
 *    - `onComposerLayout` → compose with `applyExtraContentPadding`
 *    - `onExtraPaddingTarget` / `onExtraPaddingSettled` → inside `withTiming` callback
 *    - `onChatHostLayout` → chat host `View`
 *    - `noteScrollComponentProps` → start of `renderScrollComponent`
 *    - `noteKeyboardChatScrollViewMounted` / `onScrollViewLayout` → `ChatScrollView` debug props
 * 4. Filter Metro logs: `[ChatSurfaceLayout]`
 *
 * See `layoutDebugIntegration.ts` for typed prop shapes used by `internal/ChatScrollView`.
 */

export {
  CHAT_SURFACE_LAYOUT_DEBUG_TAG,
  buildChatSurfaceLayoutEvaluation,
  buildChatSurfaceLayoutSnapshot,
  computeRnkcEffectiveBottomPadding,
  formatChatSurfaceLayoutConclusion,
  isChatSurfaceLayoutDebugEnabled,
  logChatSurfaceLayoutSnapshot,
  type ChatSurfaceKeyboardPhase,
  type ChatSurfaceLayoutDiagnostics,
  type ChatSurfaceLayoutEvaluation,
  type ChatSurfaceLayoutSnapshot,
} from "@/components/chat/debug-tooling/chatSurfaceLayoutDebug";

export { useChatSurfaceLayoutDebug } from "@/components/chat/debug-tooling/useChatSurfaceLayoutDebug";

export type {
  ChatScrollViewLayoutDebugProps,
  ChatSurfaceLayoutDebugBindings,
} from "@/components/chat/debug-tooling/layoutDebugIntegration";
