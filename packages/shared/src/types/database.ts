export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
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
          created_by_user_id: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          created_by_user_id: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          created_by_user_id?: string
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
          banned_by_user_id: string
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
          banned_by_user_id: string
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
          banned_by_user_id?: string
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
      community_developer_access: {
        Row: {
          community_id: string
          enabled: boolean
          expires_at: string | null
          granted_at: string | null
          granted_by_user_id: string | null
          mode: Database["public"]["Enums"]["developer_access_mode"]
          notes: string | null
          updated_at: string
        }
        Insert: {
          community_id: string
          enabled?: boolean
          expires_at?: string | null
          granted_at?: string | null
          granted_by_user_id?: string | null
          mode?: Database["public"]["Enums"]["developer_access_mode"]
          notes?: string | null
          updated_at?: string
        }
        Update: {
          community_id?: string
          enabled?: boolean
          expires_at?: string | null
          granted_at?: string | null
          granted_by_user_id?: string | null
          mode?: Database["public"]["Enums"]["developer_access_mode"]
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_developer_access_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: true
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_developer_access_granted_by_user_id_fkey"
            columns: ["granted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_developer_access_channels: {
        Row: {
          channel_id: string
          community_id: string
        }
        Insert: {
          channel_id: string
          community_id: string
        }
        Update: {
          channel_id?: string
          community_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_developer_access_channel_community_id_channel_id_fkey"
            columns: ["community_id", "channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
            referencedColumns: ["community_id", "id"]
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
          author_type: Database["public"]["Enums"]["message_author_type"]
          author_user_id: string | null
          channel_id: string
          community_id: string
          content: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          metadata: Json
        }
        Insert: {
          author_type?: Database["public"]["Enums"]["message_author_type"]
          author_user_id?: string | null
          channel_id: string
          community_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          author_type?: Database["public"]["Enums"]["message_author_type"]
          author_user_id?: string | null
          channel_id?: string
          community_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          metadata?: Json
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
            foreignKeyName: "messages_community_id_channel_id_fkey"
            columns: ["community_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["community_id", "id"]
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
          can_post_haven_dev: boolean
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
          can_post_haven_dev?: boolean
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
          can_post_haven_dev?: boolean
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
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
      support_report_messages: {
        Row: {
          message_id: string
          report_id: string
        }
        Insert: {
          message_id: string
          report_id: string
        }
        Update: {
          message_id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_report_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_report_messages_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "support_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      support_reports: {
        Row: {
          community_id: string
          created_at: string
          id: string
          include_last_n_messages: number | null
          notes: string | null
          reporter_user_id: string
          status: Database["public"]["Enums"]["support_report_status"]
          title: string
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          include_last_n_messages?: number | null
          notes?: string | null
          reporter_user_id: string
          status?: Database["public"]["Enums"]["support_report_status"]
          title: string
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          include_last_n_messages?: number | null
          notes?: string | null
          reporter_user_id?: string
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ban_community_member: {
        Args: {
          p_community_id: string
          p_reason: string
          p_target_user_id: string
        }
        Returns: {
          banned_at: string
          banned_by_user_id: string
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
      can_manage_member_by_position: {
        Args: { p_community_id: string; p_member_id: string }
        Returns: boolean
      }
      can_manage_role_by_position: {
        Args: { p_community_id: string; p_role_id: string }
        Returns: boolean
      }
      can_post_haven_dev_message: {
        Args: { p_user_id?: string }
        Returns: boolean
      }
      can_send_in_channel: { Args: { p_channel_id: string }; Returns: boolean }
      can_set_role_position: {
        Args: { p_community_id: string; p_position: number }
        Returns: boolean
      }
      can_view_channel: { Args: { p_channel_id: string }; Returns: boolean }
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
      cleanup_expired_message_attachments: {
        Args: { p_limit?: number }
        Returns: number
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
      configure_haven_background_cron_jobs: { Args: never; Returns: undefined }
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
      current_user_highest_role_position: {
        Args: { p_community_id: string }
        Returns: number
      }
      delete_own_account: { Args: never; Returns: undefined }
      enqueue_link_preview_jobs_for_messages: {
        Args: { p_message_ids: string[]; p_reason?: string }
        Returns: {
          message_id: string
          queued: boolean
        }[]
      }
      extract_first_http_url: { Args: { p_content: string }; Returns: string }
      is_community_member: {
        Args: { p_community_id: string }
        Returns: boolean
      }
      is_community_owner: { Args: { p_community_id: string }; Returns: boolean }
      is_platform_staff: { Args: { p_user_id?: string }; Returns: boolean }
      list_bannable_shared_communities: {
        Args: { p_target_user_id: string }
        Returns: {
          community_id: string
          community_name: string
        }[]
      }
      member_highest_role_position: {
        Args: { p_community_id: string; p_member_id: string }
        Returns: number
      }
      post_haven_dev_message: {
        Args: {
          p_channel_id: string
          p_community_id: string
          p_content: string
          p_metadata?: Json
        }
        Returns: {
          author_type: Database["public"]["Enums"]["message_author_type"]
          author_user_id: string | null
          channel_id: string
          community_id: string
          content: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          metadata: Json
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_community_invite: {
        Args: { p_code: string }
        Returns: {
          community_id: string
          community_name: string
          joined: boolean
        }[]
      }
      set_haven_background_cron_config: {
        Args: {
          p_cron_shared_secret: string
          p_edge_base_url: string
          p_enabled?: boolean
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
          banned_by_user_id: string
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
      user_has_permission: {
        Args: { p_community_id: string; p_permission_key: string }
        Returns: boolean
      }
    }
    Enums: {
      channel_kind: "text" | "voice"
      community_backend_kind: "central_supabase" | "byo_supabase" | "byo_rest"
      developer_access_mode: "report_only" | "channel_scoped"
      link_embed_provider: "none" | "youtube" | "vimeo"
      link_preview_status: "pending" | "ready" | "unsupported" | "failed"
      message_author_type: "user" | "haven_dev" | "system"
      support_report_status: "open" | "in_review" | "resolved" | "closed"
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
      link_embed_provider: ["none", "youtube", "vimeo"],
      link_preview_status: ["pending", "ready", "unsupported", "failed"],
      message_author_type: ["user", "haven_dev", "system"],
      support_report_status: ["open", "in_review", "resolved", "closed"],
    },
  },
} as const
