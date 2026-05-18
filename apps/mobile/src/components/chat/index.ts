/**
 * Public chat surface API for Haven mobile.
 *
 * Screens compose message lists with `ChatInterface` + `ChatComposer` only.
 * Do not import `internal/ChatScrollView` or RNKC scroll primitives directly.
 */
export { ChatInterface, type ChatInterfaceProps } from "@/components/chat/ChatInterface";
export { ChatComposer, type ChatComposerProps } from "@/components/chat/ChatComposer";
export { ChatReplyStrip } from "@/components/chat/ChatReplyStrip";
export { ChatMediaAttachmentStrip } from "@/components/chat/ChatMediaAttachmentStrip";
export {
  CHAT_COMPOSER_MIN_HEIGHT,
  CHAT_COMPOSER_NATIVE_ID,
  CHAT_LIST_TOP_PADDING,
  CHAT_SURFACE_MARGIN,
} from "@/components/chat/chatSurfaceConstants";
