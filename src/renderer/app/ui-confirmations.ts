import type { PendingUiConfirmation } from '@/renderer/app/types';

export function getPendingUiConfirmationCopy(pendingUiConfirmation: PendingUiConfirmation | null) {
  const title =
    pendingUiConfirmation?.kind === 'leave-server'
      ? `Leave "${pendingUiConfirmation.serverName}"?`
      : pendingUiConfirmation?.kind === 'delete-server'
        ? `Delete "${pendingUiConfirmation.serverName}"?`
        : pendingUiConfirmation?.kind === 'delete-channel'
          ? `Delete channel "${pendingUiConfirmation.channelName}"?`
          : pendingUiConfirmation?.kind === 'delete-channel-group'
            ? `Delete group "${pendingUiConfirmation.groupName}"?`
            : 'Confirm action';

  const description =
    pendingUiConfirmation?.kind === 'leave-server'
      ? 'You will leave this server. You can rejoin later if you have an invite.'
      : pendingUiConfirmation?.kind === 'delete-server'
        ? 'This will permanently delete the server and cannot be undone.'
        : pendingUiConfirmation?.kind === 'delete-channel'
          ? 'This will permanently delete the channel and cannot be undone.'
          : pendingUiConfirmation?.kind === 'delete-channel-group'
            ? 'Channels currently in this group will become ungrouped.'
            : '';

  const confirmLabel =
    pendingUiConfirmation?.kind === 'leave-server' ? 'Leave Server' : 'Delete';

  const isDestructive =
    pendingUiConfirmation?.kind === 'delete-server' ||
    pendingUiConfirmation?.kind === 'delete-channel' ||
    pendingUiConfirmation?.kind === 'delete-channel-group';

  return {
    title,
    description,
    confirmLabel,
    isDestructive,
  };
}
