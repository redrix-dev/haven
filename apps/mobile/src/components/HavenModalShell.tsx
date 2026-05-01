import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
} from "react-native-reanimated";
import { useEffect, useState } from "react";

interface HavenModalShellProps {
    variant: "settings" | "inbox";
    visible: boolean;
    onDismiss: () => void;
    title?: string;
    children: React.ReactNode;
}

const SLIDE_DURATION = 320;
const FADE_DURATION = 220;

export function HavenModalShell({ variant, visible, onDismiss, title, children }: HavenModalShellProps) {
    const insets = useSafeAreaInsets();

    // Keep modal mounted during exit animation
    const [modalVisible, setModalVisible] = useState(visible);

    const scrimOpacity = useSharedValue(0);
    const cardTranslateY = useSharedValue(600);

    useEffect(() => {
        if (visible) {
            setModalVisible(true);
            scrimOpacity.value = withTiming(1, { duration: FADE_DURATION });
            cardTranslateY.value = withTiming(0, { duration: SLIDE_DURATION });
        } else {
            scrimOpacity.value = withTiming(0, { duration: FADE_DURATION });
            cardTranslateY.value = withTiming(600, { duration: SLIDE_DURATION }, (finished) => {
                if (finished) runOnJS(setModalVisible)(false);
            });
        }
    }, [visible]);

    const scrimStyle = useAnimatedStyle(() => ({
        opacity: scrimOpacity.value,
    }));

    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: cardTranslateY.value }],
    }));

    return (
        <Modal
            visible={modalVisible}
            animationType="none"
            presentationStyle="overFullScreen"
            transparent
            onRequestClose={onDismiss}
        >
            <View className="flex-1 justify-end">
                {/* Scrim — fades independently */}
                <Animated.View
                    className="absolute inset-0 bg-black/50"
                    style={scrimStyle}
                    pointerEvents="none"
                />

                {/* Tap scrim to dismiss */}
                <Pressable className="absolute inset-0" onPress={onDismiss} />

                {/* Card — slides independently */}
                <Animated.View
                    className="max-h-[90%] rounded-t-3xl border-t border-border bg-card px-6 pt-6"
                    style={[cardStyle, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
                >
                    {title && (
                        <View className="mb-4 flex-row items-center justify-between">
                            <Text className="text-lg font-semibold text-foreground">{title}</Text>
                            <Pressable onPress={onDismiss} hitSlop={12}>
                                <Text className="text-lg text-muted-foreground">✕</Text>
                            </Pressable>
                        </View>
                    )}
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                        {children}
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
}