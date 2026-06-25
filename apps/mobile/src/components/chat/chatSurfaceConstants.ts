/** Bottom inset margin shared by chat list keyboard scroll + sticky composer. */
export const CHAT_SURFACE_MARGIN = 8;

/** `nativeID` for composer input — pairs with `KeyboardGestureArea.textInputNativeID`. */
export const CHAT_COMPOSER_NATIVE_ID = "haven-chat-composer";

/**
 * Single-line `KeyboardStickyView` height (RNKC `MIN_INPUT_HEIGHT` / `INPUT_HEIGHT`).
 * `extraContentPadding` = max(measuredHeight - this, 0) on layout.
 */
export const CHAT_COMPOSER_MIN_HEIGHT = 60;

/** @deprecated Use CHAT_COMPOSER_MIN_HEIGHT */
export const CHAT_COMPOSER_BASELINE_HEIGHT = CHAT_COMPOSER_MIN_HEIGHT;

export const COMPOSER_CHROME_IMMERSIVE_OPACITY = 0.38;
export const COMPOSER_CHROME_REST_OPACITY = 1;
export const COMPOSER_BACKDROP_IMMERSIVE_OPACITY = 0.12;
export const COMPOSER_BACKDROP_REST_OPACITY = 0.72;
export const COMPOSER_CHROME_IMMERSIVE_MS = 140;
export const COMPOSER_CHROME_REST_MS = 280;
export const COMPOSER_CHROME_SETTLE_MS = 200;

export const COMPOSER_SELECTION_COLOR = "rgba(63, 121, 216, 0.4)";

/**
 * Inverted list `paddingTop` — RNKC: `INPUT_HEIGHT + MARGIN` (visual gap above composer).
 * @see https://kirillzyusko.github.io/react-native-keyboard-controller/docs/guides/building-chat-app
 */
export const CHAT_LIST_TOP_PADDING =
  CHAT_COMPOSER_MIN_HEIGHT + CHAT_SURFACE_MARGIN;
