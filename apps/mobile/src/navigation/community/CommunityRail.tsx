import type { ServerSummary } from "@shared/lib/backend/types";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ThemedIonicons } from "@/theme-rn";

type CommunityRailProps = {
  communities: ServerSummary[];
  activeCommunityId: string | null;
  onSelectCommunity: (communityId: string) => void;
  onOpenProfile: () => void;
  onCreateCommunity: () => void;
  onJoinCommunity: () => void;
};

function getCommunityInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function CommunityRail({
  communities,
  activeCommunityId,
  onSelectCommunity,
  onOpenProfile,
  onCreateCommunity,
  onJoinCommunity,
}: CommunityRailProps) {
  return (
    <View className="w-18 border-r border-border-panel bg-surface-modal">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingVertical: 12,
          alignItems: "center",
          gap: 10,
        }}
        showsVerticalScrollIndicator={false}
      >
        {communities.map((community) => {
          const active = community.id === activeCommunityId;

          return (
            <Pressable
              key={community.id}
              onPress={() => onSelectCommunity(community.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${community.name}`}
              className={[
                "h-12 w-12 items-center justify-center rounded-2xl",
                active
                  ? "bg-primary"
                  : "bg-surface-panel active:bg-surface-hover",
              ].join(" ")}
            >
              <Text
                className={[
                  "text-base font-bold",
                  active ? "text-primary-foreground" : "text-foreground",
                ].join(" ")}
              >
                {getCommunityInitial(community.name)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="items-center gap-3 border-t border-border-panel py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          onPress={onOpenProfile}
          className="h-11 w-11 items-center justify-center rounded-2xl bg-surface-panel active:bg-surface-hover"
        >
          <ThemedIonicons
            name="person-circle-outline"
            size={25}
            colorClassName="accent-foreground"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create community"
          onPress={onCreateCommunity}
          className="h-11 w-11 items-center justify-center rounded-2xl bg-surface-panel active:bg-surface-hover"
        >
          <ThemedIonicons name="add" size={24} colorClassName="accent-foreground" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Join community"
          onPress={onJoinCommunity}
          className="h-11 w-11 items-center justify-center rounded-2xl bg-surface-panel active:bg-surface-hover"
        >
          <ThemedIonicons
            name="enter-outline"
            size={22}
            colorClassName="accent-foreground"
          />
        </Pressable>
      </View>
    </View>
  );
}
