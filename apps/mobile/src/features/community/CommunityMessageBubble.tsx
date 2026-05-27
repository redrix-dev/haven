import {
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import type { MessageAttachment, MessageLinkPreview } from "@shared/lib/backend/types";
import { getFallbackEmbedUrl } from "@shared/features/messaging/utils/embedUtils";
import { useCommunityMessageColors } from "@/theme-rn";
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
  linkPreview?: MessageLinkPreview | null;
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
  onPressAuthor?: () => void;
  onLongPress?: () => void;
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
  onPressAuthor,
  onLongPress,
  linkPreview,
}: CommunityMessageBubbleProps) {
  const c = useCommunityMessageColors();
  const embedUrl = linkPreview ? getFallbackEmbedUrl(linkPreview) : null;
  const sourceUrl = linkPreview?.sourceUrl ?? linkPreview?.snapshot?.sourceUrl ?? "";
  const title = linkPreview?.snapshot?.title ?? sourceUrl;
  const siteName = linkPreview?.snapshot?.siteName ?? "Link preview";
  const thumbnailUrl = linkPreview?.snapshot?.thumbnail?.signedUrl ?? null;
  const showHeader = !isCondensed;
  const handleAuthorPress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onPressAuthor?.();
  };

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
        <Pressable
          style={[styles.avatarShell, { backgroundColor: c.avatarBg }]}
          onPress={onPressAuthor ? handleAuthorPress : undefined}
          disabled={!onPressAuthor}
          accessibilityRole={onPressAuthor ? "button" : undefined}
          accessibilityLabel={
            onPressAuthor ? `Open ${authorName ?? "user"} profile` : undefined
          }
        >
          {authorAvatarUrl ? (
            <Image
              source={{ uri: authorAvatarUrl }}
              style={styles.avatarImage}
              resizeMode="cover"
              accessibilityLabel={`${authorName ?? "User"} avatar`}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={[styles.avatarFallbackText, { color: c.avatarFallbackText }]}>{authorInitial ?? "U"}</Text>
            </View>
          )}
        </Pressable>
      ) : (
        <View style={styles.compactSpacer} />
      )}

      <View style={styles.messageBody}>
        {showHeader ? (
          <View style={styles.metaRow}>
            <View style={styles.metaNameRow}>
              <Pressable
                style={styles.authorNameButton}
                onPress={onPressAuthor ? handleAuthorPress : undefined}
                disabled={!onPressAuthor}
                accessibilityRole={onPressAuthor ? "button" : undefined}
                accessibilityLabel={
                  onPressAuthor ? `Open ${authorName ?? "user"} profile` : undefined
                }
              >
                <Text style={[styles.authorName, { color: c.authorName }]} numberOfLines={1}>
                  {authorName ?? "Unknown User"}
                </Text>
              </Pressable>
              {isAuthorStaff ? (
                <View style={[styles.staffBadge, { backgroundColor: c.staffBadgeBg }]}>
                  <Text style={[styles.staffBadgeText, { color: c.staffBadgeText }]}>Staff</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.timestamp, { color: c.timestamp }]}>{timestampLabel ?? ""}</Text>
          </View>
        ) : null}

        {replyTargetLabel ? (
          <Text style={[styles.replyLabel, { color: c.replyLabel }]}>Replying to {replyTargetLabel}</Text>
        ) : null}

        <EnrichedMarkdownText
          markdown={text}
          flavor="github"
          md4cFlags={{ underline: true }}
          markdownStyle={{
            paragraph: { color: c.text, fontSize: 14, lineHeight: 20 },
            h1: { fontSize: 22, fontWeight: "700", color: c.text, marginTop: 4, marginBottom: 4, lineHeight: 28 },
            h2: { fontSize: 18, fontWeight: "700", color: c.text, marginTop: 4, marginBottom: 4, lineHeight: 24 },
            h3: { fontSize: 16, fontWeight: "600", color: c.text, marginTop: 4, marginBottom: 2, lineHeight: 22 },
            strong: { color: c.text },
            em: { color: c.text },
            code: {
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              fontSize: 13,
              backgroundColor: c.codeBg,
              color: c.text,
              borderColor: c.codeBg,
            },
            codeBlock: {
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              fontSize: 13,
              backgroundColor: c.codeBg,
              color: c.text,
              padding: 10,
              borderRadius: 6,
              marginTop: 4,
              marginBottom: 4,
            },
            blockquote: {
              backgroundColor: c.codeBg,
              borderColor: c.blockquoteAccent,
              borderWidth: 3,
              gapWidth: 10,
              marginTop: 2,
              marginBottom: 2,
            },
            strikethrough: { color: c.text },
            list: { marginTop: 2, marginBottom: 2 },
            link: { color: c.link, underline: true },
          }}
          onLinkPress={({ url }) => {
            void Linking.openURL(url);
          }}
        />

        {attachments?.map((attachment) => {
          if (!attachment.signedUrl) {
            return (
              <Text key={attachment.id} style={[styles.attachmentUnavailable, { color: c.attachmentMuted }]}>
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
              style={[styles.attachmentFileRow, { backgroundColor: c.attachmentFileBg }]}
            >
              <Text style={[styles.attachmentFileLabel, { color: c.attachmentFileLabel }]}>
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
            style={[styles.linkPreviewCard, { borderColor: c.linkPreviewBorder, backgroundColor: c.linkPreviewBg }]}
          >
            <Text style={[styles.linkPreviewSite, { color: c.linkPreviewSite }]}>{siteName}</Text>
            <Text style={[styles.linkPreviewTitle, { color: c.linkPreviewTitle }]}>{title}</Text>
            {thumbnailUrl ? (
              <Image
                source={{ uri: thumbnailUrl }}
                style={styles.linkPreviewImage}
                resizeMode="cover"
              />
            ) : null}
            {embedUrl ? (
              <Text style={[styles.linkPreviewHint, { color: c.linkPreviewHint }]}>Video preview available — tap to open.</Text>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Date divider ─────────────────────────────────────────────────────────────

export function MessageDateDivider({ label }: { label: string }) {
  const c = useCommunityMessageColors();
  return (
    <View accessibilityRole="none" style={styles.dateDivider}>
      <View style={[styles.dateDividerLine, { borderTopColor: c.dateDividerLine }]} />
      <Text style={[styles.dateDividerText, { backgroundColor: c.dateDividerBg, color: c.text }]}>{label}</Text>
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
    fontSize: 16,
    fontWeight: "500",
  },
  authorNameButton: {
    flexShrink: 1,
  },
  staffBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  staffBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  timestamp: {
    flexShrink: 0,
    marginLeft: 4,
    fontSize: 12,
    fontWeight: "500",
  },
  replyLabel: {
    marginBottom: 2,
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
  },
  dateDividerText: {
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: "600",
  },
  attachmentUnavailable: {
    marginTop: 8,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  attachmentFileLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  linkPreviewCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  linkPreviewSite: {
    fontSize: 12,
  },
  linkPreviewTitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
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
  },
});
