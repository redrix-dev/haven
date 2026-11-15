export const nextChannelPermission = (value: boolean | null): boolean | null =>
  value === null ? true : value ? false : null;

export const channelPermissionLabel = (value: boolean | null): string =>
  value === null ? "Default" : value ? "Allow" : "Deny";
