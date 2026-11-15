import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useHavenCore, useStore } from "@mobile-data";
import { HavenListSheet } from "@/components/HavenListSheet";
import { ChannelsSection } from "./ChannelsSection";
import { InvitesSection } from "./InvitesSection";
import { MembersSection } from "./MembersSection";
import { OverviewSection } from "./OverviewSection";
import { RolesSection } from "./RolesSection";

export type SettingsTab =
  | "overview"
  | "channels"
  | "roles"
  | "members"
  | "invites";

const LABELS: Record<SettingsTab, string> = {
  overview: "Overview",
  channels: "Channels",
  roles: "Roles",
  members: "Members",
  invites: "Invites",
};

/**
 * The tabs the person may use, from what the database says they may do here
 * (`get_my_permissions`). The overview is for everyone: it is where a
 * member leaves.
 */
function useVisibleTabs(communityId: string): SettingsTab[] {
  const core = useHavenCore();
  return useStore("communities", () => {
    const can = (p: Parameters<typeof core.communities.can>[1]) =>
      core.communities.can(communityId, p);
    const tabs: SettingsTab[] = ["overview"];
    if (can("manage_channels")) tabs.push("channels");
    if (can("manage_roles")) tabs.push("roles");
    if (can("manage_members") || can("manage_bans")) tabs.push("members");
    if (can("manage_invites")) tabs.push("invites");
    return tabs;
  });
}

export function CommunityManagementSheet({
  visible,
  communityId,
  onDismiss,
}: {
  visible: boolean;
  communityId: string;
  onDismiss: () => void;
}) {
  const tabs = useVisibleTabs(communityId);
  const [tab, setTab] = useState<SettingsTab>("overview");
  const name = useStore(
    "communities",
    (s) => s.byId[communityId]?.name ?? "Community",
  );

  useEffect(() => {
    if (visible) setTab("overview");
  }, [visible]);
  // A tab whose permission went away goes back to the overview.
  useEffect(() => {
    if (!tabs.includes(tab)) setTab("overview");
  }, [tab, tabs]);

  return (
    <HavenListSheet
      visible={visible}
      onDismiss={onDismiss}
      title={name}
      bodyScrollable={false}
    >
      {tabs.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-4 max-h-10 grow-0"
          contentContainerStyle={{ gap: 8 }}
        >
          {tabs.map((t) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              className={`rounded-full px-4 py-2 ${tab === t ? "bg-primary" : "bg-surface-panel"}`}
            >
              <Text
                className={`text-sm font-semibold ${
                  tab === t
                    ? "text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {LABELS[t]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View className="min-h-0 flex-1">
        {tab === "overview" ? (
          <OverviewSection communityId={communityId} onDone={onDismiss} />
        ) : tab === "channels" ? (
          <ChannelsSection communityId={communityId} />
        ) : tab === "roles" ? (
          <RolesSection communityId={communityId} />
        ) : tab === "members" ? (
          <MembersSection communityId={communityId} />
        ) : (
          <InvitesSection communityId={communityId} />
        )}
      </View>
    </HavenListSheet>
  );
}
