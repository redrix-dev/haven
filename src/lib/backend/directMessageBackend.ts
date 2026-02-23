import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type {
  DirectMessage,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
} from './types';

export interface DirectMessageBackend {
  listConversations(): Promise<DirectMessageConversationSummary[]>;
  getOrCreateDirectConversation(otherUserId: string): Promise<string>;
  listMessages(input: {
    conversationId: string;
    limit?: number;
    beforeCreatedAt?: string | null;
    beforeMessageId?: string | null;
  }): Promise<DirectMessage[]>;
  sendMessage(input: {
    conversationId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<DirectMessage>;
  markConversationRead(conversationId: string): Promise<boolean>;
  setConversationMuted(input: { conversationId: string; muted: boolean }): Promise<boolean>;
  reportMessage(input: {
    messageId: string;
    kind: DirectMessageReportKind;
    comment: string;
  }): Promise<string>;
  subscribeToConversations(userId: string, onChange: (payload?: unknown) => void): RealtimeChannel;
  subscribeToMessages(conversationId: string, onChange: (payload?: unknown) => void): RealtimeChannel;
}

type DirectMessageConversationRow = {
  conversation_id: string;
  kind: 'direct' | 'group';
  other_user_id: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_id: string | null;
  last_message_author_user_id: string | null;
  last_message_preview: string | null;
  last_message_created_at: string | null;
  unread_count: number | null;
  is_muted: boolean | null;
  muted_until: string | null;
};

type DirectMessageRow = {
  message_id: string;
  conversation_id: string;
  author_user_id: string;
  author_username: string;
  author_avatar_url: string | null;
  content: string;
  metadata: unknown;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const mapConversation = (row: DirectMessageConversationRow): DirectMessageConversationSummary => ({
  conversationId: row.conversation_id,
  kind: row.kind,
  otherUserId: row.other_user_id ?? null,
  otherUsername: row.other_username ?? null,
  otherAvatarUrl: row.other_avatar_url ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastMessageAt: row.last_message_at ?? null,
  lastMessageId: row.last_message_id ?? null,
  lastMessageAuthorUserId: row.last_message_author_user_id ?? null,
  lastMessagePreview: row.last_message_preview ?? null,
  lastMessageCreatedAt: row.last_message_created_at ?? null,
  unreadCount: Number(row.unread_count ?? 0),
  isMuted: Boolean(row.is_muted),
  mutedUntil: row.muted_until ?? null,
});

const mapMessage = (row: DirectMessageRow): DirectMessage => ({
  messageId: row.message_id,
  conversationId: row.conversation_id,
  authorUserId: row.author_user_id,
  authorUsername: row.author_username,
  authorAvatarUrl: row.author_avatar_url ?? null,
  content: row.content,
  metadata: asRecord(row.metadata),
  createdAt: row.created_at,
  editedAt: row.edited_at ?? null,
  deletedAt: row.deleted_at ?? null,
});

const callBooleanRpc = async (functionName: string, args: Record<string, unknown>): Promise<boolean> => {
  const { data, error } = await supabase.rpc(functionName as never, args as never);
  if (error) throw error;
  return Boolean(data);
};

export const centralDirectMessageBackend: DirectMessageBackend = {
  async listConversations() {
    const { data, error } = await supabase.rpc('list_my_dm_conversations' as never);
    if (error) throw error;
    return ((data ?? []) as DirectMessageConversationRow[]).map(mapConversation);
  },

  async getOrCreateDirectConversation(otherUserId) {
    const { data, error } = await supabase.rpc(
      'get_or_create_direct_dm_conversation' as never,
      { p_other_user_id: otherUserId } as never
    );
    if (error) throw error;
    const value = data as unknown;
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('DM conversation creation returned no id.');
    }
    return value;
  },

  async listMessages(input) {
    const { data, error } = await supabase.rpc(
      'list_dm_messages' as never,
      {
        p_conversation_id: input.conversationId,
        p_limit: input.limit ?? 50,
        p_before_created_at: input.beforeCreatedAt ?? undefined,
        p_before_message_id: input.beforeMessageId ?? undefined,
      } as never
    );
    if (error) throw error;
    return ((data ?? []) as DirectMessageRow[]).map(mapMessage);
  },

  async sendMessage(input) {
    const { data, error } = await supabase.rpc(
      'send_dm_message' as never,
      {
        p_conversation_id: input.conversationId,
        p_content: input.content,
        p_metadata: input.metadata ?? {},
      } as never
    );
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : null) as DirectMessageRow | null;
    if (!row) {
      throw new Error('DM send returned no message row.');
    }
    return mapMessage(row);
  },

  async markConversationRead(conversationId) {
    return callBooleanRpc('mark_dm_conversation_read', { p_conversation_id: conversationId });
  },

  async setConversationMuted({ conversationId, muted }) {
    return callBooleanRpc('set_dm_conversation_muted', {
      p_conversation_id: conversationId,
      p_muted: muted,
    });
  },

  async reportMessage({ messageId, kind, comment }) {
    const { data, error } = await supabase.rpc(
      'report_dm_message' as never,
      {
        p_message_id: messageId,
        p_kind: kind,
        p_comment: comment,
      } as never
    );
    if (error) throw error;
    const reportId = data as unknown;
    if (typeof reportId !== 'string' || reportId.trim().length === 0) {
      throw new Error('DM report creation returned no id.');
    }
    return reportId;
  },

  subscribeToConversations(userId, onChange) {
    return supabase
      .channel(`dm_conversations:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_conversation_members',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_conversation_notification_preferences',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_conversations',
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_messages',
        },
        (payload) => onChange(payload)
      )
      .subscribe();
  },

  subscribeToMessages(conversationId, onChange) {
    return supabase
      .channel(`dm_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => onChange(payload)
      )
      .subscribe();
  },
};

