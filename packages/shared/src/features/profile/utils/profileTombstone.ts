export type MessageListAuthorProfile = {
  username: string;
  isPlatformStaff: boolean;
  displayPrefix: string | null;
  avatarUrl: string | null;
};

export const isAuthorProfileTombstone = (
  authorProfile: MessageListAuthorProfile | undefined,
): boolean =>
  Boolean(
    authorProfile &&
    authorProfile.avatarUrl === null &&
    (authorProfile.username === "Banned User" ||
      authorProfile.username === "Unknown User"),
  );
