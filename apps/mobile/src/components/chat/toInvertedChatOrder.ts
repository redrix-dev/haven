/**
 * Reverses an ascending nexus array (oldest-first storage order) to descending
 * (newest-first) for use with React Native FlatList inverted={true}.
 *
 * Contract: both DirectMessageNexus and CommunityMessageNexus store messages
 * oldest-first. An inverted FlatList renders data[0] at the visual bottom, so
 * data must be newest-first for a correct chat layout (newest at bottom).
 * Web display components use the ascending order directly with scroll anchoring
 * and must NOT call this function.
 */
export function toInvertedChatOrder<T>(items: T[]): T[] {
  return [...items].reverse();
}
