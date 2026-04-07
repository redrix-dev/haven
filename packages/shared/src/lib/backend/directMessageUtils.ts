export const DIRECT_MESSAGE_IMAGE_PREVIEW_TEXT = 'Sent an image';

const ATTACHMENT_PLACEHOLDER_PATTERN = /^\[(media|image|file)\]$/i;
const INVISIBLE_MEDIA_PLACEHOLDER_PATTERN = /^[\s\u200B\u200C\u200D\uFEFF]+$/;

export const isInvisibleMediaPlaceholder = (content: string): boolean =>
  INVISIBLE_MEDIA_PLACEHOLDER_PATTERN.test(content);

export const isAttachmentPlaceholder = (content: string): boolean => {
  const trimmed = content.trim();
  return ATTACHMENT_PLACEHOLDER_PATTERN.test(trimmed) || isInvisibleMediaPlaceholder(content);
};

export const getVisibleDirectMessageText = (content: string, attachmentCount = 0): string | null => {
  if (attachmentCount > 0 && isAttachmentPlaceholder(content)) {
    return null;
  }

  const trimmed = content.trim();
  return trimmed.length > 0 ? content : null;
};

export const getDirectMessagePreviewText = (content: string, attachmentCount = 0): string | null => {
  const visibleText = getVisibleDirectMessageText(content, attachmentCount);
  if (visibleText) {
    return visibleText.trim();
  }
  return attachmentCount > 0 ? DIRECT_MESSAGE_IMAGE_PREVIEW_TEXT : null;
};
