export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      background_worker_cron_config: {
        Row: {
          created_at: string
          cron_shared_secret: string | null
          edge_base_url: string | null
          enabled: boolean
          id: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          cron_shared_secret?: string | null
          edge_base_url?: string | null
          enabled?: boolean
          id?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          cron_shared_secret?: string | null
          edge_base_url?: string | null
          enabled?: boolean
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      channel_group_channels: {
        Row: {
          channel_id: string
          community_id: string
          created_at: string
          group_id: string
          position: number
          updated_at: string
        }
        Insert: {
          channel_id: string
          community_id: string
          created_at?: string
          group_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          channel_id?: string
          community_id?: string
          created_at?: string
          group_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_group_channels_community_id_channel_id_fkey"
            columns: ["community_id", "channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "channel_group_channels_community_id_group_id_fkey"
            columns: ["community_id", "group_id"]
            isOneToOne: false
            referencedRelation: "channel_groups"
            referencedColumns: ["community_id", "id"]
          },
        ]
      }
      channel_group_preferences: {
        Row: {
          community_id: string
          created_at: string
          group_id: string
          is_collapsed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          group_id: string
          is_collapsed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          group_id?: string
          is_collapsed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_group_preferences_community_id_group_id_fkey"
            columns: ["community_id", "group_id"]
            isOneToOne: false
            referencedRelation: "channel_groups"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "channel_group_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_groups: {
        Row: {
          community_id: string
          created_at: string
          created_by_user_id: string | null
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_groups_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_groups_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_member_overwrites: {
        Row: {
          can_manage: boolean | null
          can_send: boolean | null
          can_view: boolean | null
          channel_id: string
          community_id: string
          created_at: string
          id: string
          member_id: string
          updated_at: string
        }
        Insert: {
          can_manage?: boolean | null
          can_send?: boolean | null
          can_view?: boolean | null
          channel_id: string
          community_id: string
          created_at?: string
          id?: string
          member_id: string
          updated_at?: string
        }
        Update: {
          can_manage?: boolean | null
          can_send?: boolean | null
          can_view?: boolean | null
          channel_id?: string
          community_id?: string
          created_at?: string
          id?: string
          member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_member_overwrites_community_id_channel_id_fkey"
            columns: ["community_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "channel_member_overwrites_community_id_member_id_fkey"
            columns: ["community_id", "member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["community_id", "id"]
          },
        ]
      }
      channel_role_overwrites: {
        Row: {
          can_manage: boolean | null
          can_send: boolean | null
          can_view: boolean | null
          channel_id: string
          community_id: string
          created_at: string
          id: string
          role_id: string
          updated_at: string
        }
        Insert: {
          can_manage?: boolean | null
          can_send?: boolean | null
          can_view?: boolean | null
          channel_id: string
          community_id: string
          created_at?: string
          id?: string
          role_id: string
          updated_at?: string
        }
        Update: {
          can_manage?: boolean | null
          can_send?: boolean | null
          can_view?: boolean | null
          channel_id?: string
          community_id?: string
          created_at?: string
          id?: string
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_role_overwrites_community_id_channel_id_fkey"
            columns: ["community_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "channel_role_overwrites_community_id_role_id_fkey"
            columns: ["community_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["community_id", "id"]
          },
        ]
      }
      channels: {
        Row: {
          community_id: string
          created_at: string
          created_by_user_id: string
          id: string
          kind: Database["public"]["Enums"]["channel_kind"]
          name: string
          position: number
          topic: string | null
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          created_by_user_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["channel_kind"]
          name: string
          position?: number
          topic?: string | null
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          created_by_user_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["channel_kind"]
          name?: string
          position?: number
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          created_at: string
          created_by_user_id: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_backend_configs: {
        Row: {
          backend_kind: Database["public"]["Enums"]["community_backend_kind"]
          community_id: string
          config: Json
          connection_label: string | null
          created_at: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          backend_kind?: Database["public"]["Enums"]["community_backend_kind"]
          community_id: string
          config?: Json
          connection_label?: string | null
          created_at?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          backend_kind?: Database["public"]["Enums"]["community_backend_kind"]
          community_id?: string
          config?: Json
          connection_label?: string | null
          created_at?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_backend_configs_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: true
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_bans: {
        Row: {
          banned_at: string
          banned_by_user_id: string | null
          banned_user_id: string
          community_id: string
          created_at: string
          id: string
          reason: string
          revoked_at: string | null
          revoked_by_user_id: string | null
          revoked_reason: string | null
          updated_at: string
        }
        Insert: {
          banned_at?: string
          banned_by_user_id?: string | null
          banned_user_id: string
          community_id: string
          created_at?: string
          id?: string
          reason: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          revoked_reason?: string | null
          updated_at?: string
        }
        Update: {
          banned_at?: string
          banned_by_user_id?: string | null
          banned_user_id?: string
          community_id?: string
          created_at?: string
          id?: string
          reason?: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          revoked_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_bans_banned_by_user_id_fkey"
            columns: ["banned_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_bans_banned_user_id_fkey"
            columns: ["banned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_bans_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_bans_revoked_by_user_id_fkey"
            columns: ["revoked_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_flair_grant_rules: {
        Row: {
          community_id: string
          created_at: string
          flair_id: string
          grant_source: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          flair_id: string
          grant_source?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          flair_id?: string
          grant_source?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_flair_grant_rules_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_flair_grant_rules_flair_id_fkey"
            columns: ["flair_id"]
            isOneToOne: false
            referencedRelation: "flairs"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          community_id: string
          created_at: string
          id: string
          is_owner: boolean
          joined_at: string
          nickname: string | null
          user_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          is_owner?: boolean
          joined_at?: string
          nickname?: string | null
          user_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          is_owner?: boolean
          joined_at?: string
          nickname?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_settings: {
        Row: {
          allow_haven_developer_access: boolean
          allow_public_invites: boolean
          community_id: string
          created_at: string
          developer_access_mode: Database["public"]["Enums"]["developer_access_mode"]
          require_report_reason: boolean
          updated_at: string
        }
        Insert: {
          allow_haven_developer_access?: boolean
          allow_public_invites?: boolean
          community_id: string
          created_at?: string
          developer_access_mode?: Database["public"]["Enums"]["developer_access_mode"]
          require_report_reason?: boolean
          updated_at?: string
        }
        Update: {
          allow_haven_developer_access?: boolean
          allow_public_invites?: boolean
          community_id?: string
          created_at?: string
          developer_access_mode?: Database["public"]["Enums"]["developer_access_mode"]
          require_report_reason?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_settings_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: true
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_conversation_members: {
        Row: {
          conversation_id: string
          hidden_at: string | null
          joined_at: string
          last_read_at: string | null
          left_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          hidden_at?: string | null
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          hidden_at?: string | null
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_conversation_notification_preferences: {
        Row: {
          conversation_id: string
          created_at: string
          in_app_override: boolean | null
          muted_until: string | null
          sound_override: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          in_app_override?: boolean | null
          muted_until?: string | null
          sound_override?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          in_app_override?: boolean | null
          muted_until?: string | null
          sound_override?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_conversation_notification_preferences_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversation_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_conversations: {
        Row: {
          created_at: string
          created_by_user_id: string
          direct_user_high_id: string | null
          direct_user_low_id: string | null
          id: string
          kind: Database["public"]["Enums"]["dm_conversation_kind"]
          last_message_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          direct_user_high_id?: string | null
          direct_user_low_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["dm_conversation_kind"]
          last_message_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          direct_user_high_id?: string | null
          direct_user_low_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["dm_conversation_kind"]
          last_message_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_conversations_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversations_direct_user_high_id_fkey"
            columns: ["direct_user_high_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversations_direct_user_low_id_fkey"
            columns: ["direct_user_low_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_message_attachments: {
        Row: {
          bucket_name: string
          conversation_id: string
          created_at: string
          expires_at: string
          id: string
          media_kind: string
          message_id: string
          mime_type: string
          object_path: string
          original_filename: string | null
          owner_user_id: string
          size_bytes: number
        }
        Insert: {
          bucket_name?: string
          conversation_id: string
          created_at?: string
          expires_at: string
          id?: string
          media_kind: string
          message_id: string
          mime_type: string
          object_path: string
          original_filename?: string | null
          owner_user_id: string
          size_bytes: number
        }
        Update: {
          bucket_name?: string
          conversation_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          media_kind?: string
          message_id?: string
          mime_type?: string
          object_path?: string
          original_filename?: string | null
          owner_user_id?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "dm_message_attachments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "dm_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_message_attachments_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_message_report_actions: {
        Row: {
          acted_by_user_id: string
          action_type: string
          created_at: string
          id: string
          metadata: Json
          notes: string | null
          report_id: string
        }
        Insert: {
          acted_by_user_id: string
          action_type: string
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          report_id: string
        }
        Update: {
          acted_by_user_id?: string
          action_type?: string
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_message_report_actions_acted_by_user_id_fkey"
            columns: ["acted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_message_report_actions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dm_message_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_message_reports: {
        Row: {
          assigned_at: string | null
          assigned_to_user_id: string | null
          comment: string
          conversation_id: string
          created_at: string
          id: string
          kind: string
          message_id: string
          reported_user_id: string
          reporter_user_id: string
          resolution_notes: string | null
          status: Database["public"]["Enums"]["dm_message_report_status"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to_user_id?: string | null
          comment: string
          conversation_id: string
          created_at?: string
          id?: string
          kind: string
          message_id: string
          reported_user_id: string
          reporter_user_id: string
          resolution_notes?: string | null
          status?: Database["public"]["Enums"]["dm_message_report_status"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to_user_id?: string | null
          comment?: string
          conversation_id?: string
          created_at?: string
          id?: string
          kind?: string
          message_id?: string
          reported_user_id?: string
          reporter_user_id?: string
          resolution_notes?: string | null
          status?: Database["public"]["Enums"]["dm_message_report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_message_reports_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_message_reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "dm_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_message_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_message_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_messages: {
        Row: {
          author_user_id: string
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          metadata: Json
        }
        Insert: {
          author_user_id: string
          content: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          author_user_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "dm_messages_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      expo_push_dispatch_wakeups: {
        Row: {
          created_at: string
          enabled: boolean
          id: boolean
          last_attempted_at: string | null
          last_error: string | null
          last_reason: string | null
          last_request_id: number | null
          last_requested_at: string | null
          last_skip_reason: string | null
          min_interval_seconds: number
          total_attempts: number
          total_debounced: number
          total_scheduled: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: boolean
          last_attempted_at?: string | null
          last_error?: string | null
          last_reason?: string | null
          last_request_id?: number | null
          last_requested_at?: string | null
          last_skip_reason?: string | null
          min_interval_seconds?: number
          total_attempts?: number
          total_debounced?: number
          total_scheduled?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: boolean
          last_attempted_at?: string | null
          last_error?: string | null
          last_reason?: string | null
          last_request_id?: number | null
          last_requested_at?: string | null
          last_skip_reason?: string | null
          min_interval_seconds?: number
          total_attempts?: number
          total_debounced?: number
          total_scheduled?: number
          updated_at?: string
        }
        Relationships: []
      }
      expo_push_notification_jobs: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          locked_at: string | null
          notification_event_id: string
          notification_recipient_id: string
          processed_at: string | null
          provider_status_code: number | null
          reason: string
          recipient_user_id: string
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          locked_at?: string | null
          notification_event_id: string
          notification_recipient_id: string
          processed_at?: string | null
          provider_status_code?: number | null
          reason?: string
          recipient_user_id: string
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          locked_at?: string | null
          notification_event_id?: string
          notification_recipient_id?: string
          processed_at?: string | null
          provider_status_code?: number | null
          reason?: string
          recipient_user_id?: string
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expo_push_notification_jobs_notification_event_id_fkey"
            columns: ["notification_event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expo_push_notification_jobs_notification_recipient_id_fkey"
            columns: ["notification_recipient_id"]
            isOneToOne: false
            referencedRelation: "notification_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expo_push_notification_jobs_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expo_push_notification_jobs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "expo_push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      expo_push_subscriptions: {
        Row: {
          created_at: string
          expo_push_token: string
          id: string
          installation_id: string | null
          last_seen_at: string
          metadata: Json
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expo_push_token: string
          id?: string
          installation_id?: string | null
          last_seen_at?: string
          metadata?: Json
          platform?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expo_push_token?: string
          id?: string
          installation_id?: string | null
          last_seen_at?: string
          metadata?: Json
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expo_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags_catalog: {
        Row: {
          created_at: string
          description: string
          enabled_by_default: boolean
          key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          enabled_by_default?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          enabled_by_default?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      flairs: {
        Row: {
          background_token: string
          color_token: string
          community_id: string | null
          created_at: string
          description: string | null
          icon_key: string | null
          id: string
          is_active: boolean
          is_retired: boolean
          key: string
          label: string
          scope: string
          updated_at: string
        }
        Insert: {
          background_token?: string
          color_token?: string
          community_id?: string | null
          created_at?: string
          description?: string | null
          icon_key?: string | null
          id?: string
          is_active?: boolean
          is_retired?: boolean
          key: string
          label: string
          scope?: string
          updated_at?: string
        }
        Update: {
          background_token?: string
          color_token?: string
          community_id?: string | null
          created_at?: string
          description?: string | null
          icon_key?: string | null
          id?: string
          is_active?: boolean
          is_retired?: boolean
          key?: string
          label?: string
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flairs_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          pair_user_high_id: string
          pair_user_low_id: string
          recipient_user_id: string
          responded_at: string | null
          responded_by_user_id: string | null
          sender_user_id: string
          status: Database["public"]["Enums"]["friend_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          pair_user_high_id: string
          pair_user_low_id: string
          recipient_user_id: string
          responded_at?: string | null
          responded_by_user_id?: string | null
          sender_user_id: string
          status?: Database["public"]["Enums"]["friend_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          pair_user_high_id?: string
          pair_user_low_id?: string
          recipient_user_id?: string
          responded_at?: string | null
          responded_by_user_id?: string | null
          sender_user_id?: string
          status?: Database["public"]["Enums"]["friend_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_responded_by_user_id_fkey"
            columns: ["responded_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          created_via_request_id: string | null
          user_high_id: string
          user_low_id: string
        }
        Insert: {
          created_at?: string
          created_via_request_id?: string | null
          user_high_id: string
          user_low_id: string
        }
        Update: {
          created_at?: string
          created_via_request_id?: string | null
          user_high_id?: string
          user_low_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_created_via_request_id_fkey"
            columns: ["created_via_request_id"]
            isOneToOne: false
            referencedRelation: "friend_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          code: string
          community_id: string
          created_at: string
          created_by_user_id: string
          current_uses: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
        }
        Insert: {
          code: string
          community_id: string
          created_at?: string
          created_by_user_id: string
          current_uses?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
        }
        Update: {
          code?: string
          community_id?: string
          created_at?: string
          created_by_user_id?: string
          current_uses?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      link_preview_cache: {
        Row: {
          created_at: string
          etag: string | null
          fetched_at: string | null
          final_url: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_modified: string | null
          normalized_url: string
          payload: Json
          stale_after: string | null
          status: Database["public"]["Enums"]["link_preview_status"]
          thumbnail_bucket_name: string | null
          thumbnail_object_path: string | null
          thumbnail_source_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          etag?: string | null
          fetched_at?: string | null
          final_url?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_modified?: string | null
          normalized_url: string
          payload?: Json
          stale_after?: string | null
          status?: Database["public"]["Enums"]["link_preview_status"]
          thumbnail_bucket_name?: string | null
          thumbnail_object_path?: string | null
          thumbnail_source_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          etag?: string | null
          fetched_at?: string | null
          final_url?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_modified?: string | null
          normalized_url?: string
          payload?: Json
          stale_after?: string | null
          status?: Database["public"]["Enums"]["link_preview_status"]
          thumbnail_bucket_name?: string | null
          thumbnail_object_path?: string | null
          thumbnail_source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      link_preview_jobs: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          locked_at: string | null
          message_id: string
          reason: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          locked_at?: string | null
          message_id: string
          reason: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          locked_at?: string | null
          message_id?: string
          reason?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_preview_jobs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      member_roles: {
        Row: {
          assigned_at: string
          assigned_by_user_id: string | null
          community_id: string
          member_id: string
          role_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by_user_id?: string | null
          community_id: string
          member_id: string
          role_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by_user_id?: string | null
          community_id?: string
          member_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_roles_assigned_by_user_id_fkey"
            columns: ["assigned_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_roles_community_id_member_id_fkey"
            columns: ["community_id", "member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "member_roles_community_id_role_id_fkey"
            columns: ["community_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["community_id", "id"]
          },
        ]
      }
      message_attachment_deletion_jobs: {
        Row: {
          attachment_id: string | null
          attempts: number
          available_at: string
          bucket_name: string
          community_id: string | null
          created_at: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          locked_at: string | null
          message_id: string | null
          object_path: string
          processed_at: string | null
          reason: string
          status: string
          updated_at: string
        }
        Insert: {
          attachment_id?: string | null
          attempts?: number
          available_at?: string
          bucket_name: string
          community_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          locked_at?: string | null
          message_id?: string | null
          object_path: string
          processed_at?: string | null
          reason?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attachment_id?: string | null
          attempts?: number
          available_at?: string
          bucket_name?: string
          community_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          locked_at?: string | null
          message_id?: string | null
          object_path?: string
          processed_at?: string | null
          reason?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_attachments: {
        Row: {
          bucket_name: string
          channel_id: string
          community_id: string
          created_at: string
          expires_at: string
          id: string
          media_kind: string
          message_id: string
          mime_type: string
          object_path: string
          original_filename: string | null
          owner_user_id: string
          size_bytes: number
        }
        Insert: {
          bucket_name?: string
          channel_id: string
          community_id: string
          created_at?: string
          expires_at: string
          id?: string
          media_kind: string
          message_id: string
          mime_type: string
          object_path: string
          original_filename?: string | null
          owner_user_id: string
          size_bytes: number
        }
        Update: {
          bucket_name?: string
          channel_id?: string
          community_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          media_kind?: string
          message_id?: string
          mime_type?: string
          object_path?: string
          original_filename?: string | null
          owner_user_id?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_link_previews: {
        Row: {
          cache_id: string | null
          channel_id: string
          community_id: string
          created_at: string
          embed_provider: Database["public"]["Enums"]["link_embed_provider"]
          id: string
          message_id: string
          normalized_url: string | null
          snapshot: Json
          source_url: string | null
          status: Database["public"]["Enums"]["link_preview_status"]
          thumbnail_bucket_name: string | null
          thumbnail_object_path: string | null
          updated_at: string
        }
        Insert: {
          cache_id?: string | null
          channel_id: string
          community_id: string
          created_at?: string
          embed_provider?: Database["public"]["Enums"]["link_embed_provider"]
          id?: string
          message_id: string
          normalized_url?: string | null
          snapshot?: Json
          source_url?: string | null
          status?: Database["public"]["Enums"]["link_preview_status"]
          thumbnail_bucket_name?: string | null
          thumbnail_object_path?: string | null
          updated_at?: string
        }
        Update: {
          cache_id?: string | null
          channel_id?: string
          community_id?: string
          created_at?: string
          embed_provider?: Database["public"]["Enums"]["link_embed_provider"]
          id?: string
          message_id?: string
          normalized_url?: string | null
          snapshot?: Json
          source_url?: string | null
          status?: Database["public"]["Enums"]["link_preview_status"]
          thumbnail_bucket_name?: string | null
          thumbnail_object_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_link_previews_cache_id_fkey"
            columns: ["cache_id"]
            isOneToOne: false
            referencedRelation: "link_preview_cache"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_link_previews_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_link_previews_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_link_previews_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          channel_id: string
          community_id: string
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          channel_id: string
          community_id: string
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          channel_id?: string
          community_id?: string
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_user_id: string | null
          avatar_snapshot_url: string | null
          channel_id: string
          community_id: string
          content: string
          created_at: string
          deleted_at: string | null
          display_name: string
          edited_at: string | null
          id: string
          is_hidden: boolean
          is_platform_staff: boolean
          metadata: Json
          platform_expunged_at: string | null
          platform_quarantined_at: string | null
          reply_to_message_id: string | null
        }
        Insert: {
          author_user_id?: string | null
          avatar_snapshot_url?: string | null
          channel_id: string
          community_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          display_name: string
          edited_at?: string | null
          id?: string
          is_hidden?: boolean
          is_platform_staff?: boolean
          metadata?: Json
          platform_expunged_at?: string | null
          platform_quarantined_at?: string | null
          reply_to_message_id?: string | null
        }
        Update: {
          author_user_id?: string | null
          avatar_snapshot_url?: string | null
          channel_id?: string
          community_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          edited_at?: string | null
          id?: string
          is_hidden?: boolean
          is_platform_staff?: boolean
          metadata?: Json
          platform_expunged_at?: string | null
          platform_quarantined_at?: string | null
          reply_to_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_delivery_traces: {
        Row: {
          created_at: string
          decision: string
          details: Json
          id: string
          notification_event_id: string | null
          notification_recipient_id: string | null
          reason_code: string
          recipient_user_id: string | null
          stage: string
          transport: string
        }
        Insert: {
          created_at?: string
          decision: string
          details?: Json
          id?: string
          notification_event_id?: string | null
          notification_recipient_id?: string | null
          reason_code: string
          recipient_user_id?: string | null
          stage: string
          transport: string
        }
        Update: {
          created_at?: string
          decision?: string
          details?: Json
          id?: string
          notification_event_id?: string | null
          notification_recipient_id?: string | null
          reason_code?: string
          recipient_user_id?: string | null
          stage?: string
          transport?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_traces_notification_event_id_fkey"
            columns: ["notification_event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_traces_notification_recipient_id_fkey"
            columns: ["notification_recipient_id"]
            isOneToOne: false
            referencedRelation: "notification_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_traces_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          payload: Json
          source_id: string
          source_kind: Database["public"]["Enums"]["notification_source_kind"]
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          payload?: Json
          source_id: string
          source_kind: Database["public"]["Enums"]["notification_source_kind"]
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          payload?: Json
          source_id?: string
          source_kind?: Database["public"]["Enums"]["notification_source_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_recipients: {
        Row: {
          created_at: string
          deliver_in_app: boolean
          deliver_sound: boolean
          dismissed_at: string | null
          event_id: string
          id: string
          read_at: string | null
          recipient_user_id: string
          seen_at: string | null
        }
        Insert: {
          created_at?: string
          deliver_in_app?: boolean
          deliver_sound?: boolean
          dismissed_at?: string | null
          event_id: string
          id?: string
          read_at?: string | null
          recipient_user_id: string
          seen_at?: string | null
        }
        Update: {
          created_at?: string
          deliver_in_app?: boolean
          deliver_sound?: boolean
          dismissed_at?: string | null
          event_id?: string
          id?: string
          read_at?: string | null
          recipient_user_id?: string
          seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_recipients_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_campaigns: {
        Row: {
          created_at: string
          description: string | null
          distribution_scope: string
          ends_at: string | null
          feature_flag_key: string
          is_active: boolean
          key: string
          max_app_version: string | null
          min_app_version: string | null
          platform_scope: string
          required: boolean
          sort_order: number
          starts_at: string | null
          target_community_id: string | null
          target_flair_key: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          distribution_scope?: string
          ends_at?: string | null
          feature_flag_key: string
          is_active?: boolean
          key: string
          max_app_version?: string | null
          min_app_version?: string | null
          platform_scope?: string
          required?: boolean
          sort_order?: number
          starts_at?: string | null
          target_community_id?: string | null
          target_flair_key?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          distribution_scope?: string
          ends_at?: string | null
          feature_flag_key?: string
          is_active?: boolean
          key?: string
          max_app_version?: string | null
          min_app_version?: string | null
          platform_scope?: string
          required?: boolean
          sort_order?: number
          starts_at?: string | null
          target_community_id?: string | null
          target_flair_key?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_campaigns_feature_flag_key_fkey"
            columns: ["feature_flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags_catalog"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "onboarding_campaigns_target_community_id_fkey"
            columns: ["target_community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_campaigns_target_flair_key_fkey"
            columns: ["target_flair_key"]
            isOneToOne: false
            referencedRelation: "flairs"
            referencedColumns: ["key"]
          },
        ]
      }
      permissions_catalog: {
        Row: {
          description: string
          key: string
        }
        Insert: {
          description: string
          key: string
        }
        Update: {
          description?: string
          key?: string
        }
        Relationships: []
      }
      platform_staff: {
        Row: {
          assigned_by_user_id: string | null
          created_at: string
          display_prefix: string
          is_active: boolean
          notes: string | null
          staff_role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by_user_id?: string | null
          created_at?: string
          display_prefix?: string
          is_active?: boolean
          notes?: string | null
          staff_role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by_user_id?: string | null
          created_at?: string
          display_prefix?: string
          is_active?: boolean
          notes?: string | null
          staff_role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_staff_assigned_by_user_id_fkey"
            columns: ["assigned_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_identities: {
        Row: {
          avatar_url: string | null
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_user_flair_id: string | null
          avatar_url: string | null
          created_at: string
          id: string
          profile_bio: string | null
          profile_visibility: string
          theme: string
          updated_at: string
          username: string
        }
        Insert: {
          active_user_flair_id?: string | null
          avatar_url?: string | null
          created_at?: string
          id: string
          profile_bio?: string | null
          profile_visibility?: string
          theme?: string
          updated_at?: string
          username: string
        }
        Update: {
          active_user_flair_id?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          profile_bio?: string | null
          profile_visibility?: string
          theme?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_user_flair_id_fkey"
            columns: ["active_user_flair_id"]
            isOneToOne: false
            referencedRelation: "user_flairs"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_key: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_key: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions_catalog"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          color: string
          community_id: string
          created_at: string
          id: string
          is_default: boolean
          is_system: boolean
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          community_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_system?: boolean
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          community_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_system?: boolean
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      support_report_channels: {
        Row: {
          channel_id: string
          community_id: string
          report_id: string
        }
        Insert: {
          channel_id: string
          community_id: string
          report_id: string
        }
        Update: {
          channel_id?: string
          community_id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_report_channels_community_id_channel_id_fkey"
            columns: ["community_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["community_id", "id"]
          },
          {
            foreignKeyName: "support_report_channels_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "support_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      support_reports: {
        Row: {
          community_id: string | null
          created_at: string
          destination: string
          id: string
          include_last_n_messages: number | null
          notes: string | null
          platform_action: Json | null
          reporter_user_id: string
          snapshot: Json | null
          source_report_id: string | null
          status: Database["public"]["Enums"]["support_report_status"]
          title: string
          updated_at: string
        }
        Insert: {
          community_id?: string | null
          created_at?: string
          destination?: string
          id?: string
          include_last_n_messages?: number | null
          notes?: string | null
          platform_action?: Json | null
          reporter_user_id: string
          snapshot?: Json | null
          source_report_id?: string | null
          status?: Database["public"]["Enums"]["support_report_status"]
          title: string
          updated_at?: string
        }
        Update: {
          community_id?: string | null
          created_at?: string
          destination?: string
          id?: string
          include_last_n_messages?: number | null
          notes?: string | null
          platform_action?: Json | null
          reporter_user_id?: string
          snapshot?: Json | null
          source_report_id?: string | null
          status?: Database["public"]["Enums"]["support_report_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_reports_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_reports_source_report_id_fkey"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "support_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      tos_acceptances: {
        Row: {
          accepted_at: string
          id: string
          ip_address: string | null
          tos_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          tos_version?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          tos_version?: string
          user_id?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_user_id: string
          blocker_user_id: string
          created_at: string
        }
        Insert: {
          blocked_user_id: string
          blocker_user_id: string
          created_at?: string
        }
        Update: {
          blocked_user_id?: string
          blocker_user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_user_id_fkey"
            columns: ["blocked_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_user_id_fkey"
            columns: ["blocker_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feature_flag_overrides: {
        Row: {
          assigned_by_user_id: string | null
          created_at: string
          enabled: boolean
          expires_at: string | null
          flag_key: string
          reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by_user_id?: string | null
          created_at?: string
          enabled: boolean
          expires_at?: string | null
          flag_key: string
          reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by_user_id?: string | null
          created_at?: string
          enabled?: boolean
          expires_at?: string | null
          flag_key?: string
          reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feature_flag_overrides_assigned_by_user_id_fkey"
            columns: ["assigned_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feature_flag_overrides_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags_catalog"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_feature_flag_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_flairs: {
        Row: {
          created_at: string
          expires_at: string | null
          flair_id: string
          grant_source: string
          granted_by_user_id: string | null
          id: string
          revoked_at: string | null
          source_community_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          flair_id: string
          grant_source: string
          granted_by_user_id?: string | null
          id?: string
          revoked_at?: string | null
          source_community_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          flair_id?: string
          grant_source?: string
          granted_by_user_id?: string | null
          id?: string
          revoked_at?: string | null
          source_community_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_flairs_flair_id_fkey"
            columns: ["flair_id"]
            isOneToOne: false
            referencedRelation: "flairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_flairs_granted_by_user_id_fkey"
            columns: ["granted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_flairs_source_community_id_fkey"
            columns: ["source_community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_flairs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          created_at: string
          dm_in_app_enabled: boolean
          dm_push_enabled: boolean
          dm_sound_enabled: boolean
          friend_request_in_app_enabled: boolean
          friend_request_push_enabled: boolean
          friend_request_sound_enabled: boolean
          mention_in_app_enabled: boolean
          mention_push_enabled: boolean
          mention_sound_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dm_in_app_enabled?: boolean
          dm_push_enabled?: boolean
          dm_sound_enabled?: boolean
          friend_request_in_app_enabled?: boolean
          friend_request_push_enabled?: boolean
          friend_request_sound_enabled?: boolean
          mention_in_app_enabled?: boolean
          mention_push_enabled?: boolean
          mention_sound_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dm_in_app_enabled?: boolean
          dm_push_enabled?: boolean
          dm_sound_enabled?: boolean
          friend_request_in_app_enabled?: boolean
          friend_request_push_enabled?: boolean
          friend_request_sound_enabled?: boolean
          mention_in_app_enabled?: boolean
          mention_push_enabled?: boolean
          mention_sound_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding_campaigns: {
        Row: {
          campaign_key: string
          completed_at: string | null
          created_at: string
          joined_community_id: string | null
          skipped_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_key: string
          completed_at?: string | null
          created_at?: string
          joined_community_id?: string | null
          skipped_at?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_key?: string
          completed_at?: string | null
          created_at?: string
          joined_community_id?: string | null
          skipped_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_onboarding_campaigns_campaign_key_fkey"
            columns: ["campaign_key"]
            isOneToOne: false
            referencedRelation: "onboarding_campaigns"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_onboarding_campaigns_joined_community_id_fkey"
            columns: ["joined_community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_onboarding_campaigns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_friend_request: { Args: { p_request_id: string }; Returns: string }
      add_dm_message_report_action: {
        Args: {
          p_action_type: string
          p_metadata?: Json
          p_notes?: string
          p_report_id: string
        }
        Returns: string
      }
      are_friends: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: boolean
      }
      assert_dm_report_rate_limit: {
        Args: { p_user_id?: string }
        Returns: undefined
      }
      assert_dm_send_rate_limit: {
        Args: { p_user_id?: string }
        Returns: undefined
      }
      assert_friend_request_rate_limit: {
        Args: { p_user_id?: string }
        Returns: undefined
      }
      assign_dm_message_report: {
        Args: {
          p_assignee_user_id?: string
          p_notes?: string
          p_report_id: string
        }
        Returns: boolean
      }
      ban_community_member: {
        Args: {
          p_community_id: string
          p_reason: string
          p_target_user_id: string
        }
        Returns: {
          banned_user_id: string
          community_id: string
        }[]
      }
      block_user: { Args: { p_target_user_id: string }; Returns: string }
      block_user_social: {
        Args: { p_target_user_id: string }
        Returns: boolean
      }
      broadcast_channel_group_change: {
        Args: {
          p_community_id: string
          p_event: string
          p_group_id: string
          p_target_user_id?: string
        }
        Returns: undefined
      }
      broadcast_report_status_updated: {
        Args: {
          p_community_id: string
          p_report_id: string
          p_status: string
          p_updated_by: string
        }
        Returns: undefined
      }
      can_manage_member_by_position: {
        Args: { p_community_id: string; p_member_id: string }
        Returns: boolean
      }
      can_manage_role_by_position: {
        Args: { p_community_id: string; p_role_id: string }
        Returns: boolean
      }
      can_notify_channel_mention: {
        Args: {
          p_actor_user_id: string
          p_channel_id: string
          p_community_id: string
          p_target_user_id: string
        }
        Returns: boolean
      }
      can_send_dm_in_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      can_send_in_channel: { Args: { p_channel_id: string }; Returns: boolean }
      can_set_role_position: {
        Args: { p_community_id: string; p_position: number }
        Returns: boolean
      }
      can_transition_dm_message_report_status: {
        Args: {
          p_from: Database["public"]["Enums"]["dm_message_report_status"]
          p_to: Database["public"]["Enums"]["dm_message_report_status"]
        }
        Returns: boolean
      }
      can_user_view_channel_as: {
        Args: { p_channel_id: string; p_user_id: string }
        Returns: boolean
      }
      can_view_channel: { Args: { p_channel_id: string }; Returns: boolean }
      can_view_profile_identity: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      cancel_friend_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      claim_expo_push_notification_jobs: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: {
          actor_avatar_url: string
          actor_user_id: string
          actor_username: string
          attempts: number
          available_at: string
          created_at: string
          job_id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          notification_event_id: string
          notification_recipient_id: string
          payload: Json
          recipient_deliver_in_app: boolean
          recipient_deliver_push: boolean
          recipient_deliver_sound: boolean
          recipient_dismissed_at: string
          recipient_read_at: string
          recipient_seen_at: string
          recipient_user_id: string
          source_id: string
          source_kind: Database["public"]["Enums"]["notification_source_kind"]
          status: string
          subscription_expo_push_token: string
          subscription_id: string
          subscription_platform: string
        }[]
      }
      claim_link_preview_jobs: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: {
          attempts: number
          available_at: string
          created_at: string
          id: string
          message_id: string
          reason: string
          status: string
        }[]
      }
      claim_message_attachment_deletion_jobs: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: {
          attachment_id: string
          attempts: number
          available_at: string
          bucket_name: string
          community_id: string
          created_at: string
          id: string
          message_id: string
          object_path: string
          reason: string
          status: string
        }[]
      }
      cleanup_expired_dm_message_attachments: {
        Args: { p_limit?: number }
        Returns: number
      }
      cleanup_expired_message_attachments: {
        Args: { p_limit?: number }
        Returns: number
      }
      clear_user_feature_flag: {
        Args: { p_flag_key: string; p_user_id: string }
        Returns: undefined
      }
      complete_expo_push_notification_job: {
        Args: {
          p_error?: string
          p_job_id: string
          p_outcome: string
          p_provider_status_code?: number
          p_retry_delay_seconds?: number
        }
        Returns: undefined
      }
      complete_link_preview_job: {
        Args: {
          p_error?: string
          p_job_id: string
          p_outcome: string
          p_retry_delay_seconds?: number
        }
        Returns: undefined
      }
      complete_message_attachment_deletion_job: {
        Args: {
          p_error?: string
          p_job_id: string
          p_outcome: string
          p_retry_delay_seconds?: number
        }
        Returns: undefined
      }
      complete_onboarding_campaign: {
        Args: {
          p_app_version?: string
          p_campaign_key: string
          p_distribution?: string
          p_platform?: string
        }
        Returns: {
          campaign_key: string
          community_id: string
          community_name: string
          joined: boolean
          status: string
        }[]
      }
      configure_haven_background_cron_jobs: { Args: never; Returns: undefined }
      count_mutual_communities_for_users: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: number
      }
      create_community: {
        Args: { p_description?: string; p_name: string }
        Returns: {
          created_at: string
          created_by_user_id: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "communities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_community_flair_grant_rule: {
        Args: {
          p_community_id: string
          p_flair_key: string
          p_grant_source?: string
        }
        Returns: string
      }
      create_community_invite: {
        Args: {
          p_community_id: string
          p_expires_in_hours?: number
          p_max_uses?: number
        }
        Returns: {
          code: string
          community_id: string
          created_at: string
          created_by_user_id: string
          current_uses: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
        }
        SetofOptions: {
          from: "*"
          to: "invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_notification_event_with_recipients: {
        Args: {
          p_actor_user_id?: string
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_payload?: Json
          p_recipients?: Json
          p_source_id: string
          p_source_kind: Database["public"]["Enums"]["notification_source_kind"]
        }
        Returns: string
      }
      current_user_highest_role_position: {
        Args: { p_community_id: string }
        Returns: number
      }
      decline_friend_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      delete_my_expo_push_subscription: {
        Args: { p_expo_push_token: string }
        Returns: boolean
      }
      delete_own_account: { Args: never; Returns: undefined }
      disable_community_flair_grant_rule: {
        Args: { p_rule_id: string }
        Returns: undefined
      }
      dismiss_notifications: {
        Args: { p_recipient_ids: string[] }
        Returns: number
      }
      dismiss_old_read_notifications_before: {
        Args: { p_before?: string }
        Returns: number
      }
      dm_message_attachments_json: {
        Args: { p_message_id: string }
        Returns: Json
      }
      dm_message_preview_text: {
        Args: { p_content: string; p_has_attachment: boolean }
        Returns: string
      }
      enqueue_expo_push_notification_jobs_for_recipients: {
        Args: { p_notification_recipient_ids?: string[]; p_reason?: string }
        Returns: {
          notification_recipient_id: string
          queued: boolean
          subscription_id: string
        }[]
      }
      enqueue_link_preview_jobs_for_messages: {
        Args: { p_message_ids: string[]; p_reason?: string }
        Returns: {
          message_id: string
          queued: boolean
        }[]
      }
      enqueue_report_alert: {
        Args: {
          p_created_at: string
          p_report_id: string
          p_report_type: string
          p_reporter_user_id: string
          p_server_name: string
        }
        Returns: undefined
      }
      ensure_user_flair_grant: {
        Args: {
          p_flair_id: string
          p_grant_source: string
          p_granted_by_user_id?: string
          p_source_community_id?: string
          p_user_id: string
        }
        Returns: string
      }
      ensure_user_notification_preferences_row: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      extract_first_http_url: { Args: { p_content: string }; Returns: string }
      extract_mentioned_user_ids_from_message: {
        Args: { p_community_id: string; p_content: string }
        Returns: {
          avatar_url: string
          user_id: string
          username: string
        }[]
      }
      extract_visible_dm_message_text: {
        Args: { p_content: string }
        Returns: string
      }
      get_channel_message: {
        Args: {
          p_channel_id: string
          p_community_id: string
          p_message_id: string
        }
        Returns: {
          attachment: Json
          author_user_id: string
          avatar_snapshot_url: string
          channel_id: string
          content: string
          created_at: string
          deleted_at: string
          display_name: string
          edited_at: string
          id: string
          is_hidden: boolean
          is_platform_staff: boolean
          link_preview: Json
          metadata: Json
          reactions: Json
          reply_to_message_id: string
        }[]
      }
      get_dm_message: {
        Args: { p_conversation_id: string; p_message_id: string }
        Returns: {
          attachments: Json
          author_avatar_url: string
          author_user_id: string
          author_username: string
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string
          edited_at: string
          message_id: string
          metadata: Json
        }[]
      }
      get_dm_message_report_detail: {
        Args: { p_report_id: string }
        Returns: {
          assigned_at: string
          assigned_to_user_id: string
          assigned_to_username: string
          comment: string
          conversation_id: string
          created_at: string
          kind: string
          message_attachments: Json
          message_author_avatar_url: string
          message_author_user_id: string
          message_author_username: string
          message_content: string
          message_created_at: string
          message_deleted_at: string
          message_edited_at: string
          message_id: string
          message_metadata: Json
          report_id: string
          reported_avatar_url: string
          reported_user_id: string
          reported_username: string
          reporter_avatar_url: string
          reporter_user_id: string
          reporter_username: string
          resolution_notes: string
          status: Database["public"]["Enums"]["dm_message_report_status"]
          updated_at: string
        }[]
      }
      get_message_author_profiles: {
        Args: { p_author_user_ids: string[]; p_community_id: string }
        Returns: {
          avatar_url: string
          id: string
          updated_at: string
          username: string
        }[]
      }
      get_my_community_permissions: {
        Args: { p_community_id: string }
        Returns: {
          can_create_channels: boolean
          can_create_reports: boolean
          can_manage_bans: boolean
          can_manage_channel_permissions: boolean
          can_manage_channel_structure: boolean
          can_manage_invites: boolean
          can_manage_members: boolean
          can_manage_messages: boolean
          can_manage_reports: boolean
          can_manage_roles: boolean
          can_manage_server: boolean
          can_refresh_link_previews: boolean
          can_view_ban_hidden: boolean
          is_elevated: boolean
          is_owner: boolean
        }[]
      }
      get_my_notification_counts: {
        Args: never
        Returns: {
          unread_count: number
          unseen_count: number
        }[]
      }
      get_my_notification_preferences: {
        Args: never
        Returns: {
          created_at: string
          dm_in_app_enabled: boolean
          dm_push_enabled: boolean
          dm_sound_enabled: boolean
          friend_request_in_app_enabled: boolean
          friend_request_push_enabled: boolean
          friend_request_sound_enabled: boolean
          mention_in_app_enabled: boolean
          mention_push_enabled: boolean
          mention_sound_enabled: boolean
          updated_at: string
          user_id: string
        }[]
      }
      get_my_social_counts: {
        Args: never
        Returns: {
          blocked_user_count: number
          friends_count: number
          incoming_pending_request_count: number
          outgoing_pending_request_count: number
        }[]
      }
      get_or_create_direct_dm_conversation: {
        Args: { p_other_user_id: string }
        Returns: string
      }
      get_profile_card: {
        Args: { p_user_id: string }
        Returns: {
          active_flair_background_token: string
          active_flair_color_token: string
          active_flair_description: string
          active_flair_icon_key: string
          active_flair_id: string
          active_flair_key: string
          active_flair_label: string
          active_flair_user_flair_id: string
          avatar_url: string
          can_view_details: boolean
          profile_bio: string
          profile_visibility: string
          user_id: string
          username: string
        }[]
      }
      grant_user_flair: {
        Args: {
          p_flair_key: string
          p_grant_source: string
          p_source_community_id?: string
          p_user_id: string
        }
        Returns: string
      }
      is_blocked_either_direction: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: boolean
      }
      is_community_member: {
        Args: { p_community_id: string }
        Returns: boolean
      }
      is_community_owner: { Args: { p_community_id: string }; Returns: boolean }
      is_dm_conversation_member: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_haven_moderator: { Args: { p_user_id?: string }; Returns: boolean }
      is_notification_recipient: {
        Args: { p_notification_recipient_id: string }
        Returns: boolean
      }
      is_platform_staff: { Args: { p_user_id?: string }; Returns: boolean }
      is_user_flair_grant_available: {
        Args: { p_user_flair_id: string; p_user_id: string }
        Returns: boolean
      }
      kick_community_member: {
        Args: { p_community_id: string; p_target_user_id: string }
        Returns: {
          community_id: string
          kicked_user_id: string
        }[]
      }
      list_bannable_shared_communities: {
        Args: { p_target_user_id: string }
        Returns: {
          community_id: string
          community_name: string
        }[]
      }
      list_channel_messages: {
        Args: {
          p_before_created_at?: string
          p_before_message_id?: string
          p_channel_id: string
          p_community_id: string
          p_limit?: number
        }
        Returns: {
          attachment: Json
          author_user_id: string
          avatar_snapshot_url: string
          channel_id: string
          content: string
          created_at: string
          deleted_at: string
          display_name: string
          edited_at: string
          id: string
          is_hidden: boolean
          is_platform_staff: boolean
          link_preview: Json
          metadata: Json
          reactions: Json
          reply_to_message_id: string
        }[]
      }
      list_community_bans: {
        Args: { p_community_id: string }
        Returns: {
          avatar_url: string
          banned_at: string
          banned_by_user_id: string
          banned_user_id: string
          community_id: string
          id: string
          reason: string
          revoked_at: string
          revoked_by_user_id: string
          revoked_reason: string
          username: string
        }[]
      }
      list_dm_message_context: {
        Args: { p_after?: number; p_before?: number; p_message_id: string }
        Returns: {
          attachments: Json
          author_avatar_url: string
          author_user_id: string
          author_username: string
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string
          edited_at: string
          is_target: boolean
          message_id: string
          metadata: Json
        }[]
      }
      list_dm_message_report_actions: {
        Args: { p_report_id: string }
        Returns: {
          acted_by_avatar_url: string
          acted_by_user_id: string
          acted_by_username: string
          action_id: string
          action_type: string
          created_at: string
          metadata: Json
          notes: string
          report_id: string
        }[]
      }
      list_dm_message_reports_for_review: {
        Args: {
          p_before_created_at?: string
          p_before_report_id?: string
          p_limit?: number
          p_statuses?: Database["public"]["Enums"]["dm_message_report_status"][]
        }
        Returns: {
          assigned_at: string
          assigned_to_user_id: string
          assigned_to_username: string
          comment: string
          conversation_id: string
          created_at: string
          kind: string
          message_created_at: string
          message_deleted_at: string
          message_id: string
          message_preview: string
          report_id: string
          reported_avatar_url: string
          reported_user_id: string
          reported_username: string
          reporter_avatar_url: string
          reporter_user_id: string
          reporter_username: string
          status: Database["public"]["Enums"]["dm_message_report_status"]
          updated_at: string
        }[]
      }
      list_dm_messages: {
        Args: {
          p_before_created_at?: string
          p_before_message_id?: string
          p_conversation_id: string
          p_limit?: number
        }
        Returns: {
          attachments: Json
          author_avatar_url: string
          author_user_id: string
          author_username: string
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string
          edited_at: string
          message_id: string
          metadata: Json
        }[]
      }
      list_mutual_community_names_for_users: {
        Args: { p_limit?: number; p_user_a: string; p_user_b: string }
        Returns: string[]
      }
      list_my_blocked_users: {
        Args: never
        Returns: {
          avatar_url: string
          blocked_at: string
          blocked_user_id: string
          username: string
        }[]
      }
      list_my_dm_conversations: {
        Args: never
        Returns: {
          conversation_id: string
          created_at: string
          is_muted: boolean
          kind: Database["public"]["Enums"]["dm_conversation_kind"]
          last_message_at: string
          last_message_author_user_id: string
          last_message_created_at: string
          last_message_id: string
          last_message_preview: string
          muted_until: string
          other_avatar_url: string
          other_user_id: string
          other_username: string
          unread_count: number
          updated_at: string
        }[]
      }
      list_my_expo_push_subscriptions: {
        Args: never
        Returns: {
          created_at: string
          expo_push_token: string
          id: string
          installation_id: string
          last_seen_at: string
          metadata: Json
          platform: string
          updated_at: string
          user_id: string
        }[]
      }
      list_my_feature_flags: {
        Args: never
        Returns: {
          enabled: boolean
          expires_at: string
          flag_key: string
          source: string
        }[]
      }
      list_my_friend_requests: {
        Args: never
        Returns: {
          created_at: string
          direction: string
          mutual_community_count: number
          mutual_community_names: string[]
          recipient_avatar_url: string
          recipient_user_id: string
          recipient_username: string
          request_id: string
          sender_avatar_url: string
          sender_user_id: string
          sender_username: string
          status: Database["public"]["Enums"]["friend_request_status"]
        }[]
      }
      list_my_friends: {
        Args: never
        Returns: {
          avatar_url: string
          friend_user_id: string
          friendship_created_at: string
          mutual_community_count: number
          mutual_community_names: string[]
          username: string
        }[]
      }
      list_my_notification_delivery_traces: {
        Args: { p_limit?: number; p_notification_recipient_id?: string }
        Returns: {
          created_at: string
          decision: string
          details: Json
          id: string
          notification_event_id: string
          notification_recipient_id: string
          reason_code: string
          recipient_user_id: string
          stage: string
          transport: string
        }[]
      }
      list_my_notifications: {
        Args: {
          p_before_created_at?: string
          p_before_id?: string
          p_limit?: number
        }
        Returns: {
          actor_avatar_url: string
          actor_user_id: string
          actor_username: string
          created_at: string
          deliver_in_app: boolean
          deliver_sound: boolean
          dismissed_at: string
          event_id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          payload: Json
          read_at: string
          recipient_id: string
          seen_at: string
          source_id: string
          source_kind: Database["public"]["Enums"]["notification_source_kind"]
        }[]
      }
      list_my_onboarding_campaigns: {
        Args: {
          p_app_version?: string
          p_distribution?: string
          p_platform?: string
        }
        Returns: {
          campaign_key: string
          description: string
          distribution_scope: string
          feature_flag_key: string
          platform_scope: string
          required: boolean
          sort_order: number
          target_community_id: string
          target_flair_key: string
          title: string
        }[]
      }
      list_my_sound_notifications: {
        Args: {
          p_before_created_at?: string
          p_before_id?: string
          p_limit?: number
        }
        Returns: {
          actor_avatar_url: string
          actor_user_id: string
          actor_username: string
          created_at: string
          deliver_in_app: boolean
          deliver_sound: boolean
          dismissed_at: string
          event_id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          payload: Json
          read_at: string
          recipient_id: string
          seen_at: string
          source_id: string
          source_kind: Database["public"]["Enums"]["notification_source_kind"]
        }[]
      }
      list_my_user_flairs: {
        Args: never
        Returns: {
          background_token: string
          color_token: string
          community_id: string
          description: string
          expires_at: string
          flair_id: string
          flair_key: string
          grant_source: string
          granted_at: string
          icon_key: string
          is_available: boolean
          is_selected: boolean
          label: string
          scope: string
          source_community_id: string
          user_flair_id: string
        }[]
      }
      list_profile_identity_subscribers: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      list_users_blocking_me: {
        Args: never
        Returns: {
          blocker_user_id: string
        }[]
      }
      mark_all_notifications_seen: { Args: never; Returns: number }
      mark_dm_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      mark_notifications_read: {
        Args: { p_recipient_ids: string[] }
        Returns: number
      }
      mark_notifications_seen: {
        Args: { p_recipient_ids: string[] }
        Returns: number
      }
      member_highest_role_position: {
        Args: { p_community_id: string; p_member_id: string }
        Returns: number
      }
      normalize_onboarding_scope_value: {
        Args: { p_allowed: string[]; p_default: string; p_value: string }
        Returns: string
      }
      notification_event_visible_to_auth: {
        Args: { p_event_id: string }
        Returns: boolean
      }
      onboarding_app_version_matches: {
        Args: {
          p_app_version: string
          p_max_app_version: string
          p_min_app_version: string
        }
        Returns: boolean
      }
      onboarding_campaign_is_enabled_for_user: {
        Args: { p_feature_flag_key: string; p_user_id: string }
        Returns: boolean
      }
      onboarding_platform_matches: {
        Args: { p_platform: string; p_scope: string }
        Returns: boolean
      }
      onboarding_semver_parts: { Args: { p_value: string }; Returns: number[] }
      recheck_expo_push_notification_jobs_for_send: {
        Args: { p_job_ids: string[] }
        Returns: {
          job_id: string
          reason: string
          should_deliver_push: boolean
        }[]
      }
      redeem_community_invite: {
        Args: { p_code: string }
        Returns: {
          community_id: string
          community_name: string
          joined: boolean
        }[]
      }
      remove_friend: { Args: { p_other_user_id: string }; Returns: boolean }
      report_dm_message: {
        Args: { p_comment: string; p_kind: string; p_message_id: string }
        Returns: string
      }
      request_expo_push_dispatch_wakeup: {
        Args: { p_reason?: string }
        Returns: {
          attempted_at: string
          request_id: number
          scheduled: boolean
          skipped_reason: string
        }[]
      }
      resolve_channel_mention_notification_delivery_for_user: {
        Args: {
          p_channel_id: string
          p_community_id: string
          p_recipient_user_id: string
        }
        Returns: {
          deliver_in_app: boolean
          deliver_sound: boolean
        }[]
      }
      resolve_dm_notification_delivery_for_user: {
        Args: { p_conversation_id: string; p_recipient_user_id: string }
        Returns: {
          deliver_in_app: boolean
          deliver_sound: boolean
        }[]
      }
      resolve_notification_delivery_for_user: {
        Args: {
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_recipient_user_id: string
        }
        Returns: {
          deliver_in_app: boolean
          deliver_sound: boolean
        }[]
      }
      resolve_notification_push_delivery_for_user: {
        Args: {
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_recipient_user_id: string
        }
        Returns: boolean
      }
      revoke_user_flair: {
        Args: { p_user_flair_id: string }
        Returns: undefined
      }
      search_users_for_friend_add: {
        Args: { p_query: string }
        Returns: {
          avatar_url: string
          mutual_community_count: number
          mutual_community_names: string[]
          pending_request_id: string
          relationship_state: string
          user_id: string
          username: string
        }[]
      }
      send_dm_message: {
        Args: {
          p_content: string
          p_conversation_id: string
          p_image_attachment?: Json
          p_metadata?: Json
        }
        Returns: {
          attachments: Json
          author_avatar_url: string
          author_user_id: string
          author_username: string
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string
          edited_at: string
          message_id: string
          metadata: Json
        }[]
      }
      send_friend_request: { Args: { p_username: string }; Returns: string }
      send_user_message: {
        Args: {
          p_channel_id: string
          p_community_id: string
          p_content: string
          p_metadata?: Json
          p_reply_to_message_id?: string
        }
        Returns: string
      }
      set_active_user_flair: {
        Args: { p_user_flair_id: string }
        Returns: undefined
      }
      set_dm_conversation_muted: {
        Args: { p_conversation_id: string; p_muted: boolean }
        Returns: boolean
      }
      set_haven_background_cron_config: {
        Args: {
          p_cron_shared_secret: string
          p_edge_base_url: string
          p_enabled?: boolean
        }
        Returns: undefined
      }
      set_user_feature_flag: {
        Args: {
          p_enabled: boolean
          p_expires_at?: string
          p_flag_key: string
          p_reason?: string
          p_user_id: string
        }
        Returns: undefined
      }
      try_parse_uuid: { Args: { p_value: string }; Returns: string }
      unban_community_member: {
        Args: {
          p_community_id: string
          p_reason?: string
          p_target_user_id: string
        }
        Returns: {
          banned_at: string
          banned_by_user_id: string | null
          banned_user_id: string
          community_id: string
          created_at: string
          id: string
          reason: string
          revoked_at: string | null
          revoked_by_user_id: string | null
          revoked_reason: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_bans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unblock_user: { Args: { p_target_user_id: string }; Returns: undefined }
      unblock_user_social: {
        Args: { p_target_user_id: string }
        Returns: boolean
      }
      update_dm_message_report_status: {
        Args: {
          p_notes?: string
          p_report_id: string
          p_status: Database["public"]["Enums"]["dm_message_report_status"]
        }
        Returns: boolean
      }
      update_my_notification_preferences: {
        Args: {
          p_dm_in_app_enabled: boolean
          p_dm_push_enabled?: boolean
          p_dm_sound_enabled: boolean
          p_friend_request_in_app_enabled: boolean
          p_friend_request_push_enabled?: boolean
          p_friend_request_sound_enabled: boolean
          p_mention_in_app_enabled: boolean
          p_mention_push_enabled?: boolean
          p_mention_sound_enabled: boolean
        }
        Returns: {
          created_at: string
          dm_in_app_enabled: boolean
          dm_push_enabled: boolean
          dm_sound_enabled: boolean
          friend_request_in_app_enabled: boolean
          friend_request_push_enabled: boolean
          friend_request_sound_enabled: boolean
          mention_in_app_enabled: boolean
          mention_push_enabled: boolean
          mention_sound_enabled: boolean
          updated_at: string
          user_id: string
        }[]
      }
      upsert_my_expo_push_subscription: {
        Args: {
          p_expo_push_token: string
          p_installation_id?: string
          p_metadata?: Json
          p_platform?: string
        }
        Returns: {
          created_at: string
          expo_push_token: string
          id: string
          installation_id: string
          last_seen_at: string
          metadata: Json
          platform: string
          updated_at: string
          user_id: string
        }[]
      }
      user_has_permission: {
        Args: { p_community_id: string; p_permission_key: string }
        Returns: boolean
      }
    }
    Enums: {
      channel_kind: "text" | "voice"
      community_backend_kind: "central_supabase" | "byo_supabase" | "byo_rest"
      developer_access_mode: "report_only" | "channel_scoped"
      dm_conversation_kind: "direct" | "group"
      dm_message_report_status:
        | "open"
        | "triaged"
        | "in_review"
        | "resolved_actioned"
        | "resolved_no_action"
        | "dismissed"
      friend_request_status: "pending" | "accepted" | "declined" | "canceled"
      link_embed_provider: "none" | "youtube" | "vimeo"
      link_preview_status: "pending" | "ready" | "unsupported" | "failed"
      notification_kind:
        | "friend_request_received"
        | "friend_request_accepted"
        | "dm_message"
        | "channel_mention"
        | "system"
      notification_source_kind:
        | "friend_request"
        | "dm_message"
        | "message"
        | "system_event"
      support_report_status:
        | "pending"
        | "under_review"
        | "resolved"
        | "dismissed"
        | "escalated"
        | "resolved_by_platform"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      channel_kind: ["text", "voice"],
      community_backend_kind: ["central_supabase", "byo_supabase", "byo_rest"],
      developer_access_mode: ["report_only", "channel_scoped"],
      dm_conversation_kind: ["direct", "group"],
      dm_message_report_status: [
        "open",
        "triaged",
        "in_review",
        "resolved_actioned",
        "resolved_no_action",
        "dismissed",
      ],
      friend_request_status: ["pending", "accepted", "declined", "canceled"],
      link_embed_provider: ["none", "youtube", "vimeo"],
      link_preview_status: ["pending", "ready", "unsupported", "failed"],
      notification_kind: [
        "friend_request_received",
        "friend_request_accepted",
        "dm_message",
        "channel_mention",
        "system",
      ],
      notification_source_kind: [
        "friend_request",
        "dm_message",
        "message",
        "system_event",
      ],
      support_report_status: [
        "pending",
        "under_review",
        "resolved",
        "dismissed",
        "escalated",
        "resolved_by_platform",
      ],
    },
  },
} as const

