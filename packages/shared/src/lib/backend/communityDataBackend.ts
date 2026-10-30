/**
 * Community data backend — the one `CommunityDataBackend` (see
 * communityDataBackend.interface.ts), assembled from the parts in
 * `communityData/`. Each part is an interface plus its implementation:
 *
 *   communityMemberBackend    members, bans, kicks, the viewer's permissions
 *   communityChannelBackend   channels, groups, per-channel overwrites
 *   communitySettingsBackend  community settings, roles, role permissions
 *   communityMessageBackend   message pages, reactions, media, send/edit/delete
 *   communityReportBackend    message and profile reports, report broadcasts
 *
 * and the helpers they share:
 *
 *   runtime                   injected client/config, edge-function caller
 *   rows                      shared row shapes and untyped-JSON coercers
 *   messageMedia              upload kind, extension and object path
 *   messageRows               message RPC parsers and signed-URL enrichment
 *   supportReportSnapshots    evidence snapshots for reports
 *
 * LIFECYCLE: inert until a host calls configureCommunityDataBackendRuntime()
 * at boot (see runtime.ts). Most methods are thin wrappers (run a Supabase
 * query/RPC, map rows, return); the ones that orchestrate are
 * fetchChannelPermissions, deleteMessage (storage cleanup) and reportMessage.
 */
import { communityChannelBackend } from "./communityData/communityChannelBackend";
import { communityMemberBackend } from "./communityData/communityMemberBackend";
import { communityMessageBackend } from "./communityData/communityMessageBackend";
import { communityReportBackend } from "./communityData/communityReportBackend";
import { communitySettingsBackend } from "./communityData/communitySettingsBackend";
import type { CommunityDataBackend } from "./communityDataBackend.interface";

export { configureCommunityDataBackendRuntime } from "./communityData/runtime";
export type { CommunityDataBackend } from "./communityDataBackend.interface";

export const centralCommunityDataBackend: CommunityDataBackend = {
  ...communityMemberBackend,
  ...communityChannelBackend,
  ...communitySettingsBackend,
  ...communityMessageBackend,
  ...communityReportBackend,
};
