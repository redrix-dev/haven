import type { ChannelGroup, ChannelKind } from '@shared/lib/backend/types'
import type { NexusState } from '../Nexus'

export type HavenChannel = {
  id: string
  communityId: string
  name: string
  kind: ChannelKind
  position: number
  topic: string | null
  createdAt: string
}

export type ChannelNexusState = NexusState<HavenChannel> & {
  byCommunity: Record<string, string[]>
  groups: Record<string, ChannelGroup[]>
  ungrouped: Record<string, string[]>
  collapsed: Record<string, string[]>
  activeChannelId: string | null
  loadingByCommunity: Record<string, boolean>
  lastChannelByCommunity: Record<string, string | null>
}
