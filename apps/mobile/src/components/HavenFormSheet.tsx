import { ScrollView, Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardController } from "react-native-keyboard-controller";
import { useEffect, useState } from "react";
import { HavenModalShell } from "@/components/HavenModalShell";

export type HavenFormSheetProps = {
    visible: boolean;
    onDismiss: () => void;
    title?: string;
    children: React.ReactNode;
};

/**
 * Tall bottom sheet for forms (settings, create/join flows).
 * Keyboard-aware scroll body; scrim tap dismisses the keyboard before closing.
 */
export function HavenFormSheet({ visible, onDismiss, title, children }: HavenFormSheetProps) {
    const insets = useSafeAreaInsets();
    const [keyboardInset, setKeyboardInset] = useState(0);

    useEffect(() => {
        if (!visible) {
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
    }, [visible]);

    return (
        <HavenModalShell
            visible={visible}
            onDismiss={onDismiss}
            title={title}
            cardClassName="h-[92%]"
            onScrimPress={(close) => {
                if (KeyboardController.isVisible()) {
                    void KeyboardController.dismiss();
                    return;
                }
                close(true);
            }}
        >
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
        </HavenModalShell>
    );
}
