import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Channel } from "@shared/lib/backend/types";
import { useHavenCore } from "@shared/core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CommunityManagementSheet } from "./CommunityManagementSheet";

type Props = {
  serverId: string;
  communityName: string;
  channels: Channel[];
};

export function CommunityManagementEntry({ serverId, communityName, channels }: Props) {
  const core = useHavenCore();
  const perms = core.permissions.usePermissions(serverId);
  const [popOpen, setPopOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"community" | "channels" | null>(null);

  const canManageAnything =
    perms.canManageServer ||
    perms.canManageRoles ||
    perms.canManageMembers ||
    perms.canManageBans ||
    perms.canManageInvites ||
    perms.canManageChannelStructure ||
    perms.canManageChannelPermissions;

  if (!canManageAnything) return null;

  return (
    <>
      <View className="border-t border-border-panel px-3 pb-2 pt-3">
        <Popover open={popOpen} onOpenChange={setPopOpen}>
          <PopoverTrigger asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Community management"
              className="flex-row items-center gap-2.5 rounded-xl px-3 py-2.5 active:bg-surface-hover"
            >
              <Ionicons name="settings-outline" size={16} color="#6b7a90" />
              <Text className="flex-1 text-sm font-medium text-muted-foreground">Management</Text>
              <Ionicons name="chevron-up" size={14} color="#6b7a90" />
            </Pressable>
          </PopoverTrigger>

          <PopoverContent side="top" align="start" className="w-52 p-1">
            <Pressable
              className="flex-row items-center gap-3 rounded-lg px-3 py-2.5 active:bg-surface-hover"
              onPress={() => {
                setPopOpen(false);
                setSheetTab("community");
              }}
            >
              <Ionicons name="business-outline" size={16} color="#a9b8cf" />
              <Text className="text-sm text-foreground">Community settings</Text>
            </Pressable>

            <Pressable
              className="flex-row items-center gap-3 rounded-lg px-3 py-2.5 active:bg-surface-hover"
              onPress={() => {
                setPopOpen(false);
                setSheetTab("channels");
              }}
            >
              <Ionicons name="list-outline" size={16} color="#a9b8cf" />
              <Text className="text-sm text-foreground">Channel settings</Text>
            </Pressable>
          </PopoverContent>
        </Popover>
      </View>

      <CommunityManagementSheet
        visible={sheetTab !== null}
        initialTab={sheetTab ?? "community"}
        serverId={serverId}
        communityName={communityName}
        channels={channels}
        perms={perms}
        onDismiss={() => setSheetTab(null)}
      />
    </>
  );
}
