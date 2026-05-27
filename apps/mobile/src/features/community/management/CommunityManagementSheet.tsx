import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Channel, ServerPermissions } from "@shared/lib/backend/types";
import { HavenListSheet } from "@/components/HavenListSheet";
import { CommunitySettingsSection } from "./CommunitySettingsSection";
import { ChannelSettingsSection } from "./ChannelSettingsSection";

type Tab = "community" | "channels";

type Props = {
  visible: boolean;
  initialTab: Tab;
  serverId: string;
  communityName: string;
  channels: Channel[];
  perms: ServerPermissions;
  onDismiss: () => void;
};

export function CommunityManagementSheet({
  visible,
  initialTab,
  serverId,
  communityName,
  channels,
  perms,
  onDismiss,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  // Sync tab when sheet is re-opened with a different initial tab
  useEffect(() => {
    if (visible) setTab(initialTab);
  }, [visible, initialTab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "community", label: "Community" },
    { key: "channels", label: "Channels" },
  ];

  return (
    <HavenListSheet visible={visible} onDismiss={onDismiss} bodyScrollable={false}>
      {/* Top-level tab pills */}
      <View className="mb-4 flex-row gap-2">
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            className={`flex-1 rounded-xl py-2 ${tab === t.key ? "bg-primary" : "bg-surface-panel"}`}
          >
            <Text
              className={`text-center text-sm font-semibold ${
                tab === t.key ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Section content */}
      <View className="min-h-0 flex-1">
        {tab === "community" ? (
          <CommunitySettingsSection
            serverId={serverId}
            communityName={communityName}
            perms={perms}
          />
        ) : (
          <ChannelSettingsSection
            serverId={serverId}
            channels={channels}
            perms={perms}
          />
        )}
      </View>
    </HavenListSheet>
  );
}
