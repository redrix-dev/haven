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
import { COMMUNITY_MARKDOWN_MD4C_FLAGS } from "@shared/features/messaging/utils/communityMarkdownParity";
import type { MessageRowItem } from "@shared/features/messaging/messageViewModel";
import { createChatMarkdownStyle } from "@/components/chat/chatTypography";
import { useCommunityMessageColors } from "@/theme-rn";
import { MessageImageAttachment } from "@/features/media/MessageImageAttachment";
import { CommunityAttachmentVideo } from "./CommunityAttachmentVideo";

// ─── Layout constants ────────────────────────────────────────────────────────

export const AVATAR_SIZE = 40;
export const AVATAR_LEFT_INSET = 16;
export const AVATAR_GUTTER = 16;
export const CONTENT_RIGHT_PADDING = 24;
export const CONTENT_LANE_LEFT =
  AVATAR_LEFT_INSET + AVATAR_SIZE + AVATAR_GUTTER;
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

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

type CommunityMessageBubbleProps = {
  item: MessageRowItem;
  onPress?: () => void;
  onPressAuthor?: () => void;
  onLongPress?: () => void;
  onToggleReaction?: (emoji: string, on: boolean) => void;
  /** For a message the database refused: send it again, or drop it. */
  onRetry?: () => void;
  onDiscard?: () => void;
};

/**
 * One message, from the shared row (`buildMessageViewItems`), which has
 * already worked out the author's name, colour and picture, the files' links
 * and whether it starts a group.
 */
export function CommunityMessageBubble({
  item,
  onPress,
  onPressAuthor,
  onLongPress,
  onToggleReaction,
  onRetry,
  onDiscard,
}: CommunityMessageBubbleProps) {
  const c = useCommunityMessageColors();
  const markdownStyle = createChatMarkdownStyle({
    textColor: c.text,
    codeBackgroundColor: c.codeBg,
    blockquoteBorderColor: c.blockquoteAccent,
    linkColor: c.link,
  });
  const {
    id,
    body: text,
    authorName,
    avatarUrl: authorAvatarUrl,
    authorIsStaff: isAuthorStaff,
    edited: isEdited,
    attachments,
    linkPreview,
    reactions,
    outgoing,
  } = item;
  const authorInitial = authorName.trim().charAt(0).toUpperCase() || "?";
  const timestampLabel = outgoing ? "" : formatTime(item.createdAt);
  const replyTargetLabel = item.replyContext?.name ?? null;
  const isCondensed = !item.showHeader;
  const sourceUrl = linkPreview?.url ?? "";
  const title = linkPreview?.title ?? sourceUrl;
  const siteName = linkPreview?.site_name ?? "Link preview";
  const thumbnailUrl = linkPreview?.imageUrl ?? null;
  const embedUrl = linkPreview?.embed_provider ? sourceUrl : null;
  const showHeader = !isCondensed;
  const images = attachments.filter(
    (a) => a.mimeType.startsWith("image/") && a.url,
  );
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
              <Text
                style={[
                  styles.avatarFallbackText,
                  { color: c.avatarFallbackText },
                ]}
              >
                {authorInitial ?? "U"}
              </Text>
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
                  onPressAuthor
                    ? `Open ${authorName ?? "user"} profile`
                    : undefined
                }
              >
                <Text
                  style={[
                    styles.authorName,
                    { color: item.authorColor ?? c.authorName },
                  ]}
                  numberOfLines={1}
                >
                  {authorName}
                </Text>
              </Pressable>
              {isAuthorStaff ? (
                <View
                  style={[
                    styles.staffBadge,
                    { backgroundColor: c.staffBadgeBg },
                  ]}
                >
                  <Text
                    style={[styles.staffBadgeText, { color: c.staffBadgeText }]}
                  >
                    Staff
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.timestamp, { color: c.timestamp }]}>
              {timestampLabel ?? ""}
            </Text>
          </View>
        ) : null}

        {replyTargetLabel ? (
          <Text style={[styles.replyLabel, { color: c.replyLabel }]}>
            Replying to {replyTargetLabel}
          </Text>
        ) : null}

        {item.hidden ? (
          <Text style={[styles.replyLabel, { color: c.replyLabel }]}>
            Hidden: the author is banned. Only moderators see this.
          </Text>
        ) : null}

        {/* Not selectable: on iOS a long-press would open the text-selection
            menu on top of the message actions sheet. Copy lives in the sheet. */}
        <EnrichedMarkdownText
          selectable={false}
          markdown={text}
          flavor="github"
          md4cFlags={COMMUNITY_MARKDOWN_MD4C_FLAGS}
          markdownStyle={{
            ...markdownStyle,
            code: {
              ...markdownStyle.code,
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
            },
            codeBlock: {
              ...markdownStyle.codeBlock,
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
            },
          }}
          onLinkPress={({ url }) => {
            void Linking.openURL(url);
          }}
        />
        {isEdited ? (
          <Text style={[styles.editedLabel, { color: c.timestamp }]}>
            (edited)
          </Text>
        ) : null}

        {attachments.map((attachment) => {
          if (!attachment.url) {
            return (
              <Text
                key={attachment.id}
                style={[
                  styles.attachmentUnavailable,
                  { color: c.attachmentMuted },
                ]}
              >
                Loading attachment…
              </Text>
            );
          }
          if (attachment.mimeType.startsWith("image/")) {
            return (
              <MessageImageAttachment
                key={attachment.id}
                image={{
                  id: attachment.id,
                  signedUrl: attachment.url,
                  originalFilename: attachment.name,
                }}
                images={images.map((image) => ({
                  id: image.id,
                  signedUrl: image.url!,
                  originalFilename: image.name,
                }))}
                thumbnailStyle={styles.attachmentImage}
              />
            );
          }
          if (attachment.mimeType.startsWith("video/")) {
            return (
              <CommunityAttachmentVideo
                key={attachment.id}
                uri={attachment.url}
                style={styles.attachmentVideo}
              />
            );
          }
          return (
            <Pressable
              key={attachment.id}
              onPress={() => {
                if (attachment.url) void Linking.openURL(attachment.url);
              }}
              style={[
                styles.attachmentFileRow,
                { backgroundColor: c.attachmentFileBg },
              ]}
            >
              <Text
                style={[
                  styles.attachmentFileLabel,
                  { color: c.attachmentFileLabel },
                ]}
              >
                {attachment.name}
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
            style={[
              styles.linkPreviewCard,
              {
                borderColor: c.linkPreviewBorder,
                backgroundColor: c.linkPreviewBg,
              },
            ]}
          >
            <Text
              style={[styles.linkPreviewSite, { color: c.linkPreviewSite }]}
            >
              {siteName}
            </Text>
            <Text
              style={[styles.linkPreviewTitle, { color: c.linkPreviewTitle }]}
            >
              {title}
            </Text>
            {thumbnailUrl ? (
              <Image
                source={{ uri: thumbnailUrl }}
                style={styles.linkPreviewImage}
                resizeMode="cover"
              />
            ) : null}
            {embedUrl ? (
              <Text
                style={[styles.linkPreviewHint, { color: c.linkPreviewHint }]}
              >
                Video preview available — tap to open.
              </Text>
            ) : null}
          </Pressable>
        ) : null}

        {reactions.length > 0 ? (
          <View style={styles.reactionRow}>
            {reactions.map((reaction) => (
              <Pressable
                key={reaction.emoji}
                accessibilityRole="button"
                accessibilityState={{ selected: reaction.mine }}
                accessibilityLabel={`${reaction.emoji} ${reaction.count}`}
                onPress={() =>
                  onToggleReaction?.(reaction.emoji, !reaction.mine)
                }
                style={[
                  styles.reactionChip,
                  {
                    borderColor: reaction.mine ? c.link : c.linkPreviewBorder,
                    backgroundColor: c.linkPreviewBg,
                  },
                ]}
              >
                <Text style={[styles.reactionText, { color: c.text }]}>
                  {reaction.emoji} {reaction.count}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {outgoing ? (
          outgoing.error ? (
            <View style={styles.outgoingRow}>
              <Text style={[styles.outgoingText, { color: c.replyLabel }]}>
                Not sent: {outgoing.error}
              </Text>
              <Pressable accessibilityRole="button" onPress={onRetry}>
                <Text style={[styles.outgoingAction, { color: c.link }]}>
                  Retry
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onDiscard}>
                <Text style={[styles.outgoingAction, { color: c.timestamp }]}>
                  Discard
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.outgoingText, { color: c.timestamp }]}>
              Sending…
            </Text>
          )
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
      <View
        style={[styles.dateDividerLine, { borderTopColor: c.dateDividerLine }]}
      />
      <Text
        style={[
          styles.dateDividerText,
          { backgroundColor: c.dateDividerBg, color: c.text },
        ]}
      >
        {label}
      </Text>
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
    fontSize: 12,
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
  editedLabel: {
    marginTop: 1,
    fontSize: 11,
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
    ...StyleSheet.absoluteFill,
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
  reactionRow: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  reactionChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reactionText: {
    fontSize: 13,
  },
  outgoingRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  outgoingText: {
    marginTop: 2,
    fontSize: 12,
  },
  outgoingAction: {
    fontSize: 12,
    fontWeight: "600",
  },
});
