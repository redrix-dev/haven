import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageStyle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { SafeAreaView } from "react-native-safe-area-context";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";

export type MessageImageAttachmentItem = {
  id: string;
  signedUrl: string;
  originalFilename?: string | null;
};

type MessageImageAttachmentProps = {
  image: MessageImageAttachmentItem;
  images: MessageImageAttachmentItem[];
  thumbnailStyle: StyleProp<ImageStyle>;
};

function extensionForImage(image: MessageImageAttachmentItem): string {
  const candidate = image.originalFilename?.split(".").pop()?.trim();
  if (candidate && /^[a-z0-9]{2,5}$/i.test(candidate)) return candidate;
  return "jpg";
}

async function downloadImageToCache(image: MessageImageAttachmentItem): Promise<string> {
  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDirectory) throw new Error("File cache is not available.");
  const fileUri = `${baseDirectory}haven-image-${image.id}.${extensionForImage(image)}`;
  const result = await FileSystem.downloadAsync(image.signedUrl, fileUri);
  return result.uri;
}

export function MessageImageAttachment({
  image,
  images,
  thumbnailStyle,
}: MessageImageAttachmentProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const initialIndex = Math.max(0, images.findIndex((item) => item.id === image.id));

  return (
    <>
      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          setViewerOpen(true);
        }}
      >
        <Image source={{ uri: image.signedUrl }} style={thumbnailStyle} resizeMode="contain" />
      </Pressable>
      <ImageGalleryModal
        visible={viewerOpen}
        images={images}
        initialIndex={initialIndex}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}

function ImageGalleryModal({
  visible,
  images,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  images: MessageImageAttachmentItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [saving, setSaving] = useState(false);
  const listRef = useRef<FlatList<MessageImageAttachmentItem> | null>(null);
  const activeImage = images[activeIndex] ?? images[0] ?? null;

  const galleryImages = useMemo(
    () => images.filter((item) => Boolean(item.signedUrl)),
    [images],
  );

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
      setActiveIndex(Math.max(0, Math.min(galleryImages.length - 1, nextIndex)));
    },
    [galleryImages.length, width],
  );

  const shareActiveImage = useCallback(async () => {
    if (!activeImage || saving) return;
    setSaving(true);
    try {
      const localUri = await downloadImageToCache(activeImage);
      await Sharing.shareAsync(localUri);
    } catch (error) {
      Alert.alert("Share failed", getErrorMessage(error, "Could not share this image."));
    } finally {
      setSaving(false);
    }
  }, [activeImage, saving]);

  const saveActiveImage = useCallback(async () => {
    if (!activeImage || saving) return;
    setSaving(true);
    try {
      const localUri = await downloadImageToCache(activeImage);
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        await Sharing.shareAsync(localUri);
        return;
      }
      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert("Saved", "Image saved to your photo library.");
    } catch (error) {
      try {
        if (activeImage) {
          const localUri = await downloadImageToCache(activeImage);
          await Sharing.shareAsync(localUri);
        }
      } catch {
        Alert.alert("Save failed", getErrorMessage(error, "Could not save this image."));
      }
    } finally {
      setSaving(false);
    }
  }, [activeImage, saving]);

  if (galleryImages.length === 0) return null;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.viewer}>
        <View style={styles.viewerHeader}>
          <Text style={styles.viewerCounter}>
            {galleryImages.length > 1 ? `${activeIndex + 1} / ${galleryImages.length}` : ""}
          </Text>
          <Pressable accessibilityRole="button" hitSlop={12} onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>X</Text>
          </Pressable>
        </View>
        <FlatList
          ref={listRef}
          data={galleryImages}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumEnd}
          renderItem={({ item }) => (
            <View style={{ width, height: Math.max(320, height - 180) }}>
              <Image source={{ uri: item.signedUrl }} style={styles.viewerImage} resizeMode="contain" />
            </View>
          )}
          onScrollToIndexFailed={({ index }) => {
            requestAnimationFrame(() => {
              listRef.current?.scrollToIndex({ index, animated: false });
            });
          }}
        />
        <View style={styles.viewerActions}>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void saveActiveImage()}
            style={[styles.viewerActionButton, saving ? styles.disabledButton : null]}
          >
            {saving ? (
              // uniwind-theme-allow mobile-theme/no-raw-color-prop - fullscreen media action spinner is invariant white.
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.viewerActionText}>Save</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void shareActiveImage()}
            style={[styles.viewerActionButton, saving ? styles.disabledButton : null]}
          >
            <Text style={styles.viewerActionText}>Share</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    // uniwind-theme-allow mobile-theme/no-raw-style-color - fullscreen media viewer should remain black.
    backgroundColor: "#05070d",
  },
  viewerHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  viewerCounter: {
    // uniwind-theme-allow mobile-theme/no-raw-style-color - fullscreen media overlay text.
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
  },
  closeButton: {
    height: 38,
    width: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    // uniwind-theme-allow mobile-theme/no-raw-style-color - fullscreen media close control.
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  closeButtonText: {
    // uniwind-theme-allow mobile-theme/no-raw-style-color - fullscreen media close glyph.
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  viewerImage: {
    height: "100%",
    width: "100%",
  },
  viewerActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 12,
  },
  viewerActionButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    // uniwind-theme-allow mobile-theme/no-raw-style-color - fullscreen media action.
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  disabledButton: {
    opacity: 0.65,
  },
  viewerActionText: {
    // uniwind-theme-allow mobile-theme/no-raw-style-color - fullscreen media action text.
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
