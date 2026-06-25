export type ChannelMeta = {
  hasMore: boolean;
  cursor: string | null;
};

export type SendCommunityMessageMediaOptions = {
  mediaFile?: Blob | File;
  mediaArrayBuffer?: ArrayBuffer;
  mediaContentType?: string;
  mediaFilename?: string;
  mediaExpiresInHours?: number;
  optimisticMediaUri?: string | null;
  senderUserId?: string | null;
  senderIsPlatformStaff?: boolean;
};
