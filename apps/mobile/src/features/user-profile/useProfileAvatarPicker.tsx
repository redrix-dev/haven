import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";

export type PickedAvatarAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
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
    if (isPicking) return;
    setIsPicking(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Allow Photos access to choose a profile picture.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const picked: PickedAvatarAsset = {
        uri: asset.uri,
        fileName: asset.fileName ?? `avatar-${Date.now()}.jpg`,
        mimeType: resolveMimeType(asset),
      };

      await onPicked?.(picked);
    } finally {
      setIsPicking(false);
    }
  }, [isPicking, onPicked]);

  return {
    isPicking,
    pickAvatar,
  };
}