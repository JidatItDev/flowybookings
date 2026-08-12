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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          entity: string
          id: string
          metadata: Json
          shop_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity: string
          id?: string
          metadata?: Json
          shop_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity?: string
          id?: string
          metadata?: Json
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          invited_by_email: string | null
          label: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          invited_by_email?: string | null
          label?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          invited_by_email?: string | null
          label?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_login_log: {
        Row: {
          created_at: string
          email: string | null
          failure_reason: string | null
          id: string
          ip_address: string | null
          role: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          role?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          role?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          demo_logins_enabled: boolean
          demo_mode_enabled: boolean
          id: number
          public_booking_on_demo_shops_enabled: boolean
          seeded_demo_data_visible: boolean
          updated_at: string
        }
        Insert: {
          demo_logins_enabled?: boolean
          demo_mode_enabled?: boolean
          id?: number
          public_booking_on_demo_shops_enabled?: boolean
          seeded_demo_data_visible?: boolean
          updated_at?: string
        }
        Update: {
          demo_logins_enabled?: boolean
          demo_mode_enabled?: boolean
          id?: number
          public_booking_on_demo_shops_enabled?: boolean
          seeded_demo_data_visible?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          confirmation_sent_at: string | null
          created_at: string
          currency: string
          customer_id: string | null
          deposit_cents: number
          ends_at: string
          followup_sent_at: string | null
          id: string
          notes: string | null
          price_cents: number
          reminder_24h_sent_at: string | null
          reminder_2h_sent_at: string | null
          service_id: string | null
          shop_id: string
          staff_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          confirmation_sent_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          deposit_cents?: number
          ends_at: string
          followup_sent_at?: string | null
          id?: string
          notes?: string | null
          price_cents?: number
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          service_id?: string | null
          shop_id: string
          staff_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          confirmation_sent_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          deposit_cents?: number
          ends_at?: string
          followup_sent_at?: string | null
          id?: string
          notes?: string | null
          price_cents?: number
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          service_id?: string | null
          shop_id?: string
          staff_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          import_source: string | null
          imported_at: string | null
          last_visit_at: string | null
          no_show_count: number
          notes: string | null
          phone: string | null
          preferences: Json
          requires_deposit: boolean
          shop_id: string
          tags: string[]
          total_spent_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          import_source?: string | null
          imported_at?: string | null
          last_visit_at?: string | null
          no_show_count?: number
          notes?: string | null
          phone?: string | null
          preferences?: Json
          requires_deposit?: boolean
          shop_id: string
          tags?: string[]
          total_spent_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          import_source?: string | null
          imported_at?: string | null
          last_visit_at?: string | null
          no_show_count?: number
          notes?: string | null
          phone?: string | null
          preferences?: Json
          requires_deposit?: boolean
          shop_id?: string
          tags?: string[]
          total_spent_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          created_by: string | null
          id: string
          is_read: boolean
          message: string
          metadata: Json
          read_at: string | null
          shop_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json
          read_at?: string | null
          shop_id: string
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          action_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json
          read_at?: string | null
          shop_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          application_fee_cents: number
          booking_id: string | null
          created_at: string
          currency: string
          id: string
          metadata: Json
          provider: string | null
          provider_payment_id: string | null
          shop_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          application_fee_cents?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          provider?: string | null
          provider_payment_id?: string | null
          shop_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          application_fee_cents?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          provider?: string | null
          provider_payment_id?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          created_at: string
          feature_slug: string
          id: string
          is_included: boolean
          limit_value: number | null
          plan_name: Database["public"]["Enums"]["subscription_plan"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_slug: string
          id?: string
          is_included?: boolean
          limit_value?: number | null
          plan_name: Database["public"]["Enums"]["subscription_plan"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_slug?: string
          id?: string
          is_included?: boolean
          limit_value?: number | null
          plan_name?: Database["public"]["Enums"]["subscription_plan"]
          updated_at?: string
        }
        Relationships: []
      }
      plan_pricing: {
        Row: {
          booking_fee_cents: number
          created_at: string
          currency: string
          id: string
          monthly_price_cents: number
          notes: string | null
          plan_name: Database["public"]["Enums"]["subscription_plan"]
          platform_fee_bps: number
          updated_at: string
        }
        Insert: {
          booking_fee_cents?: number
          created_at?: string
          currency?: string
          id?: string
          monthly_price_cents?: number
          notes?: string | null
          plan_name: Database["public"]["Enums"]["subscription_plan"]
          platform_fee_bps?: number
          updated_at?: string
        }
        Update: {
          booking_fee_cents?: number
          created_at?: string
          currency?: string
          id?: string
          monthly_price_cents?: number
          notes?: string | null
          plan_name?: Database["public"]["Enums"]["subscription_plan"]
          platform_fee_bps?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_billing_config: {
        Row: {
          expects_client_id: boolean
          expects_client_secret: boolean
          id: number
          last_health_at: string | null
          last_health_message: string | null
          last_health_mode: string | null
          last_health_status: string | null
          mode: string
          notes: string | null
          updated_at: string
          updated_by: string | null
          webhook_url_override: string | null
        }
        Insert: {
          expects_client_id?: boolean
          expects_client_secret?: boolean
          id?: number
          last_health_at?: string | null
          last_health_message?: string | null
          last_health_mode?: string | null
          last_health_status?: string | null
          mode?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
          webhook_url_override?: string | null
        }
        Update: {
          expects_client_id?: boolean
          expects_client_secret?: boolean
          id?: number
          last_health_at?: string | null
          last_health_message?: string | null
          last_health_mode?: string | null
          last_health_status?: string | null
          mode?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
          webhook_url_override?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          admin_last_seen_activity_at: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          last_login_at: string | null
          legal_consent: Json
          phone: string | null
          updated_at: string
        }
        Insert: {
          admin_last_seen_activity_at?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          last_login_at?: string | null
          legal_consent?: Json
          phone?: string | null
          updated_at?: string
        }
        Update: {
          admin_last_seen_activity_at?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          legal_consent?: Json
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          category: string | null
          created_at: string
          currency: string
          deposit_cents: number
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price_cents: number
          shop_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string
          deposit_cents?: number
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          price_cents?: number
          shop_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string
          deposit_cents?: number
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_automations: {
        Row: {
          confirmation_enabled: boolean
          created_at: string
          followup_delay_minutes: number
          followup_enabled: boolean
          id: string
          reminder_24h_enabled: boolean
          reminder_2h_enabled: boolean
          reminder_sms_enabled: boolean
          settings: Json
          shop_id: string
          updated_at: string
        }
        Insert: {
          confirmation_enabled?: boolean
          created_at?: string
          followup_delay_minutes?: number
          followup_enabled?: boolean
          id?: string
          reminder_24h_enabled?: boolean
          reminder_2h_enabled?: boolean
          reminder_sms_enabled?: boolean
          settings?: Json
          shop_id: string
          updated_at?: string
        }
        Update: {
          confirmation_enabled?: boolean
          created_at?: string
          followup_delay_minutes?: number
          followup_enabled?: boolean
          id?: string
          reminder_24h_enabled?: boolean
          reminder_2h_enabled?: boolean
          reminder_sms_enabled?: boolean
          settings?: Json
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_automations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_feature_overrides: {
        Row: {
          created_at: string
          expires_at: string | null
          feature_slug: string
          granted_by: string | null
          granted_by_email: string | null
          id: string
          is_included: boolean
          limit_value: number | null
          reason: string | null
          shop_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          feature_slug: string
          granted_by?: string | null
          granted_by_email?: string | null
          id?: string
          is_included?: boolean
          limit_value?: number | null
          reason?: string | null
          shop_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          feature_slug?: string
          granted_by?: string | null
          granted_by_email?: string | null
          id?: string
          is_included?: boolean
          limit_value?: number | null
          reason?: string | null
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_feature_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_payment_providers: {
        Row: {
          application_fee_enabled: boolean
          application_fee_percent: number
          connected_at: string | null
          connection_status: string
          created_at: string
          disconnected_at: string | null
          id: string
          last_synced_at: string | null
          metadata: Json
          onboarding_status: string
          payment_methods_enabled: Json
          provider: string
          provider_account_id: string | null
          shop_id: string
          updated_at: string
        }
        Insert: {
          application_fee_enabled?: boolean
          application_fee_percent?: number
          connected_at?: string | null
          connection_status?: string
          created_at?: string
          disconnected_at?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          onboarding_status?: string
          payment_methods_enabled?: Json
          provider?: string
          provider_account_id?: string | null
          shop_id: string
          updated_at?: string
        }
        Update: {
          application_fee_enabled?: boolean
          application_fee_percent?: number
          connected_at?: string | null
          connection_status?: string
          created_at?: string
          disconnected_at?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          onboarding_status?: string
          payment_methods_enabled?: Json
          provider?: string
          provider_account_id?: string | null
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_payment_providers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_sms_credits: {
        Row: {
          balance: number
          created_at: string
          free_credits_granted: number
          id: string
          shop_id: string
          total_purchased: number
          total_used: number
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          free_credits_granted?: number
          id?: string
          shop_id: string
          total_purchased?: number
          total_used?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          free_credits_granted?: number
          id?: string
          shop_id?: string
          total_purchased?: number
          total_used?: number
          updated_at?: string
        }
        Relationships: []
      }
      shops: {
        Row: {
          address: string | null
          admin_notes: string | null
          booking_fee_cents_override: number | null
          branding: Json
          business_hours: Json
          category: string | null
          created_at: string
          default_deposit_percent: number
          email: string | null
          id: string
          is_demo: boolean
          logo_url: string | null
          mollie_subscription_id: string | null
          name: string
          next_billing_at: string | null
          onboarding: Json
          owner_id: string
          phone: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          plan_billing_cycle: string | null
          plan_expires_at: string | null
          platform_fee_bps_override: number | null
          policy_accepted_at: string | null
          policy_version: string | null
          slug: string
          status: Database["public"]["Enums"]["shop_status"]
          subscription_notes: string | null
          subscription_status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          admin_notes?: string | null
          booking_fee_cents_override?: number | null
          branding?: Json
          business_hours?: Json
          category?: string | null
          created_at?: string
          default_deposit_percent?: number
          email?: string | null
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          mollie_subscription_id?: string | null
          name: string
          next_billing_at?: string | null
          onboarding?: Json
          owner_id: string
          phone?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          plan_billing_cycle?: string | null
          plan_expires_at?: string | null
          platform_fee_bps_override?: number | null
          policy_accepted_at?: string | null
          policy_version?: string | null
          slug: string
          status?: Database["public"]["Enums"]["shop_status"]
          subscription_notes?: string | null
          subscription_status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          admin_notes?: string | null
          booking_fee_cents_override?: number | null
          branding?: Json
          business_hours?: Json
          category?: string | null
          created_at?: string
          default_deposit_percent?: number
          email?: string | null
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          mollie_subscription_id?: string | null
          name?: string
          next_billing_at?: string | null
          onboarding?: Json
          owner_id?: string
          phone?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          plan_billing_cycle?: string | null
          plan_expires_at?: string | null
          platform_fee_bps_override?: number | null
          policy_accepted_at?: string | null
          policy_version?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["shop_status"]
          subscription_notes?: string | null
          subscription_status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      sms_send_log: {
        Row: {
          booking_id: string | null
          created_at: string
          credits_used: number
          customer_id: string | null
          error_message: string | null
          id: string
          message: string
          phone: string
          provider: string | null
          provider_message_id: string | null
          shop_id: string
          status: string
          template: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          credits_used?: number
          customer_id?: string | null
          error_message?: string | null
          id?: string
          message: string
          phone: string
          provider?: string | null
          provider_message_id?: string | null
          shop_id: string
          status?: string
          template?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          credits_used?: number
          customer_id?: string | null
          error_message?: string | null
          id?: string
          message?: string
          phone?: string
          provider?: string | null
          provider_message_id?: string | null
          shop_id?: string
          status?: string
          template?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          shop_id: string
          updated_at: string
          user_id: string | null
          working_hours: Json
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          shop_id: string
          updated_at?: string
          user_id?: string | null
          working_hours?: Json
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          shop_id?: string
          updated_at?: string
          user_id?: string | null
          working_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "staff_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_services: {
        Row: {
          service_id: string
          staff_id: string
        }
        Insert: {
          service_id: string
          staff_id: string
        }
        Update: {
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          disabled_at: string | null
          expires_at: string | null
          id: string
          invited_by: string | null
          label: string | null
          role: Database["public"]["Enums"]["app_role"]
          shop_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          label?: string | null
          role: Database["public"]["Enums"]["app_role"]
          shop_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          label?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          shop_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _mollie_token_key: { Args: never; Returns: string }
      admin_broadcast_notification: {
        Args: {
          _action_url?: string
          _message: string
          _shop_ids?: string[]
          _title: string
          _type?: Database["public"]["Enums"]["notification_type"]
        }
        Returns: number
      }
      consume_sms_credit: { Args: { _shop_id: string }; Returns: boolean }
      decrypt_mollie_token: { Args: { ciphertext: string }; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      encrypt_mollie_token: { Args: { plaintext: string }; Returns: string }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      find_public_customer_id_by_email: {
        Args: { _email: string; _shop_id: string }
        Returns: string
      }
      get_default_shop_id: { Args: { _user_id: string }; Returns: string }
      get_public_app_settings: {
        Args: never
        Returns: {
          demo_logins_enabled: boolean
          demo_mode_enabled: boolean
          public_booking_on_demo_shops_enabled: boolean
          seeded_demo_data_visible: boolean
        }[]
      }
      get_public_booking_confirmation: {
        Args: { _booking_id: string }
        Returns: {
          currency: string
          deposit_cents: number
          ends_at: string
          id: string
          price_cents: number
          service_id: string
          shop_id: string
          staff_id: string
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
        }[]
      }
      resolve_public_booking_shop: {
        Args: { _ref: string }
        Returns: {
          block_reason: string | null
          found: boolean
          logo_url: string | null
          name: string | null
          shop_id: string | null
          slug: string | null
        }[]
      }
      get_public_bookings_for_availability: {
        Args: {
          _range_end: string
          _range_start: string
          _shop_id: string
        }
        Returns: {
          ends_at: string
          staff_id: string
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
        }[]
      }
      get_public_busy_staff_ids: {
        Args: { _ends_at: string; _shop_id: string; _starts_at: string }
        Returns: string[]
      }
      get_shop_feature_access: {
        Args: { _feature_slug: string; _shop_id: string }
        Returns: {
          allowed: boolean
          current_plan: string
          limit_value: number
          upgrade_plan: string
          used: number
        }[]
      }
      has_shop_access: {
        Args: { _shop_id: string; _user_id: string }
        Returns: boolean
      }
      is_admin_writer: { Args: { _user_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_role_active: {
        Args: { _disabled_at: string; _expires_at: string }
        Returns: boolean
      }
      is_shop_owner: {
        Args: { _shop_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      public_booking_staff_has_conflict: {
        Args: {
          _ends_at: string
          _shop_id: string
          _staff_id: string
          _starts_at: string
        }
        Returns: boolean
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalc_customer_last_visit: {
        Args: { _customer_id: string }
        Returns: undefined
      }
      recalc_customer_total_spent: {
        Args: { _customer_id: string }
        Returns: undefined
      }
      shop_can_accept_bookings: { Args: { _shop_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "shop_owner"
        | "staff"
        | "customer"
        | "admin"
        | "support"
        | "read_only_admin"
      booking_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      notification_type: "system" | "billing" | "bookings" | "alerts" | "admin"
      payment_status: "unpaid" | "deposit_paid" | "paid" | "refunded" | "failed"
      shop_status: "active" | "suspended" | "pending"
      subscription_plan: "trial" | "starter" | "pro" | "premium"
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
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "shop_owner",
        "staff",
        "customer",
        "admin",
        "support",
        "read_only_admin",
      ],
      booking_status: [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      notification_type: ["system", "billing", "bookings", "alerts", "admin"],
      payment_status: ["unpaid", "deposit_paid", "paid", "refunded", "failed"],
      shop_status: ["active", "suspended", "pending"],
      subscription_plan: ["trial", "starter", "pro", "premium"],
    },
  },
} as const
