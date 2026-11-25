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
      account_restrictions: {
        Row: {
          case_id: string | null
          created_at: string
          decision_id: string | null
          ends_at: string | null
          id: string
          lifted_at: string | null
          lifted_by: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          case_id?: string | null
          created_at?: string
          decision_id?: string | null
          ends_at?: string | null
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          user_id: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          decision_id?: string | null
          ends_at?: string | null
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_restrictions_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "platform_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_restrictions_decision_fk"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "platform_case_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_restrictions_lifted_by_fkey"
            columns: ["lifted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_restrictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        ComputedFields: never
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      case_media: {
        Row: {
          case_id: string
          media_id: string
        }
        ComputedFields: never
        Insert: {
          case_id: string
          media_id: string
        }
        Update: {
          case_id?: string
          media_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_media_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "platform_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_categories: {
        Row: {
          community_id: string
          created_at: string
          id: string
          name: string
          position: number
        }
        ComputedFields: never
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_categories_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_overwrites: {
        Row: {
          can_manage: boolean | null
          can_send: boolean | null
          can_view: boolean | null
          channel_id: string
          community_id: string
          id: string
          role_id: string | null
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          can_manage?: boolean | null
          can_send?: boolean | null
          can_view?: boolean | null
          channel_id: string
          community_id: string
          id?: string
          role_id?: string | null
          user_id?: string | null
        }
        Update: {
          can_manage?: boolean | null
          can_send?: boolean | null
          can_view?: boolean | null
          channel_id?: string
          community_id?: string
          id?: string
          role_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_overwrites_channel_id_community_id_fkey"
            columns: ["channel_id", "community_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id", "community_id"]
          },
          {
            foreignKeyName: "channel_overwrites_community_id_user_id_fkey"
            columns: ["community_id", "user_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["community_id", "user_id"]
          },
          {
            foreignKeyName: "channel_overwrites_role_id_community_id_fkey"
            columns: ["role_id", "community_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "community_id"]
          },
        ]
      }
      channel_participants: {
        Row: {
          channel_id: string
          joined_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          channel_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_participants_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_user_state: {
        Row: {
          channel_id: string
          last_read_message_id: string | null
          muted_until: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          channel_id: string
          last_read_message_id?: string | null
          muted_until?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          last_read_message_id?: string | null
          muted_until?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_user_state_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_user_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          category_id: string | null
          community_id: string | null
          created_at: string
          direct_key: string | null
          id: string
          kind: Database["public"]["Enums"]["channel_kind"]
          latest_message_id: string | null
          name: string | null
          position: number
          topic: string | null
        }
        ComputedFields: never
        Insert: {
          category_id?: string | null
          community_id?: string | null
          created_at?: string
          direct_key?: string | null
          id?: string
          kind: Database["public"]["Enums"]["channel_kind"]
          latest_message_id?: string | null
          name?: string | null
          position?: number
          topic?: string | null
        }
        Update: {
          category_id?: string | null
          community_id?: string | null
          created_at?: string
          direct_key?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["channel_kind"]
          latest_message_id?: string | null
          name?: string | null
          position?: number
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_category_id_community_id_fkey"
            columns: ["category_id", "community_id"]
            isOneToOne: false
            referencedRelation: "channel_categories"
            referencedColumns: ["id", "community_id"]
          },
          {
            foreignKeyName: "channels_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      collapsed_categories: {
        Row: {
          category_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          category_id: string
          user_id: string
        }
        Update: {
          category_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collapsed_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "channel_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collapsed_categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          created_at: string
          description: string | null
          id: string
          invites_enabled: boolean
          name: string
          owner_id: string
          report_reason_required: boolean
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          invites_enabled?: boolean
          name: string
          owner_id: string
          report_reason_required?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          invites_enabled?: boolean
          name?: string
          owner_id?: string
          report_reason_required?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_owner_is_member"
            columns: ["id", "owner_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["community_id", "user_id"]
          },
        ]
      }
      community_audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string
          community_id: string
          created_at: string
          detail: NonNullable<Json>
          id: string
          target_id: string | null
          target_user_id: string | null
        }
        ComputedFields: never
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string
          community_id: string
          created_at?: string
          detail?: NonNullable<Json>
          id?: string
          target_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string
          community_id?: string
          created_at?: string
          detail?: NonNullable<Json>
          id?: string
          target_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_audit_log_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_bans: {
        Row: {
          banned_by: string
          community_id: string
          created_at: string
          reason: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          banned_by: string
          community_id: string
          created_at?: string
          reason: string
          user_id: string
        }
        Update: {
          banned_by?: string
          community_id?: string
          created_at?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_bans_banned_by_fkey"
            columns: ["banned_by"]
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
            foreignKeyName: "community_bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          community_id: string
          joined_at: string
          nickname: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          community_id: string
          joined_at?: string
          nickname?: string | null
          user_id: string
        }
        Update: {
          community_id?: string
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
      community_report_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          report_id: string
        }
        ComputedFields: never
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          report_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_report_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_report_notes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "community_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reports: {
        Row: {
          community_id: string
          created_at: string
          escalated_case_id: string | null
          id: string
          reason: string | null
          reporter_id: string
          snapshot: NonNullable<Json>
          status: Database["public"]["Enums"]["report_status"]
          subject_kind: Database["public"]["Enums"]["report_subject"]
          subject_message_id: string | null
          subject_user_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          community_id: string
          created_at?: string
          escalated_case_id?: string | null
          id?: string
          reason?: string | null
          reporter_id: string
          snapshot: NonNullable<Json>
          status?: Database["public"]["Enums"]["report_status"]
          subject_kind: Database["public"]["Enums"]["report_subject"]
          subject_message_id?: string | null
          subject_user_id: string
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          escalated_case_id?: string | null
          id?: string
          reason?: string | null
          reporter_id?: string
          snapshot?: NonNullable<Json>
          status?: Database["public"]["Enums"]["report_status"]
          subject_kind?: Database["public"]["Enums"]["report_subject"]
          subject_message_id?: string | null
          subject_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_case_fk"
            columns: ["escalated_case_id"]
            isOneToOne: false
            referencedRelation: "platform_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_subject_message_id_fkey"
            columns: ["subject_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag_overrides: {
        Row: {
          enabled: boolean
          expires_at: string | null
          flag_key: string
          note: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          enabled: boolean
          expires_at?: string | null
          flag_key: string
          note?: string | null
          user_id: string
        }
        Update: {
          enabled?: boolean
          expires_at?: string | null
          flag_key?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_overrides_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "feature_flag_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string
          enabled_by_default: boolean
          key: string
        }
        ComputedFields: never
        Insert: {
          description: string
          enabled_by_default?: boolean
          key: string
        }
        Update: {
          description?: string
          enabled_by_default?: boolean
          key?: string
        }
        Relationships: []
      }
      flair_grant_rules: {
        Row: {
          community_id: string
          flair_id: string
        }
        ComputedFields: never
        Insert: {
          community_id: string
          flair_id: string
        }
        Update: {
          community_id?: string
          flair_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flair_grant_rules_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flair_grant_rules_flair_id_fkey"
            columns: ["flair_id"]
            isOneToOne: false
            referencedRelation: "flairs"
            referencedColumns: ["id"]
          },
        ]
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
          key: string
          label: string
          retired_at: string | null
        }
        ComputedFields: never
        Insert: {
          background_token?: string
          color_token?: string
          community_id?: string | null
          created_at?: string
          description?: string | null
          icon_key?: string | null
          id?: string
          key: string
          label: string
          retired_at?: string | null
        }
        Update: {
          background_token?: string
          color_token?: string
          community_id?: string | null
          created_at?: string
          description?: string | null
          icon_key?: string | null
          id?: string
          key?: string
          label?: string
          retired_at?: string | null
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
      friend_links: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          expiry_noticed_at: string | null
          id: string
          max_uses: number | null
          owner_id: string
          uses: number
        }
        ComputedFields: never
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          expiry_noticed_at?: string | null
          id?: string
          max_uses?: number | null
          owner_id: string
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          expiry_noticed_at?: string | null
          id?: string
          max_uses?: number | null
          owner_id?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "friend_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          recipient_id: string
          sender_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          recipient_id: string
          sender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          user_high_id: string
          user_low_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          user_high_id: string
          user_low_id: string
        }
        Update: {
          created_at?: string
          user_high_id?: string
          user_low_id?: string
        }
        Relationships: [
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
          created_by: string
          expires_at: string | null
          id: string
          max_uses: number | null
          uses: number
        }
        ComputedFields: never
        Insert: {
          code: string
          community_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          uses?: number
        }
        Update: {
          code?: string
          community_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          uses?: number
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
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      link_previews: {
        Row: {
          created_at: string
          description: string | null
          embed_id: string | null
          embed_provider: string | null
          error: string | null
          fetched_at: string | null
          id: string
          image_path: string | null
          site_name: string | null
          status: Database["public"]["Enums"]["link_preview_status"]
          title: string | null
          url: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          description?: string | null
          embed_id?: string | null
          embed_provider?: string | null
          error?: string | null
          fetched_at?: string | null
          id?: string
          image_path?: string | null
          site_name?: string | null
          status?: Database["public"]["Enums"]["link_preview_status"]
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          embed_id?: string | null
          embed_provider?: string | null
          error?: string | null
          fetched_at?: string | null
          id?: string
          image_path?: string | null
          site_name?: string | null
          status?: Database["public"]["Enums"]["link_preview_status"]
          title?: string | null
          url?: string
        }
        Relationships: []
      }
      media: {
        Row: {
          bucket: string
          created_at: string
          filename: string | null
          height: number | null
          id: string
          message_id: string | null
          mime_type: string
          object_path: string
          owner_id: string
          purpose: Database["public"]["Enums"]["media_purpose"]
          released_at: string | null
          scan_detail: Json | null
          scan_status: Database["public"]["Enums"]["media_scan_status"]
          scan_vendor: string | null
          scanned_at: string | null
          size_bytes: number
          status: Database["public"]["Enums"]["media_status"]
          width: number | null
          withheld_at: string | null
        }
        ComputedFields: never
        Insert: {
          bucket: string
          created_at?: string
          filename?: string | null
          height?: number | null
          id?: string
          message_id?: string | null
          mime_type: string
          object_path?: never
          owner_id: string
          purpose: Database["public"]["Enums"]["media_purpose"]
          released_at?: string | null
          scan_detail?: Json | null
          scan_status?: Database["public"]["Enums"]["media_scan_status"]
          scan_vendor?: string | null
          scanned_at?: string | null
          size_bytes: number
          status?: Database["public"]["Enums"]["media_status"]
          width?: number | null
          withheld_at?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          filename?: string | null
          height?: number | null
          id?: string
          message_id?: string | null
          mime_type?: string
          object_path?: never
          owner_id?: string
          purpose?: Database["public"]["Enums"]["media_purpose"]
          released_at?: string | null
          scan_detail?: Json | null
          scan_status?: Database["public"]["Enums"]["media_scan_status"]
          scan_vendor?: string | null
          scanned_at?: string | null
          size_bytes?: number
          status?: Database["public"]["Enums"]["media_status"]
          width?: number | null
          withheld_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_message_fk"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_roles: {
        Row: {
          assigned_at: string
          community_id: string
          role_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          assigned_at?: string
          community_id: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          community_id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_roles_community_id_user_id_fkey"
            columns: ["community_id", "user_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["community_id", "user_id"]
          },
          {
            foreignKeyName: "member_roles_role_id_community_id_fkey"
            columns: ["role_id", "community_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "community_id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
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
          author_id: string
          body: string
          channel_id: string
          created_at: string
          edited_at: string | null
          id: string
          link_preview_id: string | null
          nonce: string | null
          reply_to_id: string | null
        }
        ComputedFields: never
        Insert: {
          author_id: string
          body: string
          channel_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          link_preview_id?: string | null
          nonce?: string | null
          reply_to_id?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          channel_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          link_preview_id?: string | null
          nonce?: string | null
          reply_to_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
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
            foreignKeyName: "messages_link_preview_id_fkey"
            columns: ["link_preview_id"]
            isOneToOne: false
            referencedRelation: "link_previews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          in_app: boolean
          kind: Database["public"]["Enums"]["notification_kind"]
          push: boolean
          sound: boolean
          user_id: string
        }
        ComputedFields: never
        Insert: {
          in_app?: boolean
          kind: Database["public"]["Enums"]["notification_kind"]
          push?: boolean
          sound?: boolean
          user_id: string
        }
        Update: {
          in_app?: boolean
          kind?: Database["public"]["Enums"]["notification_kind"]
          push?: boolean
          sound?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string
          case_id: string | null
          channel_id: string | null
          community_id: string | null
          created_at: string
          dismissed_at: string | null
          id: string
          in_app: boolean
          kind: Database["public"]["Enums"]["notification_kind"]
          message_id: string | null
          push: boolean
          read_at: string | null
          recipient_id: string
          seen_at: string | null
          sound: boolean
          title: string
        }
        ComputedFields: never
        Insert: {
          actor_id?: string | null
          body: string
          case_id?: string | null
          channel_id?: string | null
          community_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          in_app: boolean
          kind: Database["public"]["Enums"]["notification_kind"]
          message_id?: string | null
          push: boolean
          read_at?: string | null
          recipient_id: string
          seen_at?: string | null
          sound: boolean
          title: string
        }
        Update: {
          actor_id?: string | null
          body?: string
          case_id?: string | null
          channel_id?: string | null
          community_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          in_app?: boolean
          kind?: Database["public"]["Enums"]["notification_kind"]
          message_id?: string | null
          push?: boolean
          read_at?: string | null
          recipient_id?: string
          seen_at?: string | null
          sound?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "platform_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_channel_fk"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_community_fk"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_message_fk"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_campaigns: {
        Row: {
          active: boolean
          community_id: string | null
          description: string | null
          distributions: string[]
          ends_at: string | null
          flag_key: string | null
          flair_id: string | null
          key: string
          max_app_version: string | null
          min_app_version: string | null
          platforms: string[]
          required: boolean
          sort_order: number
          starts_at: string | null
          title: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          community_id?: string | null
          description?: string | null
          distributions?: string[]
          ends_at?: string | null
          flag_key?: string | null
          flair_id?: string | null
          key: string
          max_app_version?: string | null
          min_app_version?: string | null
          platforms?: string[]
          required?: boolean
          sort_order?: number
          starts_at?: string | null
          title: string
        }
        Update: {
          active?: boolean
          community_id?: string | null
          description?: string | null
          distributions?: string[]
          ends_at?: string | null
          flag_key?: string | null
          flair_id?: string | null
          key?: string
          max_app_version?: string | null
          min_app_version?: string | null
          platforms?: string[]
          required?: boolean
          sort_order?: number
          starts_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_campaigns_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_campaigns_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "onboarding_campaigns_flair_id_fkey"
            columns: ["flair_id"]
            isOneToOne: false
            referencedRelation: "flairs"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          answered_at: string
          campaign_key: string
          outcome: Database["public"]["Enums"]["onboarding_outcome"]
          user_id: string
        }
        ComputedFields: never
        Insert: {
          answered_at?: string
          campaign_key: string
          outcome: Database["public"]["Enums"]["onboarding_outcome"]
          user_id: string
        }
        Update: {
          answered_at?: string
          campaign_key?: string
          outcome?: Database["public"]["Enums"]["onboarding_outcome"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_campaign_key_fkey"
            columns: ["campaign_key"]
            isOneToOne: false
            referencedRelation: "onboarding_campaigns"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "onboarding_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_releases: {
        Row: {
          active: boolean
          bundle_url: string
          channel: string
          created_at: string
          git_sha: string | null
          id: string
          manifest_url: string | null
          note: string | null
          runtime_version: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          bundle_url: string
          channel: string
          created_at?: string
          git_sha?: string | null
          id?: string
          manifest_url?: string | null
          note?: string | null
          runtime_version: string
        }
        Update: {
          active?: boolean
          bundle_url?: string
          channel?: string
          created_at?: string
          git_sha?: string | null
          id?: string
          manifest_url?: string | null
          note?: string | null
          runtime_version?: string
        }
        Relationships: []
      }
      platform_case_decisions: {
        Row: {
          actions: Database["public"]["Enums"]["case_action"][]
          case_id: string
          created_at: string
          decided_by: string
          id: string
          reason: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          rule: string | null
        }
        ComputedFields: never
        Insert: {
          actions?: Database["public"]["Enums"]["case_action"][]
          case_id: string
          created_at?: string
          decided_by: string
          id?: string
          reason?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          rule?: string | null
        }
        Update: {
          actions?: Database["public"]["Enums"]["case_action"][]
          case_id?: string
          created_at?: string
          decided_by?: string
          id?: string
          reason?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          rule?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_case_decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "platform_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_case_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_case_decisions_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_case_events: {
        Row: {
          actor_id: string | null
          case_id: string
          created_at: string
          detail: NonNullable<Json>
          id: string
          kind: Database["public"]["Enums"]["case_event_kind"]
        }
        ComputedFields: never
        Insert: {
          actor_id?: string | null
          case_id: string
          created_at?: string
          detail?: NonNullable<Json>
          id?: string
          kind: Database["public"]["Enums"]["case_event_kind"]
        }
        Update: {
          actor_id?: string | null
          case_id?: string
          created_at?: string
          detail?: NonNullable<Json>
          id?: string
          kind?: Database["public"]["Enums"]["case_event_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "platform_case_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "platform_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_cases: {
        Row: {
          community_id: string | null
          community_report_id: string | null
          created_at: string
          csam_flagged_at: string | null
          csam_flagged_by: string | null
          id: string
          ncmec_report_id: string | null
          preserve_until: string | null
          reason: string | null
          reporter_id: string | null
          snapshot: NonNullable<Json>
          source: Database["public"]["Enums"]["case_source"]
          status: Database["public"]["Enums"]["case_status"]
          subject_message_id: string | null
          subject_user_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          community_id?: string | null
          community_report_id?: string | null
          created_at?: string
          csam_flagged_at?: string | null
          csam_flagged_by?: string | null
          id?: string
          ncmec_report_id?: string | null
          preserve_until?: string | null
          reason?: string | null
          reporter_id?: string | null
          snapshot: NonNullable<Json>
          source: Database["public"]["Enums"]["case_source"]
          status?: Database["public"]["Enums"]["case_status"]
          subject_message_id?: string | null
          subject_user_id: string
          updated_at?: string
        }
        Update: {
          community_id?: string | null
          community_report_id?: string | null
          created_at?: string
          csam_flagged_at?: string | null
          csam_flagged_by?: string | null
          id?: string
          ncmec_report_id?: string | null
          preserve_until?: string | null
          reason?: string | null
          reporter_id?: string | null
          snapshot?: NonNullable<Json>
          source?: Database["public"]["Enums"]["case_source"]
          status?: Database["public"]["Enums"]["case_status"]
          subject_message_id?: string | null
          subject_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_cases_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_cases_community_report_id_fkey"
            columns: ["community_report_id"]
            isOneToOne: false
            referencedRelation: "community_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_cases_csam_flagged_by_fkey"
            columns: ["csam_flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_cases_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_cases_subject_message_id_fkey"
            columns: ["subject_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_cases_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_staff: {
        Row: {
          active: boolean
          can_review_csam: boolean
          created_at: string
          note: string | null
          person_id: string | null
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          can_review_csam?: boolean
          created_at?: string
          note?: string | null
          person_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          can_review_csam?: boolean
          created_at?: string
          note?: string | null
          person_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_staff_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
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
          active_flair_id: string | null
          avatar_media_id: string | null
          bio: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_staff: boolean
          updated_at: string
          username: string | null
        }
        ComputedFields: never
        Insert: {
          active_flair_id?: string | null
          avatar_media_id?: string | null
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          id: string
          is_staff?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          active_flair_id?: string | null
          avatar_media_id?: string | null
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_staff?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_flair_id_fkey"
            columns: ["active_flair_id"]
            isOneToOne: false
            referencedRelation: "flairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_avatar_media_fk"
            columns: ["avatar_media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
        ]
      }
      push_devices: {
        Row: {
          created_at: string
          id: string
          installation_id: string | null
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          installation_id?: string | null
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          installation_id?: string | null
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          community_id: string
          permission: Database["public"]["Enums"]["community_permission"]
          role_id: string
        }
        ComputedFields: never
        Insert: {
          community_id: string
          permission: Database["public"]["Enums"]["community_permission"]
          role_id: string
        }
        Update: {
          community_id?: string
          permission?: Database["public"]["Enums"]["community_permission"]
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_community_id_fkey"
            columns: ["role_id", "community_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "community_id"]
          },
        ]
      }
      roles: {
        Row: {
          color: string
          community_id: string
          created_at: string
          id: string
          is_everyone: boolean
          name: string
          position: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          color?: string
          community_id: string
          created_at?: string
          id?: string
          is_everyone?: boolean
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          community_id?: string
          created_at?: string
          id?: string
          is_everyone?: boolean
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
      terms_acceptances: {
        Row: {
          accepted_at: string
          user_id: string
          version: string
        }
        ComputedFields: never
        Insert: {
          accepted_at?: string
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_acceptances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_acceptances_version_fkey"
            columns: ["version"]
            isOneToOne: false
            referencedRelation: "terms_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      terms_versions: {
        Row: {
          published_at: string
          version: string
        }
        ComputedFields: never
        Insert: {
          published_at?: string
          version: string
        }
        Update: {
          published_at?: string
          version?: string
        }
        Relationships: []
      }
      user_flairs: {
        Row: {
          expires_at: string | null
          flair_id: string
          granted_at: string
          source: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          expires_at?: string | null
          flair_id: string
          granted_at?: string
          source: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          flair_id?: string
          granted_at?: string
          source?: string
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
            foreignKeyName: "user_flairs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          details_visible_to: Database["public"]["Enums"]["audience"]
          dms_from: Database["public"]["Enums"]["audience"]
          friend_requests_from: Database["public"]["Enums"]["audience"]
          theme: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          details_visible_to?: Database["public"]["Enums"]["audience"]
          dms_from?: Database["public"]["Enums"]["audience"]
          friend_requests_from?: Database["public"]["Enums"]["audience"]
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          details_visible_to?: Database["public"]["Enums"]["audience"]
          dms_from?: Database["public"]["Enums"]["audience"]
          friend_requests_from?: Database["public"]["Enums"]["audience"]
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
      accept_terms: { Args: { p_version: string }; Returns: undefined }
      add_community_report_note: {
        Args: { p_body: string; p_report_id: string }
        Returns: {
          author_id: string
          body: string
          created_at: string
          id: string
          report_id: string
        }
        SetofOptions: {
          from: "*"
          to: "community_report_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      answer_friend_link: {
        Args: { p_accept: boolean; p_code: string }
        Returns: undefined
      }
      answer_friend_request: {
        Args: { p_accept: boolean; p_request_id: string }
        Returns: undefined
      }
      answer_onboarding: {
        Args: {
          p_app_version?: string
          p_campaign_key: string
          p_distribution?: string
          p_outcome: Database["public"]["Enums"]["onboarding_outcome"]
          p_platform: string
        }
        Returns: undefined
      }
      auth_hook_access_token: { Args: { event: Json }; Returns: Json }
      ban_member: {
        Args: { p_community_id: string; p_reason: string; p_user_id: string }
        Returns: undefined
      }
      block_user: { Args: { p_user_id: string }; Returns: undefined }
      create_channel: {
        Args: {
          p_category_id?: string
          p_community_id: string
          p_kind: Database["public"]["Enums"]["channel_kind"]
          p_name: string
          p_topic?: string
        }
        Returns: {
          category_id: string | null
          community_id: string | null
          created_at: string
          direct_key: string | null
          id: string
          kind: Database["public"]["Enums"]["channel_kind"]
          latest_message_id: string | null
          name: string | null
          position: number
          topic: string | null
        }
        SetofOptions: {
          from: "*"
          to: "channels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_community: {
        Args: { p_description?: string; p_name: string }
        Returns: {
          created_at: string
          description: string | null
          id: string
          invites_enabled: boolean
          name: string
          owner_id: string
          report_reason_required: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "communities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_friend_link: {
        Args: { p_expires_in_hours?: number; p_max_uses?: number }
        Returns: {
          code: string
          created_at: string
          expires_at: string
          expiry_noticed_at: string | null
          id: string
          max_uses: number | null
          owner_id: string
          uses: number
        }
        SetofOptions: {
          from: "*"
          to: "friend_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_invite: {
        Args: {
          p_community_id: string
          p_expires_in_hours?: number
          p_max_uses?: number
        }
        Returns: {
          code: string
          community_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          max_uses: number | null
          uses: number
        }
        SetofOptions: {
          from: "*"
          to: "invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_role: {
        Args: {
          p_color?: string
          p_community_id: string
          p_name: string
          p_position?: number
        }
        Returns: {
          color: string
          community_id: string
          created_at: string
          id: string
          is_everyone: boolean
          name: string
          position: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "roles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_upload: {
        Args: {
          p_filename?: string
          p_height?: number
          p_mime_type: string
          p_purpose: Database["public"]["Enums"]["media_purpose"]
          p_size_bytes: number
          p_width?: number
        }
        Returns: Database["public"]["CompositeTypes"]["media_record"]
        SetofOptions: {
          from: "*"
          to: "media_record"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_category: { Args: { p_category_id: string }; Returns: undefined }
      delete_channel: { Args: { p_channel_id: string }; Returns: undefined }
      delete_community: { Args: { p_community_id: string }; Returns: undefined }
      delete_message: { Args: { p_message_id: string }; Returns: undefined }
      delete_my_account: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      delete_role: { Args: { p_role_id: string }; Returns: undefined }
      edit_message: {
        Args: { p_body: string; p_message_id: string }
        Returns: Database["public"]["CompositeTypes"]["message_record"]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      escalate_community_report: {
        Args: { p_reason?: string; p_report_id: string }
        Returns: string
      }
      file_community_report: {
        Args: {
          p_community_id: string
          p_reason?: string
          p_subject_id: string
          p_subject_kind: Database["public"]["Enums"]["report_subject"]
        }
        Returns: string
      }
      file_platform_case: {
        Args: {
          p_reason?: string
          p_subject_id: string
          p_subject_kind: Database["public"]["Enums"]["case_source"]
        }
        Returns: string
      }
      find_user: {
        Args: { p_username: string }
        Returns: Database["public"]["CompositeTypes"]["profile_record"][]
        SetofOptions: {
          from: "*"
          to: "profile_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_friend_link: {
        Args: { p_code: string }
        Returns: Database["public"]["CompositeTypes"]["friend_link_record"]
        SetofOptions: {
          from: "*"
          to: "friend_link_record"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_latest_messages: {
        Args: { p_channel_ids: string[] }
        Returns: Database["public"]["CompositeTypes"]["message_record"][]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_messages: {
        Args: { p_message_ids: string[] }
        Returns: Database["public"]["CompositeTypes"]["message_record"][]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_feature_flags: {
        Args: Record<PropertyKey, never>
        Returns: {
          enabled: boolean
          key: string
        }[]
      }
      get_my_permissions: {
        Args: { p_community_id: string }
        Returns: Database["public"]["Enums"]["community_permission"][]
      }
      get_my_profile: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["CompositeTypes"]["my_profile_record"][]
        SetofOptions: {
          from: "*"
          to: "my_profile_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_profile_card: {
        Args: { p_user_id: string }
        Returns: Database["public"]["CompositeTypes"]["profile_card_record"]
        SetofOptions: {
          from: "*"
          to: "profile_card_record"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_profiles: {
        Args: { p_user_ids: string[] }
        Returns: Database["public"]["CompositeTypes"]["profile_record"][]
        SetofOptions: {
          from: "*"
          to: "profile_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_unread_counts: {
        Args: Record<PropertyKey, never>
        Returns: {
          channel_id: string
          unread: number
        }[]
      }
      get_voice_access: {
        Args: { p_channel_id: string }
        Returns: {
          can_moderate: boolean
          channel_id: string
          channel_name: string
          community_id: string
          user_id: string
          username: string
        }[]
      }
      join_community: {
        Args: { p_code: string }
        Returns: {
          created_at: string
          description: string | null
          id: string
          invites_enabled: boolean
          name: string
          owner_id: string
          report_reason_required: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "communities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kick_member: {
        Args: { p_community_id: string; p_user_id: string }
        Returns: undefined
      }
      leave_community: { Args: { p_community_id: string }; Returns: undefined }
      list_community_reports: {
        Args: { p_community_id: string }
        Returns: Database["public"]["CompositeTypes"]["community_report_record"][]
        SetofOptions: {
          from: "*"
          to: "community_report_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_decisions_about_me: {
        Args: Record<PropertyKey, never>
        Returns: {
          actions: Database["public"]["Enums"]["case_action"][]
          case_id: string
          decided_at: string
          reason: string
          restricted_until: string
          rule: string
        }[]
      }
      list_messages: {
        Args: {
          p_after_id?: string
          p_before_id?: string
          p_channel_id: string
          p_limit?: number
        }
        Returns: Database["public"]["CompositeTypes"]["message_record"][]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_my_onboarding: {
        Args: {
          p_app_version?: string
          p_distribution?: string
          p_platform: string
        }
        Returns: {
          active: boolean
          community_id: string | null
          description: string | null
          distributions: string[]
          ends_at: string | null
          flag_key: string | null
          flair_id: string | null
          key: string
          max_app_version: string | null
          min_app_version: string | null
          platforms: string[]
          required: boolean
          sort_order: number
          starts_at: string | null
          title: string
        }[]
        SetofOptions: {
          from: "*"
          to: "onboarding_campaigns"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_my_reports: {
        Args: Record<PropertyKey, never>
        Returns: {
          audience: string
          created_at: string
          id: string
          status: string
          updated_at: string
        }[]
      }
      mark_channel_read: {
        Args: { p_channel_id: string; p_message_id: string }
        Returns: undefined
      }
      mark_notifications: {
        Args: {
          p_ids?: string[]
          p_mark: Database["public"]["Enums"]["notification_mark"]
        }
        Returns: number
      }
      move_channel: {
        Args: {
          p_category_id: string
          p_channel_id: string
          p_position: number
        }
        Returns: {
          category_id: string | null
          community_id: string | null
          created_at: string
          direct_key: string | null
          id: string
          kind: Database["public"]["Enums"]["channel_kind"]
          latest_message_id: string | null
          name: string | null
          position: number
          topic: string | null
        }
        SetofOptions: {
          from: "*"
          to: "channels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mute_channel: {
        Args: { p_channel_id: string; p_until: string }
        Returns: undefined
      }
      open_dm: {
        Args: { p_user_id: string }
        Returns: {
          category_id: string | null
          community_id: string | null
          created_at: string
          direct_key: string | null
          id: string
          kind: Database["public"]["Enums"]["channel_kind"]
          latest_message_id: string | null
          name: string | null
          position: number
          topic: string | null
        }
        SetofOptions: {
          from: "*"
          to: "channels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refresh_link_preview: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      register_push_device: {
        Args: {
          p_installation_id?: string
          p_platform: string
          p_token: string
        }
        Returns: {
          created_at: string
          id: string
          installation_id: string | null
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "push_devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_friend: { Args: { p_user_id: string }; Returns: undefined }
      revoke_friend_link: { Args: { p_link_id: string }; Returns: undefined }
      revoke_invite: { Args: { p_invite_id: string }; Returns: undefined }
      save_category: {
        Args: {
          p_category_id?: string
          p_community_id: string
          p_name: string
          p_position?: number
        }
        Returns: {
          community_id: string
          created_at: string
          id: string
          name: string
          position: number
        }
        SetofOptions: {
          from: "*"
          to: "channel_categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_friend_request: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          id: string
          recipient_id: string
          sender_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "friend_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      send_message: {
        Args: {
          p_attachment_ids?: string[]
          p_body: string
          p_channel_id: string
          p_nonce?: string
          p_reply_to_id?: string
        }
        Returns: Database["public"]["CompositeTypes"]["message_record"]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_voice_control: {
        Args: {
          p_action: Database["public"]["Enums"]["voice_control_action"]
          p_channel_id: string
          p_session_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      set_active_flair: { Args: { p_flair_id: string }; Returns: undefined }
      set_category_collapsed: {
        Args: { p_category_id: string; p_collapsed: boolean }
        Returns: undefined
      }
      set_channel_overwrite: {
        Args: {
          p_can_manage: boolean
          p_can_send: boolean
          p_can_view: boolean
          p_channel_id: string
          p_role_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      set_community_report_status: {
        Args: {
          p_report_id: string
          p_status: Database["public"]["Enums"]["report_status"]
        }
        Returns: undefined
      }
      set_member_roles: {
        Args: {
          p_community_id: string
          p_role_ids: string[]
          p_user_id: string
        }
        Returns: undefined
      }
      set_my_avatar: {
        Args: { p_media_id: string }
        Returns: Database["public"]["CompositeTypes"]["profile_record"]
        SetofOptions: {
          from: "*"
          to: "profile_record"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_nickname: {
        Args: { p_community_id: string; p_nickname: string; p_user_id: string }
        Returns: {
          community_id: string
          joined_at: string
          nickname: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "community_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_notification_preference: {
        Args: {
          p_in_app: boolean
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_push: boolean
          p_sound: boolean
        }
        Returns: {
          in_app: boolean
          kind: Database["public"]["Enums"]["notification_kind"]
          push: boolean
          sound: boolean
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notification_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_reaction: {
        Args: { p_emoji: string; p_message_id: string; p_on: boolean }
        Returns: undefined
      }
      set_role_permissions: {
        Args: {
          p_permissions: Database["public"]["Enums"]["community_permission"][]
          p_role_id: string
        }
        Returns: undefined
      }
      staff_add_case_note: {
        Args: { p_body: string; p_case_id: string }
        Returns: undefined
      }
      staff_case_people: {
        Args: { p_case_id: string }
        Returns: Database["public"]["CompositeTypes"]["profile_record"][]
        SetofOptions: {
          from: "*"
          to: "profile_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      staff_flag_csam: { Args: { p_case_id: string }; Returns: undefined }
      staff_record_decision: {
        Args: {
          p_actions: Database["public"]["Enums"]["case_action"][]
          p_case_id: string
          p_reason?: string
          p_rule?: string
          p_suspend_days?: number
        }
        Returns: string
      }
      staff_record_ncmec_report: {
        Args: { p_case_id: string; p_ncmec_report_id: string }
        Returns: undefined
      }
      staff_reverse_decision: {
        Args: { p_decision_id: string; p_reason: string }
        Returns: undefined
      }
      staff_set_case_status: {
        Args: {
          p_case_id: string
          p_status: Database["public"]["Enums"]["case_status"]
        }
        Returns: undefined
      }
      staff_view_case_media: {
        Args: { p_case_id: string; p_media_id: string }
        Returns: {
          bucket: string
          object_path: string
        }[]
      }
      transfer_ownership: {
        Args: { p_community_id: string; p_user_id: string }
        Returns: {
          created_at: string
          description: string | null
          id: string
          invites_enabled: boolean
          name: string
          owner_id: string
          report_reason_required: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "communities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unban_member: {
        Args: { p_community_id: string; p_user_id: string }
        Returns: undefined
      }
      unblock_user: { Args: { p_user_id: string }; Returns: undefined }
      unregister_push_device: { Args: { p_token: string }; Returns: undefined }
      update_channel: {
        Args: { p_channel_id: string; p_name?: string; p_topic?: string }
        Returns: {
          category_id: string | null
          community_id: string | null
          created_at: string
          direct_key: string | null
          id: string
          kind: Database["public"]["Enums"]["channel_kind"]
          latest_message_id: string | null
          name: string | null
          position: number
          topic: string | null
        }
        SetofOptions: {
          from: "*"
          to: "channels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_community: {
        Args: {
          p_community_id: string
          p_description?: string
          p_invites_enabled?: boolean
          p_name?: string
          p_report_reason_required?: boolean
        }
        Returns: {
          created_at: string
          description: string | null
          id: string
          invites_enabled: boolean
          name: string
          owner_id: string
          report_reason_required: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "communities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_my_profile: {
        Args: { p_bio?: string; p_username?: string }
        Returns: Database["public"]["CompositeTypes"]["profile_record"]
        SetofOptions: {
          from: "*"
          to: "profile_record"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_my_settings: {
        Args: {
          p_details_visible_to?: Database["public"]["Enums"]["audience"]
          p_dms_from?: Database["public"]["Enums"]["audience"]
          p_friend_requests_from?: Database["public"]["Enums"]["audience"]
          p_theme?: string
        }
        Returns: {
          details_visible_to: Database["public"]["Enums"]["audience"]
          dms_from: Database["public"]["Enums"]["audience"]
          friend_requests_from: Database["public"]["Enums"]["audience"]
          theme: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_role: {
        Args: {
          p_color?: string
          p_name?: string
          p_position?: number
          p_role_id: string
        }
        Returns: {
          color: string
          community_id: string
          created_at: string
          id: string
          is_everyone: boolean
          name: string
          position: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "roles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      username_taken: { Args: { p_username: string }; Returns: boolean }
      worker_claim_jobs: {
        Args: { p_kind: string; p_lease_seconds?: number; p_limit?: number }
        Returns: {
          attempts: number
          id: string
          kind: string
          payload: Json
        }[]
      }
      worker_email_content: {
        Args: { p_case_id: string; p_decision_id?: string; p_template: string }
        Returns: {
          body: string
          subject: string
          to_email: string
        }[]
      }
      worker_finish_job: {
        Args: { p_error?: string; p_job_id: string }
        Returns: undefined
      }
      worker_link_preview_result: {
        Args: {
          p_description?: string
          p_embed_id?: string
          p_embed_provider?: string
          p_error?: string
          p_image_path?: string
          p_preview_id: string
          p_site_name?: string
          p_status: Database["public"]["Enums"]["link_preview_status"]
          p_title?: string
        }
        Returns: undefined
      }
      worker_link_preview_url: {
        Args: { p_preview_id: string }
        Returns: string
      }
      worker_media_deleted: { Args: { p_media_id: string }; Returns: undefined }
      worker_media_quarantined: {
        Args: { p_media_id: string }
        Returns: undefined
      }
      worker_media_to_delete: {
        Args: { p_media_id: string }
        Returns: {
          bucket: string
          object_path: string
        }[]
      }
      worker_media_to_quarantine: {
        Args: { p_media_id: string }
        Returns: {
          bucket: string
          object_path: string
        }[]
      }
      worker_push_delivery: {
        Args: { p_notification_id: string }
        Returns: {
          body: string
          data: Json
          platform: string
          title: string
          token: string
        }[]
      }
      worker_push_token_invalid: {
        Args: { p_token: string }
        Returns: undefined
      }
      worker_record_media_scan: {
        Args: {
          p_detail?: Json
          p_media_id: string
          p_status: Database["public"]["Enums"]["media_scan_status"]
          p_vendor: string
        }
        Returns: string
      }
    }
    Enums: {
      audience: "nobody" | "friends" | "community" | "everyone"
      audit_action:
        | "member_kicked"
        | "member_banned"
        | "member_unbanned"
        | "message_removed"
        | "roles_assigned"
        | "role_changed"
        | "channel_changed"
        | "community_changed"
        | "ownership_transferred"
      case_action: "content_removed" | "user_suspended" | "user_banned"
      case_event_kind:
        | "filed"
        | "status_changed"
        | "note"
        | "decision"
        | "decision_reversed"
        | "csam_flagged"
        | "ncmec_recorded"
        | "media_viewed"
        | "media_quarantined"
      case_source: "message" | "profile" | "escalation" | "media_scan"
      case_status: "open" | "in_review" | "actioned" | "no_action" | "dismissed"
      channel_kind: "text" | "voice" | "dm"
      community_permission:
        | "view_channels"
        | "send_messages"
        | "manage_channels"
        | "manage_channel_permissions"
        | "manage_messages"
        | "manage_members"
        | "manage_roles"
        | "manage_community"
        | "manage_invites"
        | "manage_bans"
        | "create_reports"
        | "manage_reports"
        | "view_hidden_messages"
        | "view_audit_log"
      link_preview_status: "pending" | "ready" | "unsupported" | "failed"
      media_purpose: "attachment" | "avatar"
      media_scan_status: "not_scanned" | "pending" | "clear" | "match" | "error"
      media_status: "pending" | "attached" | "released"
      notification_kind:
        | "friend_request"
        | "friend_accepted"
        | "friend_link"
        | "direct_message"
        | "mention"
        | "report_received"
        | "report_outcome"
        | "moderation_decision"
        | "system"
      notification_mark: "seen" | "read" | "dismissed"
      onboarding_outcome: "completed" | "skipped"
      report_status:
        | "open"
        | "in_review"
        | "resolved"
        | "dismissed"
        | "escalated"
      report_subject: "message" | "member"
      voice_control_action: "mute" | "unmute" | "deafen" | "undeafen" | "remove"
    }
    CompositeTypes: {
      community_report_record: {
        id: string | null
        community_id: string | null
        subject_kind: Database["public"]["Enums"]["report_subject"] | null
        subject_user_id: string | null
        subject_message_id: string | null
        reason: string | null
        snapshot: Json | null
        status: Database["public"]["Enums"]["report_status"] | null
        created_at: string | null
        updated_at: string | null
      }
      friend_link_record: {
        owner_id: string | null
        username: string | null
        avatar_media_id: string | null
        already_friends: boolean | null
      }
      media_record: {
        id: string | null
        bucket: string | null
        object_path: string | null
        filename: string | null
        mime_type: string | null
        size_bytes: number | null
        width: number | null
        height: number | null
      }
      message_record: {
        id: string | null
        channel_id: string | null
        community_id: string | null
        author_id: string | null
        body: string | null
        reply_to_id: string | null
        created_at: string | null
        edited_at: string | null
        hidden: boolean | null
        attachments: Json | null
        reactions: Json | null
        link_preview: Json | null
        nonce: string | null
      }
      my_profile_record: {
        bio: string | null
        active_flair_id: string | null
      }
      profile_card_record: {
        id: string | null
        username: string | null
        avatar_media_id: string | null
        is_staff: boolean | null
        deleted: boolean | null
        details_visible: boolean | null
        bio: string | null
        flair: Json | null
        mutual_community_names: string[] | null
        is_friend: boolean | null
        can_message: boolean | null
        can_friend_request: boolean | null
      }
      profile_record: {
        id: string | null
        username: string | null
        avatar_media_id: string | null
        is_staff: boolean | null
        deleted: boolean | null
      }
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
      audience: ["nobody", "friends", "community", "everyone"],
      audit_action: [
        "member_kicked",
        "member_banned",
        "member_unbanned",
        "message_removed",
        "roles_assigned",
        "role_changed",
        "channel_changed",
        "community_changed",
        "ownership_transferred",
      ],
      case_action: ["content_removed", "user_suspended", "user_banned"],
      case_event_kind: [
        "filed",
        "status_changed",
        "note",
        "decision",
        "decision_reversed",
        "csam_flagged",
        "ncmec_recorded",
        "media_viewed",
        "media_quarantined",
      ],
      case_source: ["message", "profile", "escalation", "media_scan"],
      case_status: ["open", "in_review", "actioned", "no_action", "dismissed"],
      channel_kind: ["text", "voice", "dm"],
      community_permission: [
        "view_channels",
        "send_messages",
        "manage_channels",
        "manage_channel_permissions",
        "manage_messages",
        "manage_members",
        "manage_roles",
        "manage_community",
        "manage_invites",
        "manage_bans",
        "create_reports",
        "manage_reports",
        "view_hidden_messages",
        "view_audit_log",
      ],
      link_preview_status: ["pending", "ready", "unsupported", "failed"],
      media_purpose: ["attachment", "avatar"],
      media_scan_status: ["not_scanned", "pending", "clear", "match", "error"],
      media_status: ["pending", "attached", "released"],
      notification_kind: [
        "friend_request",
        "friend_accepted",
        "friend_link",
        "direct_message",
        "mention",
        "report_received",
        "report_outcome",
        "moderation_decision",
        "system",
      ],
      notification_mark: ["seen", "read", "dismissed"],
      onboarding_outcome: ["completed", "skipped"],
      report_status: [
        "open",
        "in_review",
        "resolved",
        "dismissed",
        "escalated",
      ],
      report_subject: ["message", "member"],
      voice_control_action: ["mute", "unmute", "deafen", "undeafen", "remove"],
    },
  },
} as const
