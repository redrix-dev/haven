import { useCallback, useEffect, useRef } from "react";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
  COMPOSER_BACKDROP_IMMERSIVE_OPACITY,
  COMPOSER_BACKDROP_REST_OPACITY,
  COMPOSER_CHROME_IMMERSIVE_MS,
  COMPOSER_CHROME_IMMERSIVE_OPACITY,
  COMPOSER_CHROME_REST_MS,
  COMPOSER_CHROME_REST_OPACITY,
  COMPOSER_CHROME_SETTLE_MS,
} from "@/components/chat/chatSurfaceConstants";

export function useChatComposerChrome() {
  const composerChromeOpacity = useSharedValue(COMPOSER_CHROME_REST_OPACITY);
  const composerBackdropOpacity = useSharedValue(COMPOSER_BACKDROP_REST_OPACITY);
  const listDragRef = useRef(false);
  const listMomentumRef = useRef(false);
  const composerSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearComposerSettleTimer = useCallback(() => {
    if (composerSettleTimerRef.current != null) {
      clearTimeout(composerSettleTimerRef.current);
      composerSettleTimerRef.current = null;
    }
  }, []);

  const goComposerChromeImmersive = useCallback(() => {
    clearComposerSettleTimer();
    composerChromeOpacity.value = withTiming(COMPOSER_CHROME_IMMERSIVE_OPACITY, {
      duration: COMPOSER_CHROME_IMMERSIVE_MS,
    });
    composerBackdropOpacity.value = withTiming(COMPOSER_BACKDROP_IMMERSIVE_OPACITY, {
      duration: COMPOSER_CHROME_IMMERSIVE_MS,
    });
  }, [clearComposerSettleTimer, composerBackdropOpacity, composerChromeOpacity]);

  const scheduleComposerChromeRest = useCallback(() => {
    clearComposerSettleTimer();
    composerSettleTimerRef.current = setTimeout(() => {
      composerSettleTimerRef.current = null;
      if (!listDragRef.current && !listMomentumRef.current) {
        composerChromeOpacity.value = withTiming(COMPOSER_CHROME_REST_OPACITY, {
          duration: COMPOSER_CHROME_REST_MS,
        });
        composerBackdropOpacity.value = withTiming(COMPOSER_BACKDROP_REST_OPACITY, {
          duration: COMPOSER_CHROME_REST_MS,
        });
      }
    }, COMPOSER_CHROME_SETTLE_MS);
  }, [clearComposerSettleTimer, composerBackdropOpacity, composerChromeOpacity]);

  useEffect(() => () => clearComposerSettleTimer(), [clearComposerSettleTimer]);

  const composerChromeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: composerChromeOpacity.value,
  }));

  const composerBackdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: composerBackdropOpacity.value,
  }));

  const listScrollHandlers = {
    onScrollBeginDrag: () => {
      listDragRef.current = true;
      goComposerChromeImmersive();
    },
    onScrollEndDrag: () => {
      listDragRef.current = false;
      scheduleComposerChromeRest();
    },
    onMomentumScrollBegin: () => {
      listMomentumRef.current = true;
      goComposerChromeImmersive();
    },
    onMomentumScrollEnd: () => {
      listMomentumRef.current = false;
      scheduleComposerChromeRest();
    },
  } as const;

  return { composerBackdropAnimatedStyle, composerChromeAnimatedStyle, listScrollHandlers };
}
