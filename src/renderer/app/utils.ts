import type { NotificationItem } from '@/lib/backend/types';
import type { VoiceSidebarParticipant } from '@/renderer/app/types';

export const areVoiceParticipantListsEqual = (
  left: VoiceSidebarParticipant[],
  right: VoiceSidebarParticipant[]
) => {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (
      left[index].userId !== right[index].userId ||
      left[index].displayName !== right[index].displayName
    ) {
      return false;
    }
  }

  return true;
};

export const isEditableKeyboardTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

export const getNotificationPayloadString = (
  notification: NotificationItem,
  key: string
): string | null => {
  const value = notification.payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};
