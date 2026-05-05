import { Modal, View, Text, Pressable, ScrollView, Keyboard, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
} from "react-native-reanimated";
import { KeyboardController } from "react-native-keyboard-controller";
import { useEffect, useRef, useState } from "react";
import { scheduleOnRN } from "react-native-worklets";

interface HavenModalShellProps {
    variant: "settings" | "inbox";
    visible: boolean;
    onDismiss: () => void;
    title?: string;
    /** When false, inbox body is a plain flex container (use for nested FlatList). */
    bodyScrollable?: boolean;
    children: React.ReactNode;
}

const SLIDE_DURATION = 320;
const FADE_DURATION = 220;
/** Extra px so the sheet clears the viewport on all devices (fixed values like 600 lag before unmount). */
const OFFSCREEN_BUFFER_PX = 24;

export function HavenModalShell({
    variant,
    visible,
    onDismiss,
    title,
    bodyScrollable = true,
    children,
}: HavenModalShellProps) {
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const isSettingsVariant = variant === "settings";

    const offscreenTranslateY = windowHeight + insets.bottom + OFFSCREEN_BUFFER_PX;

    // Keep modal mounted during exit animation
    const [modalVisible, setModalVisible] = useState(visible);
    const [keyboardInset, setKeyboardInset] = useState(0);
    const isClosingRef = useRef(false);
    const closeCompletedRef = useRef(false);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scrimOpacity = useSharedValue(0);
    const cardTranslateY = useSharedValue(offscreenTranslateY);

    const completeClose = (notifyParent: boolean) => {
        if (closeCompletedRef.current) return;
        closeCompletedRef.current = true;
        if (closeTimeoutRef.current !== null) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        isClosingRef.current = false;
        if (notifyParent) {
            onDismiss();
        }
        setModalVisible(false);
    };

    const startCloseAnimation = (notifyParent: boolean) => {
        if (isClosingRef.current) return;
        isClosingRef.current = true;
        closeCompletedRef.current = false;
        scrimOpacity.value = withTiming(0, { duration: FADE_DURATION });
        cardTranslateY.value = withTiming(offscreenTranslateY, { duration: SLIDE_DURATION }, (finished) => {
            if (finished) scheduleOnRN(completeClose, notifyParent);
        });
        // Safety fallback: if the animation worklet callback never fires (e.g. app
        // backgrounded mid-animation), force-complete the close so the modal doesn't
        // stay mounted as an invisible touch-blocking overlay.
        closeTimeoutRef.current = setTimeout(() => completeClose(notifyParent), SLIDE_DURATION + 150);
    };

    useEffect(() => {
        if (!visible && !modalVisible) {
            cardTranslateY.value = offscreenTranslateY;
        }
    }, [offscreenTranslateY, visible, modalVisible]);

    useEffect(() => {
        if (visible) {
            // Cancel any pending close-safety timeout so it can't close a freshly-opened modal.
            if (closeTimeoutRef.current !== null) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
            }
            closeCompletedRef.current = true; // prevent any in-flight close callback from firing
            isClosingRef.current = false;
            setModalVisible(true);
            cardTranslateY.value = offscreenTranslateY;
            scrimOpacity.value = withTiming(1, { duration: FADE_DURATION });
            cardTranslateY.value = withTiming(0, { duration: SLIDE_DURATION });
            return;
        }

        // External close requests (parent toggled visible=false) still animate out,
        // but should not call onDismiss again.
        if (!isClosingRef.current) {
            startCloseAnimation(false);
        }
    }, [visible]);

    useEffect(() => {
        if (!isSettingsVariant || !modalVisible) {
            setKeyboardInset(0);
            return;
        }

        const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

        const showSub = Keyboard.addListener(showEvent, (event) => {
            const height = event.endCoordinates?.height ?? 0;
            setKeyboardInset(height);
        });

        const hideSub = Keyboard.addListener(hideEvent, () => {
            setKeyboardInset(0);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, [isSettingsVariant, modalVisible]);

    const scrimStyle = useAnimatedStyle(() => ({
        opacity: scrimOpacity.value,
    }));

    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: cardTranslateY.value }],
    }));

    const handleScrimPress = () => {
        if (isSettingsVariant && KeyboardController.isVisible()) {
            void KeyboardController.dismiss();
            return;
        }
        startCloseAnimation(true);
    };

    return (
        <Modal
            visible={modalVisible}
            animationType="none"
            presentationStyle="overFullScreen"
            transparent
            onRequestClose={() => startCloseAnimation(true)}
        >
            <View className="flex-1 justify-end">
                {/* Scrim — fades independently */}
                <Animated.View
                    className="absolute inset-0 bg-black/50"
                    style={scrimStyle}
                    pointerEvents="none"
                />

                {/* Tap scrim to dismiss */}
                <Pressable className="absolute inset-0" onPress={handleScrimPress} />

                {/* Card — slides independently */}
                <Animated.View
                    className={`rounded-t-3xl border-t border-border bg-card px-6 pt-6 ${
                        isSettingsVariant
                            ? "h-[92%]"
                            : bodyScrollable
                              ? "max-h-[90%]"
                              : "max-h-[90%] flex-1"
                    }`}
                    style={[cardStyle, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
                >
                    {title && (
                        <View className="mb-4 flex-row items-center justify-between">
                            <Text className="text-lg font-semibold text-foreground">{title}</Text>
                            <Pressable onPress={() => startCloseAnimation(true)} hitSlop={12}>
                                <Text className="text-lg text-muted-foreground">✕</Text>
                            </Pressable>
                        </View>
                    )}
                    {isSettingsVariant ? (
                        <ScrollView
                            className="flex-1"
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="interactive"
                            contentContainerStyle={{
                                paddingBottom: 8 + Math.max(0, keyboardInset - insets.bottom),
                            }}
                        >
                            {children}
                        </ScrollView>
                    ) : bodyScrollable ? (
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                            {children}
                        </ScrollView>
                    ) : (
                        <View className="min-h-0 flex-1">{children}</View>
                    )}
                </Animated.View>
            </View>
        </Modal>
    );
}