// ============================================================
// טיפוסי מסד הנתונים – נוצרו אוטומטית מהסכימה (supabase/migrations).
// אין לערוך ידנית. ליצירה מחדש: npm run db:types
// ============================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      activity_log: {
        Row: {
          id: number;
          profile_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          profile_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: number;
          profile_id?: string | null;
          action?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_log_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      app_secrets: {
        Row: {
          key: string;
          value: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: string;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      auth_sessions: {
        Row: {
          id: string;
          profile_id: string;
          token_hash: string;
          user_agent: string | null;
          ip_address: string | null;
          created_at: string;
          last_used_at: string;
          expires_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          token_hash: string;
          user_agent?: string | null;
          ip_address?: string | null;
          created_at?: string;
          last_used_at?: string;
          expires_at: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          profile_id?: string;
          token_hash?: string;
          user_agent?: string | null;
          ip_address?: string | null;
          created_at?: string;
          last_used_at?: string;
          expires_at?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "auth_sessions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      blocked_users: {
        Row: {
          blocker_id: string;
          blocked_id: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          blocker_id: string;
          blocked_id: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          blocker_id?: string;
          blocked_id?: string;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey";
            columns: ["blocked_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_status_history: {
        Row: {
          id: string;
          booking_id: string;
          from_status: Database["public"]["Enums"]["booking_status"] | null;
          to_status: Database["public"]["Enums"]["booking_status"];
          changed_by: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          from_status?: Database["public"]["Enums"]["booking_status"] | null;
          to_status: Database["public"]["Enums"]["booking_status"];
          changed_by?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          from_status?: Database["public"]["Enums"]["booking_status"] | null;
          to_status?: Database["public"]["Enums"]["booking_status"];
          changed_by?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_status_history_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          id: string;
          client_id: string;
          professional_id: string;
          service_id: string;
          address_id: string | null;
          conversation_id: string | null;
          series_id: string | null;
          source_post_id: string | null;
          location_type: Database["public"]["Enums"]["booking_location_type"];
          status: Database["public"]["Enums"]["booking_status"];
          scheduled_start: string;
          scheduled_end: string;
          duration_minutes: number;
          buffer_minutes: number;
          blocked_until: string;
          price_type: Database["public"]["Enums"]["price_type"];
          price_amount: number | null;
          travel_fee: number;
          total_price: number | null;
          currency: string;
          people_count: number;
          notes: string | null;
          inspiration_url: string | null;
          event_address: string | null;
          proposed_start: string | null;
          proposed_price: number | null;
          proposed_by: string | null;
          proposed_note: string | null;
          guardian_approved: boolean;
          guardian_contact: string | null;
          shared_with_contact: string | null;
          address_revealed: boolean;
          confirmed_at: string | null;
          on_the_way_at: string | null;
          arrived_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancel_reason: string | null;
          reminder_24h_sent_at: string | null;
          reminder_2h_sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          professional_id: string;
          service_id: string;
          address_id?: string | null;
          conversation_id?: string | null;
          series_id?: string | null;
          source_post_id?: string | null;
          location_type?: Database["public"]["Enums"]["booking_location_type"];
          status?: Database["public"]["Enums"]["booking_status"];
          scheduled_start: string;
          scheduled_end: string;
          duration_minutes: number;
          buffer_minutes?: number;
          blocked_until?: string;
          price_type?: Database["public"]["Enums"]["price_type"];
          price_amount?: number | null;
          travel_fee?: number;
          currency?: string;
          people_count?: number;
          notes?: string | null;
          inspiration_url?: string | null;
          event_address?: string | null;
          proposed_start?: string | null;
          proposed_price?: number | null;
          proposed_by?: string | null;
          proposed_note?: string | null;
          guardian_approved?: boolean;
          guardian_contact?: string | null;
          shared_with_contact?: string | null;
          address_revealed?: boolean;
          confirmed_at?: string | null;
          on_the_way_at?: string | null;
          arrived_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cancel_reason?: string | null;
          reminder_24h_sent_at?: string | null;
          reminder_2h_sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          professional_id?: string;
          service_id?: string;
          address_id?: string | null;
          conversation_id?: string | null;
          series_id?: string | null;
          source_post_id?: string | null;
          location_type?: Database["public"]["Enums"]["booking_location_type"];
          status?: Database["public"]["Enums"]["booking_status"];
          scheduled_start?: string;
          scheduled_end?: string;
          duration_minutes?: number;
          buffer_minutes?: number;
          blocked_until?: string;
          price_type?: Database["public"]["Enums"]["price_type"];
          price_amount?: number | null;
          travel_fee?: number;
          currency?: string;
          people_count?: number;
          notes?: string | null;
          inspiration_url?: string | null;
          event_address?: string | null;
          proposed_start?: string | null;
          proposed_price?: number | null;
          proposed_by?: string | null;
          proposed_note?: string | null;
          guardian_approved?: boolean;
          guardian_contact?: string | null;
          shared_with_contact?: string | null;
          address_revealed?: boolean;
          confirmed_at?: string | null;
          on_the_way_at?: string | null;
          arrived_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cancel_reason?: string | null;
          reminder_24h_sent_at?: string | null;
          reminder_2h_sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_address_id_fkey";
            columns: ["address_id"];
            isOneToOne: false;
            referencedRelation: "service_addresses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_cancelled_by_fkey";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_proposed_by_fkey";
            columns: ["proposed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_series_id_fkey";
            columns: ["series_id"];
            isOneToOne: false;
            referencedRelation: "recurring_booking_series";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "professional_services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_source_post_id_fkey";
            columns: ["source_post_id"];
            isOneToOne: false;
            referencedRelation: "professional_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      cities: {
        Row: {
          id: string;
          name: string;
          name_norm: string | null;
          district: string | null;
          latitude: number | null;
          longitude: number | null;
          population: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          district?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          population?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          district?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          population?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
        ];
      };
      conversation_members: {
        Row: {
          conversation_id: string;
          profile_id: string;
          joined_at: string;
          last_read_at: string;
          is_muted: boolean;
          is_archived: boolean;
          left_at: string | null;
        };
        Insert: {
          conversation_id: string;
          profile_id: string;
          joined_at?: string;
          last_read_at?: string;
          is_muted?: boolean;
          is_archived?: boolean;
          left_at?: string | null;
        };
        Update: {
          conversation_id?: string;
          profile_id?: string;
          joined_at?: string;
          last_read_at?: string;
          is_muted?: boolean;
          is_archived?: boolean;
          left_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          id: string;
          created_by: string | null;
          booking_id: string | null;
          last_message_at: string;
          last_message_preview: string | null;
          last_sender_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          created_by?: string | null;
          booking_id?: string | null;
          last_message_at?: string;
          last_message_preview?: string | null;
          last_sender_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          created_by?: string | null;
          booking_id?: string | null;
          last_message_at?: string;
          last_message_preview?: string | null;
          last_sender_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_booking_fk";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_last_sender_id_fkey";
            columns: ["last_sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_notes: {
        Row: {
          id: string;
          professional_id: string;
          client_id: string;
          note: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          professional_id: string;
          client_id: string;
          note: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          professional_id?: string;
          client_id?: string;
          note?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_notes_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_notes_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      direct_conversation_keys: {
        Row: {
          pair_key: string;
          conversation_id: string;
        };
        Insert: {
          pair_key: string;
          conversation_id: string;
        };
        Update: {
          pair_key?: string;
          conversation_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "direct_conversation_keys_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: {
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          follower_id: string;
          following_id: string;
          created_at?: string;
        };
        Update: {
          follower_id?: string;
          following_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_following_id_fkey";
            columns: ["following_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      login_attempts: {
        Row: {
          id: number;
          username: string | null;
          ip_address: string | null;
          success: boolean;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          username?: string | null;
          ip_address?: string | null;
          success?: boolean;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          username?: string | null;
          ip_address?: string | null;
          success?: boolean;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string | null;
          kind: Database["public"]["Enums"]["message_kind"];
          body: string | null;
          attachment_url: string | null;
          attachment_type: Database["public"]["Enums"]["media_type"] | null;
          attachment_width: number | null;
          attachment_height: number | null;
          system_event: Json | null;
          booking_id: string | null;
          created_at: string;
          edited_at: string | null;
          deleted_at: string | null;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id?: string | null;
          kind?: Database["public"]["Enums"]["message_kind"];
          body?: string | null;
          attachment_url?: string | null;
          attachment_type?: Database["public"]["Enums"]["media_type"] | null;
          attachment_width?: number | null;
          attachment_height?: number | null;
          system_event?: Json | null;
          booking_id?: string | null;
          created_at?: string;
          edited_at?: string | null;
          deleted_at?: string | null;
          read_at?: string | null;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender_id?: string | null;
          kind?: Database["public"]["Enums"]["message_kind"];
          body?: string | null;
          attachment_url?: string | null;
          attachment_type?: Database["public"]["Enums"]["media_type"] | null;
          attachment_width?: number | null;
          attachment_height?: number | null;
          system_event?: Json | null;
          booking_id?: string | null;
          created_at?: string;
          edited_at?: string | null;
          deleted_at?: string | null;
          read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_booking_fk";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          profile_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          title: string;
          body: string | null;
          actor_id: string | null;
          entity_type: string | null;
          entity_id: string | null;
          link: string | null;
          data: Json;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          title: string;
          body?: string | null;
          actor_id?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          link?: string | null;
          data?: Json;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          type?: Database["public"]["Enums"]["notification_type"];
          title?: string;
          body?: string | null;
          actor_id?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          link?: string | null;
          data?: Json;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      phone_verification_codes: {
        Row: {
          id: string;
          profile_id: string;
          phone: string;
          code_hash: string;
          attempts: number;
          expires_at: string;
          verified_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          phone: string;
          code_hash: string;
          attempts?: number;
          expires_at: string;
          verified_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          phone?: string;
          code_hash?: string;
          attempts?: number;
          expires_at?: string;
          verified_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "phone_verification_codes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      popular_searches: {
        Row: {
          term: string;
          hits: number;
          updated_at: string;
        };
        Insert: {
          term: string;
          hits?: number;
          updated_at?: string;
        };
        Update: {
          term?: string;
          hits?: number;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      post_comments: {
        Row: {
          id: string;
          post_id: string;
          profile_id: string;
          parent_id: string | null;
          body: string;
          is_hidden: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          post_id: string;
          profile_id: string;
          parent_id?: string | null;
          body: string;
          is_hidden?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          post_id?: string;
          profile_id?: string;
          parent_id?: string | null;
          body?: string;
          is_hidden?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "post_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "professional_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_comments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      post_likes: {
        Row: {
          post_id: string;
          profile_id: string;
          created_at: string;
        };
        Insert: {
          post_id: string;
          profile_id: string;
          created_at?: string;
        };
        Update: {
          post_id?: string;
          profile_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "professional_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_likes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      post_media: {
        Row: {
          id: string;
          post_id: string;
          media_type: Database["public"]["Enums"]["media_type"];
          url: string;
          thumbnail_url: string | null;
          width: number | null;
          height: number | null;
          duration_seconds: number | null;
          position: number;
          before_after_role: string | null;
          alt_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          media_type?: Database["public"]["Enums"]["media_type"];
          url: string;
          thumbnail_url?: string | null;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          position?: number;
          before_after_role?: string | null;
          alt_text?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          post_id?: string;
          media_type?: Database["public"]["Enums"]["media_type"];
          url?: string;
          thumbnail_url?: string | null;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          position?: number;
          before_after_role?: string | null;
          alt_text?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "professional_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      post_views: {
        Row: {
          id: string;
          post_id: string;
          viewer_id: string | null;
          view_day: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          viewer_id?: string | null;
          view_day?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          post_id?: string;
          viewer_id?: string | null;
          view_day?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "professional_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_views_viewer_id_fkey";
            columns: ["viewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profession_requests: {
        Row: {
          id: string;
          requested_by: string;
          raw_name: string;
          name_norm: string | null;
          note: string | null;
          status: Database["public"]["Enums"]["request_status"];
          admin_note: string | null;
          merged_into: string | null;
          created_profession_id: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requested_by: string;
          raw_name: string;
          note?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          admin_note?: string | null;
          merged_into?: string | null;
          created_profession_id?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          requested_by?: string;
          raw_name?: string;
          note?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          admin_note?: string | null;
          merged_into?: string | null;
          created_profession_id?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profession_requests_created_profession_id_fkey";
            columns: ["created_profession_id"];
            isOneToOne: false;
            referencedRelation: "professions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profession_requests_merged_into_fkey";
            columns: ["merged_into"];
            isOneToOne: false;
            referencedRelation: "professions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profession_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profession_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      professional_availability: {
        Row: {
          id: string;
          professional_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
          is_break: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          professional_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
          is_break?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          professional_id?: string;
          weekday?: number;
          start_time?: string;
          end_time?: string;
          is_break?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "professional_availability_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      professional_contact_details: {
        Row: {
          professional_id: string;
          phone: string | null;
          phone_verified_at: string | null;
          studio_address: string | null;
          studio_city_id: string | null;
          studio_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          professional_id: string;
          phone?: string | null;
          phone_verified_at?: string | null;
          studio_address?: string | null;
          studio_city_id?: string | null;
          studio_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          professional_id?: string;
          phone?: string | null;
          phone_verified_at?: string | null;
          studio_address?: string | null;
          studio_city_id?: string | null;
          studio_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "professional_contact_details_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: true;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_contact_details_studio_city_id_fkey";
            columns: ["studio_city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
        ];
      };
      professional_posts: {
        Row: {
          id: string;
          professional_id: string;
          author_profile_id: string;
          service_id: string | null;
          profession_id: string | null;
          city_id: string | null;
          title: string;
          description: string | null;
          tags: string[];
          price_estimate: number | null;
          price_type: Database["public"]["Enums"]["price_type"];
          duration_minutes: number | null;
          is_before_after: boolean;
          consent_confirmed: boolean;
          status: Database["public"]["Enums"]["post_status"];
          is_pinned: boolean;
          pinned_order: number | null;
          published_at: string | null;
          likes_count: number;
          comments_count: number;
          saves_count: number;
          shares_count: number;
          views_count: number;
          bookings_count: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          professional_id: string;
          author_profile_id: string;
          service_id?: string | null;
          profession_id?: string | null;
          city_id?: string | null;
          title: string;
          description?: string | null;
          tags?: string[];
          price_estimate?: number | null;
          price_type?: Database["public"]["Enums"]["price_type"];
          duration_minutes?: number | null;
          is_before_after?: boolean;
          consent_confirmed?: boolean;
          status?: Database["public"]["Enums"]["post_status"];
          is_pinned?: boolean;
          pinned_order?: number | null;
          published_at?: string | null;
          likes_count?: number;
          comments_count?: number;
          saves_count?: number;
          shares_count?: number;
          views_count?: number;
          bookings_count?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          professional_id?: string;
          author_profile_id?: string;
          service_id?: string | null;
          profession_id?: string | null;
          city_id?: string | null;
          title?: string;
          description?: string | null;
          tags?: string[];
          price_estimate?: number | null;
          price_type?: Database["public"]["Enums"]["price_type"];
          duration_minutes?: number | null;
          is_before_after?: boolean;
          consent_confirmed?: boolean;
          status?: Database["public"]["Enums"]["post_status"];
          is_pinned?: boolean;
          pinned_order?: number | null;
          published_at?: string | null;
          likes_count?: number;
          comments_count?: number;
          saves_count?: number;
          shares_count?: number;
          views_count?: number;
          bookings_count?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "professional_posts_author_profile_id_fkey";
            columns: ["author_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_posts_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_posts_profession_id_fkey";
            columns: ["profession_id"];
            isOneToOne: false;
            referencedRelation: "professions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_posts_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_posts_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "professional_services";
            referencedColumns: ["id"];
          },
        ];
      };
      professional_professions: {
        Row: {
          professional_id: string;
          profession_id: string;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          professional_id: string;
          profession_id: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: {
          professional_id?: string;
          profession_id?: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "professional_professions_profession_id_fkey";
            columns: ["profession_id"];
            isOneToOne: false;
            referencedRelation: "professions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_professions_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      professional_profiles: {
        Row: {
          id: string;
          profile_id: string;
          business_name: string;
          headline: string | null;
          bio: string | null;
          years_experience: number | null;
          city_id: string | null;
          avatar_url: string | null;
          cover_url: string | null;
          website_url: string | null;
          social_links: Json;
          status: Database["public"]["Enums"]["professional_status"];
          is_verified: boolean;
          verified_at: string | null;
          phone_verified: boolean;
          accepts_home_visits: boolean;
          accepts_studio: boolean;
          accepts_events: boolean;
          accepts_online: boolean;
          max_travel_km: number | null;
          travel_fee_type: Database["public"]["Enums"]["travel_fee_type"];
          travel_fee: number;
          min_lead_time_minutes: number;
          max_lead_time_days: number;
          cancellation_policy: string | null;
          default_buffer_minutes: number;
          available_today: boolean;
          available_now: boolean;
          available_now_until: string | null;
          rating_avg: number;
          rating_count: number;
          completed_bookings_count: number;
          clients_count: number;
          followers_count: number;
          posts_count: number;
          profile_views_count: number;
          response_time_minutes: number | null;
          published_at: string | null;
          paused_at: string | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          search_doc: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          business_name: string;
          headline?: string | null;
          bio?: string | null;
          years_experience?: number | null;
          city_id?: string | null;
          avatar_url?: string | null;
          cover_url?: string | null;
          website_url?: string | null;
          social_links?: Json;
          status?: Database["public"]["Enums"]["professional_status"];
          is_verified?: boolean;
          verified_at?: string | null;
          phone_verified?: boolean;
          accepts_home_visits?: boolean;
          accepts_studio?: boolean;
          accepts_events?: boolean;
          accepts_online?: boolean;
          max_travel_km?: number | null;
          travel_fee_type?: Database["public"]["Enums"]["travel_fee_type"];
          travel_fee?: number;
          min_lead_time_minutes?: number;
          max_lead_time_days?: number;
          cancellation_policy?: string | null;
          default_buffer_minutes?: number;
          available_today?: boolean;
          available_now?: boolean;
          available_now_until?: string | null;
          rating_avg?: number;
          rating_count?: number;
          completed_bookings_count?: number;
          clients_count?: number;
          followers_count?: number;
          posts_count?: number;
          profile_views_count?: number;
          response_time_minutes?: number | null;
          published_at?: string | null;
          paused_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          search_doc?: string | null;
        };
        Update: {
          id?: string;
          profile_id?: string;
          business_name?: string;
          headline?: string | null;
          bio?: string | null;
          years_experience?: number | null;
          city_id?: string | null;
          avatar_url?: string | null;
          cover_url?: string | null;
          website_url?: string | null;
          social_links?: Json;
          status?: Database["public"]["Enums"]["professional_status"];
          is_verified?: boolean;
          verified_at?: string | null;
          phone_verified?: boolean;
          accepts_home_visits?: boolean;
          accepts_studio?: boolean;
          accepts_events?: boolean;
          accepts_online?: boolean;
          max_travel_km?: number | null;
          travel_fee_type?: Database["public"]["Enums"]["travel_fee_type"];
          travel_fee?: number;
          min_lead_time_minutes?: number;
          max_lead_time_days?: number;
          cancellation_policy?: string | null;
          default_buffer_minutes?: number;
          available_today?: boolean;
          available_now?: boolean;
          available_now_until?: string | null;
          rating_avg?: number;
          rating_count?: number;
          completed_bookings_count?: number;
          clients_count?: number;
          followers_count?: number;
          posts_count?: number;
          profile_views_count?: number;
          response_time_minutes?: number | null;
          published_at?: string | null;
          paused_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          search_doc?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "professional_profiles_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_profiles_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      professional_services: {
        Row: {
          id: string;
          professional_id: string;
          profession_id: string | null;
          name: string;
          description: string | null;
          price_type: Database["public"]["Enums"]["price_type"];
          price_min: number | null;
          price_max: number | null;
          currency: string;
          duration_minutes: number;
          buffer_minutes: number;
          at_client_home: boolean;
          at_studio: boolean;
          at_event: boolean;
          supports_recurring: boolean;
          image_url: string | null;
          is_active: boolean;
          sort_order: number;
          bookings_count: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          professional_id: string;
          profession_id?: string | null;
          name: string;
          description?: string | null;
          price_type?: Database["public"]["Enums"]["price_type"];
          price_min?: number | null;
          price_max?: number | null;
          currency?: string;
          duration_minutes?: number;
          buffer_minutes?: number;
          at_client_home?: boolean;
          at_studio?: boolean;
          at_event?: boolean;
          supports_recurring?: boolean;
          image_url?: string | null;
          is_active?: boolean;
          sort_order?: number;
          bookings_count?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          professional_id?: string;
          profession_id?: string | null;
          name?: string;
          description?: string | null;
          price_type?: Database["public"]["Enums"]["price_type"];
          price_min?: number | null;
          price_max?: number | null;
          currency?: string;
          duration_minutes?: number;
          buffer_minutes?: number;
          at_client_home?: boolean;
          at_studio?: boolean;
          at_event?: boolean;
          supports_recurring?: boolean;
          image_url?: string | null;
          is_active?: boolean;
          sort_order?: number;
          bookings_count?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "professional_services_profession_id_fkey";
            columns: ["profession_id"];
            isOneToOne: false;
            referencedRelation: "professions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_services_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      professional_verifications: {
        Row: {
          id: string;
          professional_id: string;
          kind: Database["public"]["Enums"]["verification_kind"];
          document_url: string | null;
          title: string | null;
          status: Database["public"]["Enums"]["request_status"];
          note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          professional_id: string;
          kind: Database["public"]["Enums"]["verification_kind"];
          document_url?: string | null;
          title?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          professional_id?: string;
          kind?: Database["public"]["Enums"]["verification_kind"];
          document_url?: string | null;
          title?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "professional_verifications_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_verifications_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      professions: {
        Row: {
          id: string;
          slug: string;
          name: string;
          name_norm: string | null;
          description: string | null;
          icon: string | null;
          category: string;
          is_active: boolean;
          is_core: boolean;
          sort_order: number;
          created_by: string | null;
          approved_by: string | null;
          professionals_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          icon?: string | null;
          category?: string;
          is_active?: boolean;
          is_core?: boolean;
          sort_order?: number;
          created_by?: string | null;
          approved_by?: string | null;
          professionals_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          icon?: string | null;
          category?: string;
          is_active?: boolean;
          is_core?: boolean;
          sort_order?: number;
          created_by?: string | null;
          approved_by?: string | null;
          professionals_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "professions_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_views: {
        Row: {
          id: string;
          professional_id: string;
          viewer_id: string | null;
          view_day: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          professional_id: string;
          viewer_id?: string | null;
          view_day?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          professional_id?: string;
          viewer_id?: string | null;
          view_day?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_views_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_views_viewer_id_fkey";
            columns: ["viewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          username: string;
          full_name: string;
          password_hash: string;
          password_updated_at: string;
          city_id: string | null;
          avatar_url: string | null;
          bio: string | null;
          birth_date: string | null;
          role: Database["public"]["Enums"]["account_role"];
          status: Database["public"]["Enums"]["account_status"];
          active_mode: Database["public"]["Enums"]["app_mode"];
          is_professional: boolean;
          guardian_name: string | null;
          guardian_phone: string | null;
          guardian_approved_at: string | null;
          followers_count: number;
          following_count: number;
          privacy: Json;
          notification_prefs: Json;
          failed_login_count: number;
          locked_until: string | null;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          username: string;
          full_name: string;
          password_hash: string;
          password_updated_at?: string;
          city_id?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          birth_date?: string | null;
          role?: Database["public"]["Enums"]["account_role"];
          status?: Database["public"]["Enums"]["account_status"];
          active_mode?: Database["public"]["Enums"]["app_mode"];
          is_professional?: boolean;
          guardian_name?: string | null;
          guardian_phone?: string | null;
          guardian_approved_at?: string | null;
          followers_count?: number;
          following_count?: number;
          privacy?: Json;
          notification_prefs?: Json;
          failed_login_count?: number;
          locked_until?: string | null;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          username?: string;
          full_name?: string;
          password_hash?: string;
          password_updated_at?: string;
          city_id?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          birth_date?: string | null;
          role?: Database["public"]["Enums"]["account_role"];
          status?: Database["public"]["Enums"]["account_status"];
          active_mode?: Database["public"]["Enums"]["app_mode"];
          is_professional?: boolean;
          guardian_name?: string | null;
          guardian_phone?: string | null;
          guardian_approved_at?: string | null;
          followers_count?: number;
          following_count?: number;
          privacy?: Json;
          notification_prefs?: Json;
          failed_login_count?: number;
          locked_until?: string | null;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          profile_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          last_used_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
          last_used_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          created_at?: string;
          last_used_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limits: {
        Row: {
          bucket: string;
          identifier: string;
          window_start: string;
          count: number;
        };
        Insert: {
          bucket: string;
          identifier: string;
          window_start: string;
          count?: number;
        };
        Update: {
          bucket?: string;
          identifier?: string;
          window_start?: string;
          count?: number;
        };
        Relationships: [
        ];
      };
      recovery_codes: {
        Row: {
          id: string;
          profile_id: string;
          code_hash: string;
          hint: string | null;
          created_at: string;
          used_at: string | null;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          code_hash: string;
          hint?: string | null;
          created_at?: string;
          used_at?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          profile_id?: string;
          code_hash?: string;
          hint?: string | null;
          created_at?: string;
          used_at?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recovery_codes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_booking_occurrences: {
        Row: {
          id: string;
          series_id: string;
          booking_id: string | null;
          sequence: number;
          scheduled_date: string;
          scheduled_start: string;
          status: Database["public"]["Enums"]["occurrence_status"];
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          series_id: string;
          booking_id?: string | null;
          sequence: number;
          scheduled_date: string;
          scheduled_start: string;
          status?: Database["public"]["Enums"]["occurrence_status"];
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          series_id?: string;
          booking_id?: string | null;
          sequence?: number;
          scheduled_date?: string;
          scheduled_start?: string;
          status?: Database["public"]["Enums"]["occurrence_status"];
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_booking_occurrences_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_booking_occurrences_series_id_fkey";
            columns: ["series_id"];
            isOneToOne: false;
            referencedRelation: "recurring_booking_series";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_booking_series: {
        Row: {
          id: string;
          client_id: string;
          professional_id: string;
          service_id: string;
          address_id: string | null;
          conversation_id: string | null;
          location_type: Database["public"]["Enums"]["booking_location_type"];
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          interval_weeks: number;
          weekday: number;
          start_time: string;
          duration_minutes: number;
          start_date: string;
          end_date: string | null;
          planned_occurrences: number | null;
          price_amount: number | null;
          travel_fee: number;
          notes: string | null;
          approval_mode: Database["public"]["Enums"]["series_approval_mode"];
          status: Database["public"]["Enums"]["series_status"];
          client_approved_at: string | null;
          professional_approved_at: string | null;
          paused_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          professional_id: string;
          service_id: string;
          address_id?: string | null;
          conversation_id?: string | null;
          location_type?: Database["public"]["Enums"]["booking_location_type"];
          frequency?: Database["public"]["Enums"]["recurrence_frequency"];
          interval_weeks?: number;
          weekday: number;
          start_time: string;
          duration_minutes: number;
          start_date: string;
          end_date?: string | null;
          planned_occurrences?: number | null;
          price_amount?: number | null;
          travel_fee?: number;
          notes?: string | null;
          approval_mode?: Database["public"]["Enums"]["series_approval_mode"];
          status?: Database["public"]["Enums"]["series_status"];
          client_approved_at?: string | null;
          professional_approved_at?: string | null;
          paused_at?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          professional_id?: string;
          service_id?: string;
          address_id?: string | null;
          conversation_id?: string | null;
          location_type?: Database["public"]["Enums"]["booking_location_type"];
          frequency?: Database["public"]["Enums"]["recurrence_frequency"];
          interval_weeks?: number;
          weekday?: number;
          start_time?: string;
          duration_minutes?: number;
          start_date?: string;
          end_date?: string | null;
          planned_occurrences?: number | null;
          price_amount?: number | null;
          travel_fee?: number;
          notes?: string | null;
          approval_mode?: Database["public"]["Enums"]["series_approval_mode"];
          status?: Database["public"]["Enums"]["series_status"];
          client_approved_at?: string | null;
          professional_approved_at?: string | null;
          paused_at?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_booking_series_address_id_fkey";
            columns: ["address_id"];
            isOneToOne: false;
            referencedRelation: "service_addresses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_booking_series_cancelled_by_fkey";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_booking_series_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_booking_series_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_booking_series_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_booking_series_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "professional_services";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: Database["public"]["Enums"]["report_target"];
          target_id: string;
          reason: string;
          details: string | null;
          status: Database["public"]["Enums"]["report_status"];
          handled_by: string | null;
          handled_at: string | null;
          resolution_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          target_type: Database["public"]["Enums"]["report_target"];
          target_id: string;
          reason: string;
          details?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          handled_by?: string | null;
          handled_at?: string | null;
          resolution_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          reporter_id?: string;
          target_type?: Database["public"]["Enums"]["report_target"];
          target_id?: string;
          reason?: string;
          details?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          handled_by?: string | null;
          handled_at?: string | null;
          resolution_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_handled_by_fkey";
            columns: ["handled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      review_replies: {
        Row: {
          id: string;
          review_id: string;
          professional_id: string;
          body: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          review_id: string;
          professional_id: string;
          body: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          review_id?: string;
          professional_id?: string;
          body?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "review_replies_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_replies_review_id_fkey";
            columns: ["review_id"];
            isOneToOne: true;
            referencedRelation: "reviews";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          id: string;
          booking_id: string;
          professional_id: string;
          client_id: string;
          service_id: string | null;
          rating: number;
          body: string | null;
          image_urls: string[];
          is_verified_booking: boolean;
          is_hidden: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          booking_id: string;
          professional_id: string;
          client_id: string;
          service_id?: string | null;
          rating: number;
          body?: string | null;
          image_urls?: string[];
          is_verified_booking?: boolean;
          is_hidden?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          booking_id?: string;
          professional_id?: string;
          client_id?: string;
          service_id?: string | null;
          rating?: number;
          body?: string | null;
          image_urls?: string[];
          is_verified_booking?: boolean;
          is_hidden?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "professional_services";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_posts: {
        Row: {
          profile_id: string;
          post_id: string;
          created_at: string;
        };
        Insert: {
          profile_id: string;
          post_id: string;
          created_at?: string;
        };
        Update: {
          profile_id?: string;
          post_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_posts_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "professional_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_posts_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_professionals: {
        Row: {
          profile_id: string;
          professional_id: string;
          created_at: string;
        };
        Insert: {
          profile_id: string;
          professional_id: string;
          created_at?: string;
        };
        Update: {
          profile_id?: string;
          professional_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_professionals_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_professionals_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_searches: {
        Row: {
          id: string;
          profile_id: string;
          name: string;
          query: Json;
          notify_on_match: boolean;
          last_notified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          name: string;
          query?: Json;
          notify_on_match?: boolean;
          last_notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          name?: string;
          query?: Json;
          notify_on_match?: boolean;
          last_notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_searches_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      search_history: {
        Row: {
          id: string;
          profile_id: string;
          term: string;
          results_count: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          term: string;
          results_count?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          term?: string;
          results_count?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "search_history_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      security_events: {
        Row: {
          id: string;
          profile_id: string | null;
          event: string;
          details: Json;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id?: string | null;
          event: string;
          details?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string | null;
          event?: string;
          details?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "security_events_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      service_addresses: {
        Row: {
          id: string;
          profile_id: string;
          label: string;
          city_id: string | null;
          street: string;
          house_number: string | null;
          apartment: string | null;
          floor: string | null;
          entrance_code: string | null;
          arrival_notes: string | null;
          has_parking: boolean | null;
          latitude: number | null;
          longitude: number | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          label?: string;
          city_id?: string | null;
          street: string;
          house_number?: string | null;
          apartment?: string | null;
          floor?: string | null;
          entrance_code?: string | null;
          arrival_notes?: string | null;
          has_parking?: boolean | null;
          latitude?: number | null;
          longitude?: number | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          profile_id?: string;
          label?: string;
          city_id?: string | null;
          street?: string;
          house_number?: string | null;
          apartment?: string | null;
          floor?: string | null;
          entrance_code?: string | null;
          arrival_notes?: string | null;
          has_parking?: boolean | null;
          latitude?: number | null;
          longitude?: number | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_addresses_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_addresses_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      service_areas: {
        Row: {
          id: string;
          professional_id: string;
          city_id: string | null;
          area_name: string | null;
          radius_km: number | null;
          travel_fee: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          professional_id: string;
          city_id?: string | null;
          area_name?: string | null;
          radius_km?: number | null;
          travel_fee?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          professional_id?: string;
          city_id?: string | null;
          area_name?: string | null;
          radius_km?: number | null;
          travel_fee?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_areas_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_areas_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      unavailable_dates: {
        Row: {
          id: string;
          professional_id: string;
          start_at: string;
          end_at: string;
          reason: string | null;
          is_vacation: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          professional_id: string;
          start_at: string;
          end_at: string;
          reason?: string | null;
          is_vacation?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          professional_id?: string;
          start_at?: string;
          end_at?: string;
          reason?: string | null;
          is_vacation?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "unavailable_dates_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      usernames: {
        Row: {
          username: string;
          profile_id: string;
          created_at: string;
        };
        Insert: {
          username: string;
          profile_id: string;
          created_at?: string;
        };
        Update: {
          username?: string;
          profile_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usernames_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_stats: { Args: Record<string, unknown>; Returns: unknown };
      approve_profession_request: { Args: Record<string, unknown>; Returns: unknown };
      auth_change_password: { Args: Record<string, unknown>; Returns: unknown };
      auth_login: { Args: Record<string, unknown>; Returns: unknown };
      auth_me: { Args: Record<string, unknown>; Returns: unknown };
      auth_register: { Args: Record<string, unknown>; Returns: unknown };
      auth_register_simple: { Args: Record<string, unknown>; Returns: unknown };
      auth_reset_password: { Args: Record<string, unknown>; Returns: unknown };
      auth_rotate_recovery_code: { Args: Record<string, unknown>; Returns: unknown };
      available_slots: { Args: Record<string, unknown>; Returns: unknown };
      b64url: { Args: Record<string, unknown>; Returns: unknown };
      build_search_doc: { Args: Record<string, unknown>; Returns: unknown };
      can_view_address: { Args: Record<string, unknown>; Returns: unknown };
      can_view_post: { Args: Record<string, unknown>; Returns: unknown };
      check_booking_slot: { Args: Record<string, unknown>; Returns: unknown };
      consume_rate_limit: { Args: Record<string, unknown>; Returns: unknown };
      create_notification: { Args: Record<string, unknown>; Returns: unknown };
      current_profile_id: { Args: Record<string, unknown>; Returns: unknown };
      derive_username: { Args: Record<string, unknown>; Returns: unknown };
      direct_pair_key: { Args: Record<string, unknown>; Returns: unknown };
      display_name: { Args: Record<string, unknown>; Returns: unknown };
      feed_posts: { Args: Record<string, unknown>; Returns: unknown };
      generate_recovery_code: { Args: Record<string, unknown>; Returns: unknown };
      generate_series_occurrences: { Args: Record<string, unknown>; Returns: unknown };
      get_or_create_direct_conversation: { Args: Record<string, unknown>; Returns: unknown };
      guard_booking_update: { Args: Record<string, unknown>; Returns: unknown };
      guard_message_insert: { Args: Record<string, unknown>; Returns: unknown };
      guard_minor_home_booking: { Args: Record<string, unknown>; Returns: unknown };
      guard_professional_publish: { Args: Record<string, unknown>; Returns: unknown };
      guard_review_insert: { Args: Record<string, unknown>; Returns: unknown };
      guard_series_activation: { Args: Record<string, unknown>; Returns: unknown };
      guard_series_booking_link: { Args: Record<string, unknown>; Returns: unknown };
      handle_booking_change: { Args: Record<string, unknown>; Returns: unknown };
      handle_comment_change: { Args: Record<string, unknown>; Returns: unknown };
      handle_follow_change: { Args: Record<string, unknown>; Returns: unknown };
      handle_like_change: { Args: Record<string, unknown>; Returns: unknown };
      handle_post_publish: { Args: Record<string, unknown>; Returns: unknown };
      handle_professional_profession_change: { Args: Record<string, unknown>; Returns: unknown };
      handle_review_change: { Args: Record<string, unknown>; Returns: unknown };
      handle_review_reply: { Args: Record<string, unknown>; Returns: unknown };
      handle_saved_post_change: { Args: Record<string, unknown>; Returns: unknown };
      hash_password: { Args: Record<string, unknown>; Returns: unknown };
      haversine_km: { Args: Record<string, unknown>; Returns: unknown };
      is_admin: { Args: Record<string, unknown>; Returns: unknown };
      is_blocked_between: { Args: Record<string, unknown>; Returns: unknown };
      is_booking_party: { Args: Record<string, unknown>; Returns: unknown };
      is_conversation_member: { Args: Record<string, unknown>; Returns: unknown };
      is_super_admin: { Args: Record<string, unknown>; Returns: unknown };
      issue_recovery_code: { Args: Record<string, unknown>; Returns: unknown };
      log_search: { Args: Record<string, unknown>; Returns: unknown };
      materialize_series_bookings: { Args: Record<string, unknown>; Returns: unknown };
      normalize_profession_name: { Args: Record<string, unknown>; Returns: unknown };
      normalize_text: { Args: Record<string, unknown>; Returns: unknown };
      notify_new_message: { Args: Record<string, unknown>; Returns: unknown };
      notify_series_change: { Args: Record<string, unknown>; Returns: unknown };
      owns_professional: { Args: Record<string, unknown>; Returns: unknown };
      post_system_message: { Args: Record<string, unknown>; Returns: unknown };
      preview_series_dates: { Args: Record<string, unknown>; Returns: unknown };
      professional_is_public: { Args: Record<string, unknown>; Returns: unknown };
      professional_matches_word: { Args: Record<string, unknown>; Returns: unknown };
      professional_readiness: { Args: Record<string, unknown>; Returns: unknown };
      rating_breakdown: { Args: Record<string, unknown>; Returns: unknown };
      record_post_view: { Args: Record<string, unknown>; Returns: unknown };
      record_profile_view: { Args: Record<string, unknown>; Returns: unknown };
      refresh_professional_rating: { Args: Record<string, unknown>; Returns: unknown };
      refresh_response_time: { Args: Record<string, unknown>; Returns: unknown };
      refresh_search_doc: { Args: Record<string, unknown>; Returns: unknown };
      search_city: { Args: Record<string, unknown>; Returns: unknown };
      search_professionals: { Args: Record<string, unknown>; Returns: unknown };
      search_suggestions: { Args: Record<string, unknown>; Returns: unknown };
      search_tokens: { Args: Record<string, unknown>; Returns: unknown };
      search_wants_event: { Args: Record<string, unknown>; Returns: unknown };
      search_wants_home: { Args: Record<string, unknown>; Returns: unknown };
      search_wants_recurring: { Args: Record<string, unknown>; Returns: unknown };
      search_wants_today: { Args: Record<string, unknown>; Returns: unknown };
      series_interval_weeks: { Args: Record<string, unknown>; Returns: unknown };
      set_app_secret: { Args: Record<string, unknown>; Returns: unknown };
      set_booking_blocked_until: { Args: Record<string, unknown>; Returns: unknown };
      set_updated_at: { Args: Record<string, unknown>; Returns: unknown };
      sign_jwt: { Args: Record<string, unknown>; Returns: unknown };
      similar_professionals: { Args: Record<string, unknown>; Returns: unknown };
      slugify_username: { Args: Record<string, unknown>; Returns: unknown };
      stamp_post_published_at: { Args: Record<string, unknown>; Returns: unknown };
      strip_marks: { Args: Record<string, unknown>; Returns: unknown };
      sync_is_professional: { Args: Record<string, unknown>; Returns: unknown };
      sync_occurrence_from_booking: { Args: Record<string, unknown>; Returns: unknown };
      sync_username_reservation: { Args: Record<string, unknown>; Returns: unknown };
      touch_conversation_on_message: { Args: Record<string, unknown>; Returns: unknown };
      touch_search_doc_from_child: { Args: Record<string, unknown>; Returns: unknown };
      touch_search_doc_from_profile: { Args: Record<string, unknown>; Returns: unknown };
      touch_search_doc_self: { Args: Record<string, unknown>; Returns: unknown };
      username_available: { Args: Record<string, unknown>; Returns: unknown };
      verify_password: { Args: Record<string, unknown>; Returns: unknown };
      word_forms: { Args: Record<string, unknown>; Returns: unknown };
      word_is_city: { Args: Record<string, unknown>; Returns: unknown };
    };
    Enums: {
      account_role: "user" | "moderator" | "admin";
      account_status: "active" | "suspended" | "banned" | "deleted";
      app_mode: "user" | "professional";
      booking_location_type: "client_home" | "studio" | "event" | "online";
      booking_status: "draft" | "pending" | "confirmed" | "change_proposed" | "cancelled" | "on_the_way" | "arrived" | "in_progress" | "completed" | "no_show";
      media_type: "image" | "video";
      message_kind: "text" | "image" | "system";
      notification_type: "new_message" | "new_follower" | "post_like" | "post_comment" | "new_post" | "booking_created" | "booking_confirmed" | "booking_rejected" | "booking_change_proposed" | "booking_price_changed" | "booking_reminder" | "booking_on_the_way" | "booking_cancelled" | "booking_completed" | "series_created" | "series_confirmed" | "series_changed" | "series_cancelled" | "new_review" | "review_reply" | "professional_approved" | "profession_approved" | "verification_approved" | "system";
      occurrence_status: "planned" | "booked" | "skipped" | "moved" | "cancelled" | "completed";
      post_status: "draft" | "published" | "hidden" | "removed";
      price_type: "fixed" | "range" | "on_request";
      professional_status: "draft" | "pending_review" | "active" | "paused" | "rejected";
      recurrence_frequency: "weekly" | "biweekly" | "every_3_weeks" | "every_4_weeks" | "monthly" | "custom";
      report_status: "open" | "reviewing" | "resolved" | "dismissed";
      report_target: "user" | "professional" | "post" | "comment" | "message" | "review";
      request_status: "pending" | "approved" | "rejected" | "merged";
      series_approval_mode: "whole_series" | "each_occurrence";
      series_status: "pending" | "active" | "paused" | "completed" | "cancelled";
      travel_fee_type: "none" | "fixed" | "per_km" | "per_city";
      verification_kind: "phone" | "certificate" | "identity";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
