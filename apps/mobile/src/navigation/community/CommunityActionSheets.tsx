import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { HavenFormSheet } from "@/components/HavenFormSheet";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { getPlatformInviteInputPlaceholder } from "@shared/infrastructure/platform/urls";
import { normalizeInviteCode } from "@shared/features/community/utils/inviteCode";
import { resolveColorProp } from "@shared/themes";
import { useHavenCore } from "@shared/core";
import { setLastCommunitySurface } from "@/storage/communitySurfacePrefs";

type CommunityActionSheetsProps = {
  createOpen: boolean;
  joinOpen: boolean;
  userId: string | null;
  onCloseCreate: () => void;
  onCloseJoin: () => void;
  onCommunityReady: (communityId: string) => void;
};

export function CommunityActionSheets({
  createOpen,
  joinOpen,
  userId,
  onCloseCreate,
  onCloseJoin,
  onCommunityReady,
}: CommunityActionSheetsProps) {
  const core = useHavenCore();
  const themeTokens = useMobileThemeTokens();
  const placeholderMuted = useMemo(
    () => resolveColorProp(themeTokens, "text-dim") ?? "#8e8e93",
    [themeTokens],
  );

  const [createName, setCreateName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinInvite, setJoinInvite] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const closeCreate = useCallback(() => {
    onCloseCreate();
    setCreateError(null);
  }, [onCloseCreate]);

  const closeJoin = useCallback(() => {
    onCloseJoin();
    setJoinError(null);
  }, [onCloseJoin]);

  const handleCreateCommunity = useCallback(async () => {
    const name = createName.trim();
    if (!name || !userId) return;

    setCreateLoading(true);
    setCreateError(null);
    try {
      const { id } = await core.createCommunity(userId, name);
      await core.prepareCommunityEntry(id);
      await setLastCommunitySurface("drawer");
      setCreateName("");
      closeCreate();
      onCommunityReady(id);
    } catch (error) {
      setCreateError(getErrorMessage(error, "Could not create community."));
    } finally {
      setCreateLoading(false);
    }
  }, [closeCreate, core, createName, onCommunityReady, userId]);

  const handleJoinCommunity = useCallback(async () => {
    const code = normalizeInviteCode(joinInvite);
    if (!code) {
      setJoinError("Enter an invite code or paste an invite link.");
      return;
    }

    setJoinLoading(true);
    setJoinError(null);
    try {
      const redeemed = await core.joinCommunityByInvite(code);
      const communityId = redeemed.communityId;
      await core.prepareCommunityEntry(communityId);
      await setLastCommunitySurface("drawer");
      setJoinInvite("");
      closeJoin();
      onCommunityReady(communityId);
    } catch (error) {
      setJoinError(getErrorMessage(error, "Failed to join from invite."));
    } finally {
      setJoinLoading(false);
    }
  }, [closeJoin, core, joinInvite, onCommunityReady]);

  return (
    <>
      <HavenFormSheet visible={createOpen} onDismiss={closeCreate} title="Create community">
        <View className="mt-2 gap-4">
          <Text className="text-sm text-muted-foreground">
            Give your community a name. You can change it later in settings.
          </Text>
          <View>
            <Text className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
              Community name
            </Text>
            <TextInput
              value={createName}
              onChangeText={setCreateName}
              placeholder="My community"
              placeholderTextColor={placeholderMuted}
              editable={!createLoading}
              className="rounded-xl border border-border bg-surface-panel px-3 py-3 text-base text-foreground"
              autoCapitalize="words"
            />
          </View>
          {createError ? <Text className="text-sm text-destructive">{createError}</Text> : null}
          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={closeCreate}
              disabled={createLoading}
              className="py-2 active:opacity-80"
            >
              <Text className="text-base text-muted-foreground">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleCreateCommunity()}
              disabled={createLoading || !createName.trim() || !userId}
              className={`rounded-xl bg-primary px-5 py-2.5 ${
                createLoading || !createName.trim() || !userId ? "opacity-45" : ""
              }`}
            >
              <Text className="text-center font-semibold text-primary-foreground">
                {createLoading ? "Creating..." : "Create"}
              </Text>
            </Pressable>
          </View>
        </View>
      </HavenFormSheet>

      <HavenFormSheet visible={joinOpen} onDismiss={closeJoin} title="Join community">
        <View className="mt-2 gap-4">
          <Text className="text-sm text-muted-foreground">
            Paste an invite code or invite link to join.
          </Text>
          <View>
            <Text className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
              Invite
            </Text>
            <TextInput
              value={joinInvite}
              onChangeText={setJoinInvite}
              placeholder={getPlatformInviteInputPlaceholder()}
              placeholderTextColor={placeholderMuted}
              editable={!joinLoading}
              autoCapitalize="characters"
              autoCorrect={false}
              className="rounded-xl border border-border bg-surface-panel px-3 py-3 text-base text-foreground"
            />
          </View>
          {joinError ? <Text className="text-sm text-destructive">{joinError}</Text> : null}
          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={closeJoin}
              disabled={joinLoading}
              className="py-2 active:opacity-80"
            >
              <Text className="text-base text-muted-foreground">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleJoinCommunity()}
              disabled={joinLoading || !joinInvite.trim()}
              className={`rounded-xl bg-primary px-5 py-2.5 ${
                joinLoading || !joinInvite.trim() ? "opacity-45" : ""
              }`}
            >
              <Text className="text-center font-semibold text-primary-foreground">
                {joinLoading ? "Joining..." : "Join"}
              </Text>
            </Pressable>
          </View>
        </View>
      </HavenFormSheet>
    </>
  );
}
