import { useCallback, useState } from "react";
import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  avatarPickLog,
  avatarPickNextMicrotask,
  avatarPickSessionStart,
} from "@/features/user-profile/avatarPickInstrumentation";

export type PickedAvatarAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
  /** Present when picker is launched with `base64: true` (recommended for reliable uploads). */
  base64?: string | null;
};

type UseProfileAvatarPickerOptions = {
  onPicked?: (asset: PickedAvatarAsset) => void | Promise<void>;
};

function resolveMimeType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  return "image/jpeg";
}

export function useProfileAvatarPicker(options: UseProfileAvatarPickerOptions = {}) {
  const { onPicked } = options;
  const [isPicking, setIsPicking] = useState(false);

  const pickAvatar = useCallback(async (): Promise<void> => {
    const session = avatarPickSessionStart();
    if (isPicking) {
      avatarPickLog(session, "02_early_return_is_picking_true");
      return;
    }
    avatarPickLog(session, "03_passed_is_picking_guard");
    avatarPickNextMicrotask(session, "04_microtask_after_sync_guard");
    setIsPicking(true);
    avatarPickLog(session, "05_called_setIsPicking_true_scheduled");

    try {
      avatarPickLog(session, "06_await_requestMediaLibraryPermissionsAsync_start", {
        stack: new Error().stack?.split("\n").slice(0, 8).join("\n"),
      });
      const permStart = globalThis.performance?.now?.() ?? 0;
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      const permEnd = globalThis.performance?.now?.() ?? 0;
      avatarPickLog(session, "07_await_requestMediaLibraryPermissionsAsync_done", {
        durationMs: Number((permEnd - permStart).toFixed(3)),
        granted: permission.granted,
        status: permission.status,
        canAskAgain: permission.canAskAgain,
        iosAccessPrivileges:
          "accessPrivileges" in permission
            ? (permission as { accessPrivileges?: string }).accessPrivileges
            : undefined,
      });

      if (!permission.granted) {
        avatarPickLog(session, "08_permission_not_granted_showing_alert");
        Alert.alert(
          "Permission needed",
          "Allow Photos access to choose a profile picture.",
        );
        return;
      }

      const pickerOptions = {
        mediaTypes: ["images"] as ImagePicker.MediaType[],
        allowsEditing: true,
        aspect: [1, 1] as [number, number],
        quality: 0.9,
        // Embed bytes in the result so we never rely on fragile `fetch(uri)` / Blob streaming into Supabase.
        base64: true,
        ...(Platform.OS === "ios"
          ? {
                preferredAssetRepresentationMode:
                    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
            }
          : {}),
      };

      avatarPickLog(session, "09_await_launchImageLibraryAsync_start", {
        ...pickerOptions,
        note: "Native picker should begin presenting after this call is processed by the bridge; JS awaits until user finishes selection/cancel.",
        stack: new Error().stack?.split("\n").slice(0, 10).join("\n"),
      });
      const launchStart = globalThis.performance?.now?.() ?? 0;
      const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
      const launchEnd = globalThis.performance?.now?.() ?? 0;
      avatarPickLog(session, "10_await_launchImageLibraryAsync_resolved", {
        durationMsSinceLaunchCall: Number((launchEnd - launchStart).toFixed(3)),
        canceled: result.canceled,
        assetCount: result.assets?.length ?? 0,
        hint: "Large duration here includes user browsing library + crop UI — not just delay until picker appears.",
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const picked: PickedAvatarAsset = {
        uri: asset.uri,
        fileName: asset.fileName ?? `avatar-${Date.now()}.jpg`,
        mimeType: resolveMimeType(asset),
        base64: asset.base64 ?? null,
      };

      avatarPickLog(session, "11_before_onPicked_callback", {
        base64Len: picked.base64?.length ?? 0,
      });
      await onPicked?.(picked);
      avatarPickLog(session, "12_after_onPicked_callback_resolved");
    } finally {
      setIsPicking(false);
      avatarPickLog(session, "13_finally_setIsPicking_false_scheduled");
    }
  }, [isPicking, onPicked]);

  return {
    isPicking,
    pickAvatar,
  };
}