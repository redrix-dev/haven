import { communityNexus } from '@shared/nexus/community/CommunityNexus'
import { getControlPlaneBackend } from '@shared/lib/backend'

export async function initializeNexuses(userId: string): Promise<void> {
  communityNexus.setIsLoading(true)

  try {
    const [communities] = await Promise.all([
      getControlPlaneBackend().listUserCommunities(userId),
      // future: dmNexus, notificationNexus etc go here
    ])

    communityNexus.setCommunities(
      communities.map((community) => ({
        id: community.id,
        name: community.name,
        createdAt: community.created_at,
      })),
    )
  } catch (err) {
    console.warn('[initializeNexuses] failed', err)
    communityNexus.setIsLoading(false)
  }
}
