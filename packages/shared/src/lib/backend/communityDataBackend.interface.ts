import type { CommunityChannelBackend } from "./communityData/communityChannelBackend";
import type { CommunityMemberBackend } from "./communityData/communityMemberBackend";
import type { CommunityMessageBackend } from "./communityData/communityMessageBackend";
import type { CommunityReportBackend } from "./communityData/communityReportBackend";
import type { CommunitySettingsBackend } from "./communityData/communitySettingsBackend";
import type { Message } from "./types";

export type {
  CommunityChannelBackend,
  CommunityMemberBackend,
  CommunityMessageBackend,
  CommunityReportBackend,
  CommunitySettingsBackend,
};

export type MessagePageCursor = {
  createdAt: string;
  id: string;
};

export type MessagePageResult = {
  messages: Message[];
  hasMore: boolean;
};

/**
 * Everything a community client can ask the database for, as one object. Each
 * part is its own interface beside its implementation in `communityData/`.
 */
export interface CommunityDataBackend
  extends
    CommunityMemberBackend,
    CommunityChannelBackend,
    CommunitySettingsBackend,
    CommunityMessageBackend,
    CommunityReportBackend {}
