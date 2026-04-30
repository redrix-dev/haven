import { Ionicons } from "@expo/vector-icons";
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import type { MessageAttachment, MessageLinkPreview } from "@shared/lib/backend/types";
import { getFallbackEmbedUrl } from "@shared/features/messaging/components/message-list/messageListContentUtils";
import { CommunityAttachmentVideo } from "./CommunityAttachmentVideo";

// ─── Layout constants ────────────────────────────────────────────────────────

export const AVATAR_SIZE = 40;
export const AVATAR_LEFT_INSET = 16;
export const AVATAR_GUTTER = 16;
export const CONTENT_RIGHT_PADDING = 24;
export const CONTENT_LANE_LEFT = AVATAR_LEFT_INSET + AVATAR_SIZE + AVATAR_GUTTER;
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChatMessage = {
  id: string;
  text: string;
  createdAt?: string;
  authorUserId?: string | null;
  authorName?: string;
  authorInitial?: string;
  authorAvatarUrl?: string | null;
  isAuthorStaff?: boolean;
  timestampLabel?: string;
  replyTargetLabel?: string | null;
  attachments?: MessageAttachment[];
};

export type ChatListItem =
  | { kind: "message"; message: ChatMessage; isCondensed: boolean }
  | { kind: "divider"; id: string; label: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatDateDividerLabel(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function dayBucket(timestamp: string | undefined): string | null {
  if (!timestamp) return null;
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return null;
  return `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;
}

export function formatTime(timestamp: string): string {
  const value = new Date(timestamp);
  return value.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Message bubble ──────────────────────────────────────────────────────────

type CommunityMessageBubbleProps = ChatMessage & {
  isCondensed?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  linkPreview?: MessageLinkPreview | null;
};

export function CommunityMessageBubble({
  id,
  text,
  authorName,
  authorInitial,
  authorAvatarUrl,
  isAuthorStaff,
  timestampLabel,
  replyTargetLabel,
  attachments,
  isCondensed,
  onPress,
  onLongPress,
  linkPreview,
}: CommunityMessageBubbleProps) {
  const embedUrl = linkPreview ? getFallbackEmbedUrl(linkPreview) : null;
  const sourceUrl = linkPreview?.sourceUrl ?? linkPreview?.snapshot?.sourceUrl ?? "";
  const title = linkPreview?.snapshot?.title ?? sourceUrl;
  const siteName = linkPreview?.snapshot?.siteName ?? "Link preview";
  const thumbnailUrl = linkPreview?.snapshot?.thumbnail?.signedUrl ?? null;
  const showHeader = !isCondensed;

  return (
    <Pressable
      style={[
        styles.messageRow,
        isCondensed ? styles.messageRowCondensed : styles.messageRowGroupStart,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {showHeader ? (
        <View style={styles.avatarShell}>
          {authorAvatarUrl ? (
            <Image
              source={{ uri: authorAvatarUrl }}
              style={styles.avatarImage}
              resizeMode="cover"
              accessibilityLabel={`${authorName ?? "User"} avatar`}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{authorInitial ?? "U"}</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.compactSpacer} />
      )}

      <View style={styles.messageBody}>
        {showHeader ? (
          <View style={styles.metaRow}>
            <View style={styles.metaNameRow}>
              <Text style={styles.authorName} numberOfLines={1}>
                {authorName ?? "Unknown User"}
              </Text>
              {isAuthorStaff ? (
                <View style={styles.staffBadge}>
                  <Text style={styles.staffBadgeText}>Staff</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.timestamp}>{timestampLabel ?? ""}</Text>
          </View>
        ) : null}

        {replyTargetLabel ? (
          <Text style={styles.replyLabel}>Replying to {replyTargetLabel}</Text>
        ) : null}

        <EnrichedMarkdownText
          markdown={text}
          flavor="github"
          md4cFlags={{ underline: true }}
          markdownStyle={{
            paragraph: { color: "#e6edf7", fontSize: 14, lineHeight: 20 },
            h1: { fontSize: 22, fontWeight: "700", color: "#e6edf7", marginTop: 4, marginBottom: 4, lineHeight: 28 },
            h2: { fontSize: 18, fontWeight: "700", color: "#e6edf7", marginTop: 4, marginBottom: 4, lineHeight: 24 },
            h3: { fontSize: 16, fontWeight: "600", color: "#e6edf7", marginTop: 4, marginBottom: 2, lineHeight: 22 },
            strong: { color: "#e6edf7" },
            em: { color: "#e6edf7" },
            code: {
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              fontSize: 13,
              backgroundColor: "#1a2235",
              color: "#e6edf7",
              borderColor: "#1a2235",
            },
            codeBlock: {
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              fontSize: 13,
              backgroundColor: "#1a2235",
              color: "#e6edf7",
              padding: 10,
              borderRadius: 6,
              marginTop: 4,
              marginBottom: 4,
            },
            blockquote: {
              backgroundColor: "#1a2235",
              borderColor: "#3F79D8",
              borderWidth: 3,
              gapWidth: 10,
              marginTop: 2,
              marginBottom: 2,
            },
            strikethrough: { color: "#e6edf7" },
            list: { marginTop: 2, marginBottom: 2 },
            link: { color: "#3F79D8", underline: true },
          }}
          onLinkPress={({ url }) => {
            void Linking.openURL(url);
          }}
        />

        {attachments?.map((attachment) => {
          if (!attachment.signedUrl) {
            return (
              <Text key={attachment.id} style={styles.attachmentUnavailable}>
                Attachment unavailable.
              </Text>
            );
          }
          if (attachment.mediaKind === "image") {
            return (
              <Image
                key={attachment.id}
                source={{ uri: attachment.signedUrl }}
                style={styles.attachmentImage}
                resizeMode="cover"
              />
            );
          }
          if (attachment.mediaKind === "video") {
            return (
              <CommunityAttachmentVideo
                key={attachment.id}
                uri={attachment.signedUrl}
                style={styles.attachmentVideo}
              />
            );
          }
          return (
            <Pressable
              key={attachment.id}
              onPress={() => {
                if (attachment.signedUrl) void Linking.openURL(attachment.signedUrl);
              }}
              style={styles.attachmentFileRow}
            >
              <Text style={styles.attachmentFileLabel}>
                {attachment.originalFilename ?? "Open attachment"}
              </Text>
            </Pressable>
          );
        })}

        {linkPreview ? (
          <Pressable
            key={`${id}-preview`}
            onPress={() => {
              if (sourceUrl) void Linking.openURL(sourceUrl);
            }}
            style={styles.linkPreviewCard}
          >
            <Text style={styles.linkPreviewSite}>{siteName}</Text>
            <Text style={styles.linkPreviewTitle}>{title}</Text>
            {thumbnailUrl ? (
              <Image
                source={{ uri: thumbnailUrl }}
                style={styles.linkPreviewImage}
                resizeMode="cover"
              />
            ) : null}
            {embedUrl ? (
              <Text style={styles.linkPreviewHint}>Video preview available — tap to open.</Text>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Date divider ─────────────────────────────────────────────────────────────

export function MessageDateDivider({ label }: { label: string }) {
  return (
    <View accessibilityRole="none" style={styles.dateDivider}>
      <View style={styles.dateDividerLine} />
      <Text style={styles.dateDividerText}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  messageRow: {
    paddingLeft: CONTENT_LANE_LEFT,
    paddingRight: CONTENT_RIGHT_PADDING,
    position: "relative",
  },
  messageRowGroupStart: {
    paddingTop: 16,
    paddingBottom: 2,
    minHeight: 44,
  },
  messageRowCondensed: {
    paddingTop: 2,
    paddingBottom: 2,
  },
  avatarShell: {
    position: "absolute",
    left: AVATAR_LEFT_INSET,
    top: 18,
    height: AVATAR_SIZE,
    width: AVATAR_SIZE,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#111827",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "#E5E7EB",
    fontSize: 11,
    fontWeight: "600",
  },
  compactSpacer: {
    position: "absolute",
    left: AVATAR_LEFT_INSET,
    top: 5,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  messageBody: {
    alignSelf: "stretch",
  },
  metaRow: {
    marginBottom: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  metaNameRow: {
    marginRight: 4,
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  authorName: {
    flexShrink: 1,
    color: "#F2F3F5",
    fontSize: 16,
    fontWeight: "500",
  },
  staffBadge: {
    borderRadius: 4,
    backgroundColor: "rgba(69, 121, 205, 0.18)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  staffBadgeText: {
    color: "#3f79d8",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  timestamp: {
    flexShrink: 0,
    marginLeft: 4,
    color: "#A5A9B0",
    fontSize: 12,
    fontWeight: "500",
  },
  replyLabel: {
    marginBottom: 2,
    color: "#9ba9bf",
    fontSize: 12,
  },
  dateDivider: {
    position: "relative",
    marginTop: 24,
    marginBottom: 8,
    marginLeft: AVATAR_LEFT_INSET,
    marginRight: 14,
    alignItems: "center",
    justifyContent: "center",
    height: 24,
  },
  dateDividerLine: {
    ...StyleSheet.absoluteFillObject,
    top: 12,
    bottom: undefined,
    borderTopWidth: 1,
    borderTopColor: "rgba(176, 184, 199, 0.44)",
  },
  dateDividerText: {
    paddingHorizontal: 10,
    backgroundColor: "#0F1728",
    color: "#e6edf7",
    fontSize: 12,
    fontWeight: "600",
  },
  attachmentUnavailable: {
    marginTop: 8,
    color: "#9ba9bf",
    fontSize: 12,
  },
  attachmentImage: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginTop: 8,
  },
  attachmentVideo: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginTop: 8,
  },
  attachmentFileRow: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: "#1a2235",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  attachmentFileLabel: {
    color: "#3F79D8",
    fontSize: 14,
    fontWeight: "500",
  },
  linkPreviewCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2b3648",
    backgroundColor: "#22355D",
    padding: 12,
  },
  linkPreviewSite: {
    fontSize: 12,
    color: "#9ba9bf",
  },
  linkPreviewTitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    color: "#e6edf7",
  },
  linkPreviewImage: {
    width: "100%",
    height: 150,
    borderRadius: 10,
    marginTop: 8,
  },
  linkPreviewHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#3E78D5",
  },
});