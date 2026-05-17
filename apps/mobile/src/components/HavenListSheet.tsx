import { ScrollView, View } from "react-native";
import { HavenModalShell } from "@/components/HavenModalShell";

export type HavenListSheetProps = {
    visible: boolean;
    onDismiss: () => void;
    title?: string;
    /** When false, body is a plain flex container (use for nested FlatList). */
    bodyScrollable?: boolean;
    children: React.ReactNode;
};

/**
 * Bottom sheet for list-heavy panels (notifications, DMs, friends).
 * Shorter max height; optional non-scrolling flex body for nested lists.
 */
export function HavenListSheet({
    visible,
    onDismiss,
    title,
    bodyScrollable = true,
    children,
}: HavenListSheetProps) {
    const cardClassName = bodyScrollable ? "max-h-[90%]" : "max-h-[90%] flex-1";

    return (
        <HavenModalShell
            visible={visible}
            onDismiss={onDismiss}
            title={title}
            cardClassName={cardClassName}
        >
            {bodyScrollable ? (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                    {children}
                </ScrollView>
            ) : (
                <View className="min-h-0 flex-1">{children}</View>
            )}
        </HavenModalShell>
    );
}
