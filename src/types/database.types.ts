export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ShopRole = 'owner' | 'manager' | 'staff';
export type AccountStatus = 'pending_approval' | 'active' | 'suspended' | 'deactivated';
export type ShopMemberStatus = 'invited' | 'active' | 'removed';
export type SubstitutionPreference = 'substitute' | 'skip' | 'call_me';
export type DeliveryPeriod = 'morning' | 'afternoon' | 'evening' | 'anytime';

export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'businesses_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          account_status: AccountStatus;
          status_reason: string | null;
          active_shop_id?: string | null;
          role?: ShopRole | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          account_status?: AccountStatus;
          status_reason?: string | null;
          active_shop_id?: string | null;
          role?: ShopRole | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          account_status?: AccountStatus;
          status_reason?: string | null;
          active_shop_id?: string | null;
          role?: ShopRole | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shops: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          owner_name: string | null;
          address: string | null;
          phone: string | null;
          alt_phone: string | null;
          email: string | null;
          business_type: string | null;
          city: string | null;
          area: string | null;
          lat: number | null;
          lng: number | null;
          ntn: string | null;
          strn: string | null;
          tax_registered: boolean;
          default_delivery_instructions: string | null;
          approval_threshold: number | null;
          preferred_delivery_period: DeliveryPeriod | null;
          standing_instructions: string | null;
          substitution_preference: SubstitutionPreference | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          owner_name?: string | null;
          address?: string | null;
          phone?: string | null;
          alt_phone?: string | null;
          email?: string | null;
          business_type?: string | null;
          city?: string | null;
          area?: string | null;
          lat?: number | null;
          lng?: number | null;
          ntn?: string | null;
          strn?: string | null;
          tax_registered?: boolean;
          default_delivery_instructions?: string | null;
          approval_threshold?: number | null;
          preferred_delivery_period?: DeliveryPeriod | null;
          standing_instructions?: string | null;
          substitution_preference?: SubstitutionPreference | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          owner_name?: string | null;
          address?: string | null;
          phone?: string | null;
          alt_phone?: string | null;
          email?: string | null;
          business_type?: string | null;
          city?: string | null;
          area?: string | null;
          lat?: number | null;
          lng?: number | null;
          ntn?: string | null;
          strn?: string | null;
          tax_registered?: boolean;
          default_delivery_instructions?: string | null;
          approval_threshold?: number | null;
          preferred_delivery_period?: DeliveryPeriod | null;
          standing_instructions?: string | null;
          substitution_preference?: SubstitutionPreference | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shops_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      delivery_zones: {
        Row: {
          id: string;
          name: string;
          fee: number;
          min_order_amount: number;
          active: boolean;
          areas: string[];
          polygon: Json | null;
          available_slots: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          fee?: number;
          min_order_amount?: number;
          active?: boolean;
          areas?: string[];
          polygon?: Json | null;
          available_slots?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          fee?: number;
          min_order_amount?: number;
          active?: boolean;
          areas?: string[];
          polygon?: Json | null;
          available_slots?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customer_addresses: {
        Row: {
          id: string;
          shop_id: string;
          label: string;
          full_address: string;
          zone_id: string | null;
          lat: number | null;
          lng: number | null;
          contact_name: string | null;
          contact_phone: string | null;
          instructions: string | null;
          is_default: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          label: string;
          full_address: string;
          zone_id?: string | null;
          lat?: number | null;
          lng?: number | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          instructions?: string | null;
          is_default?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          label?: string;
          full_address?: string;
          zone_id?: string | null;
          lat?: number | null;
          lng?: number | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          instructions?: string | null;
          is_default?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_addresses_shop_id_fkey';
            columns: ['shop_id'];
            isOneToOne: false;
            referencedRelation: 'shops';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'customer_addresses_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'delivery_zones';
            referencedColumns: ['id'];
          },
        ];
      };
      shop_contacts: {
        Row: {
          id: string;
          shop_id: string;
          name: string;
          role: string | null;
          phone: string;
          email: string | null;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          name: string;
          role?: string | null;
          phone: string;
          email?: string | null;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          name?: string;
          role?: string | null;
          phone?: string;
          email?: string | null;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shop_contacts_shop_id_fkey';
            columns: ['shop_id'];
            isOneToOne: false;
            referencedRelation: 'shops';
            referencedColumns: ['id'];
          },
        ];
      };
      shop_users: {
        Row: {
          id: string;
          shop_id: string;
          user_id: string;
          role: ShopRole;
          status: ShopMemberStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          user_id: string;
          role: ShopRole;
          status?: ShopMemberStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          user_id?: string;
          role?: ShopRole;
          status?: ShopMemberStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shop_users_shop_id_fkey';
            columns: ['shop_id'];
            isOneToOne: false;
            referencedRelation: 'shops';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shop_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      account_deletion_requests: {
        Row: {
          id: string;
          user_id: string;
          reason: string | null;
          status: 'pending' | 'approved' | 'rejected' | 'completed';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          reason?: string | null;
          status?: 'pending' | 'approved' | 'rejected' | 'completed';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          reason?: string | null;
          status?: 'pending' | 'approved' | 'rejected' | 'completed';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'account_deletion_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          code: string;
          shop_id: string;
          phone: string | null;
          email: string | null;
          role: ShopRole;
          invited_by: string | null;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          shop_id: string;
          phone?: string | null;
          email?: string | null;
          role: ShopRole;
          invited_by?: string | null;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          shop_id?: string;
          phone?: string | null;
          email?: string | null;
          role?: ShopRole;
          invited_by?: string | null;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invitations_shop_id_fkey';
            columns: ['shop_id'];
            isOneToOne: false;
            referencedRelation: 'shops';
            referencedColumns: ['id'];
          },
        ];
      };
      otp_rate_limits: {
        Row: {
          id: string;
          phone: string;
          attempts_in_window: number;
          verify_attempts: number;
          window_start: string;
          last_request_at: string;
          cooldown_until: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          phone: string;
          attempts_in_window?: number;
          verify_attempts?: number;
          window_start?: string;
          last_request_at?: string;
          cooldown_until?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          phone?: string;
          attempts_in_window?: number;
          verify_attempts?: number;
          window_start?: string;
          last_request_at?: string;
          cooldown_until?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          id: string;
          key: string;
          value: Json;
          minimum_app_version: string;
          force_update_message: string | null;
          store_url: string | null;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          key: string;
          value?: Json;
          minimum_app_version?: string;
          force_update_message?: string | null;
          store_url?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          key?: string;
          value?: Json;
          minimum_app_version?: string;
          force_update_message?: string | null;
          store_url?: string | null;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'app_settings_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          shop_id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_shop_id_fkey';
            columns: ['shop_id'];
            isOneToOne: false;
            referencedRelation: 'shops';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      idempotency_keys: {
        Row: {
          key: string;
          shop_id: string;
          user_id: string;
          response_code: number;
          response_body: Json;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          key: string;
          shop_id: string;
          user_id: string;
          response_code: number;
          response_body: Json;
          created_at?: string;
          expires_at: string;
        };
        Update: {
          key?: string;
          shop_id?: string;
          user_id?: string;
          response_code?: number;
          response_body?: Json;
          created_at?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'idempotency_keys_shop_id_fkey';
            columns: ['shop_id'];
            isOneToOne: false;
            referencedRelation: 'shops';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'idempotency_keys_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_shop_member: {
        Args: {
          lookup_shop_id: string;
        };
        Returns: boolean;
      };
      shop_role: {
        Args: {
          lookup_shop_id: string;
        };
        Returns: string | null;
      };
      is_shop_owner_or_manager: {
        Args: {
          lookup_shop_id: string;
        };
        Returns: boolean;
      };
      check_otp_rate_limit: {
        Args: {
          p_phone: string;
        };
        Returns: Json;
      };
      record_otp_verification_failure: {
        Args: {
          p_phone: string;
        };
        Returns: Json;
      };
      reset_otp_rate_limit: {
        Args: {
          p_phone: string;
        };
        Returns: void;
      };
      register_self_with_business: {
        Args: {
          p_user_id: string;
          p_email: string;
          p_phone: string;
          p_full_name: string;
          p_business_name: string;
          p_shop_name: string;
          p_shop_address: string;
        };
        Returns: Json;
      };
      accept_invitation: {
        Args: {
          p_code: string;
          p_user_id: string;
          p_email: string;
          p_phone: string;
          p_full_name: string;
        };
        Returns: Json;
      };
      submit_account_deletion_request: {
        Args: {
          p_reason?: string;
        };
        Returns: Json;
      };
      store_idempotency_result: {
        Args: {
          p_key: string;
          p_shop_id: string;
          p_user_id: string;
          p_response_code: number;
          p_response_body: Json;
          p_ttl_seconds?: number;
        };
        Returns: Json;
      };
      validate_credit_limit: {
        Args: {
          p_customer_id: string;
          p_amount: number;
        };
        Returns: boolean;
      };
      get_shop_members: {
        Args: {
          p_shop_id: string;
        };
        Returns: {
          user_id: string;
          role: ShopRole;
          status: ShopMemberStatus;
          full_name: string | null;
          email: string;
          phone: string | null;
          joined_at: string;
        }[];
      };
      invite_staff: {
        Args: {
          p_shop_id: string;
          p_phone: string;
          p_role: ShopRole;
        };
        Returns: Json;
      };
      change_role: {
        Args: {
          p_shop_id: string;
          p_target_user_id: string;
          p_new_role: ShopRole;
        };
        Returns: Json;
      };
      remove_staff: {
        Args: {
          p_shop_id: string;
          p_target_user_id: string;
        };
        Returns: Json;
      };
      update_shop_profile: {
        Args: {
          p_shop_id: string;
          p_expected_updated_at: string | null;
          p_name?: string | null;
          p_owner_name?: string | null;
          p_phone?: string | null;
          p_alt_phone?: string | null;
          p_email?: string | null;
          p_business_type?: string | null;
          p_city?: string | null;
          p_area?: string | null;
          p_lat?: number | null;
          p_lng?: number | null;
          p_ntn?: string | null;
          p_strn?: string | null;
          p_tax_registered?: boolean;
          p_default_delivery_instructions?: string | null;
          p_approval_threshold?: number | null;
        };
        Returns: Json;
      };
      check_address_serviceable: {
        Args: {
          p_lat: number | null;
          p_lng: number | null;
          p_city?: string | null;
          p_area?: string | null;
          p_full_address?: string | null;
        };
        Returns: Json;
      };
      save_customer_address: {
        Args: {
          p_shop_id: string;
          p_address_id: string | null;
          p_label: string;
          p_full_address: string;
          p_lat: number | null;
          p_lng: number | null;
          p_area?: string | null;
          p_contact_name?: string | null;
          p_contact_phone?: string | null;
          p_instructions?: string | null;
          p_is_default?: boolean;
          p_expected_updated_at?: string | null;
        };
        Returns: Json;
      };
      set_default_address: {
        Args: {
          p_shop_id: string;
          p_address_id: string;
        };
        Returns: Json;
      };
      delete_customer_address: {
        Args: {
          p_address_id: string;
        };
        Returns: Json;
      };
      update_shop_delivery_preferences: {
        Args: {
          p_shop_id: string;
          p_period?: string | null;
          p_instructions?: string | null;
          p_substitution?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      shop_role: ShopRole;
      account_status: AccountStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Shop = Tables<'shops'>;
export type ShopInsert = TablesInsert<'shops'>;
export type ShopUpdate = TablesUpdate<'shops'>;
export type ShopContact = Tables<'shop_contacts'>;
export type ShopContactInsert = TablesInsert<'shop_contacts'>;
export type ShopContactUpdate = TablesUpdate<'shop_contacts'>;
export type ShopUser = Tables<'shop_users'>;
export type DeliveryZone = Tables<'delivery_zones'>;
export type DeliveryZoneInsert = TablesInsert<'delivery_zones'>;
export type DeliveryZoneUpdate = TablesUpdate<'delivery_zones'>;
export type CustomerAddress = Tables<'customer_addresses'>;
export type CustomerAddressInsert = TablesInsert<'customer_addresses'>;
export type CustomerAddressUpdate = TablesUpdate<'customer_addresses'>;

export interface ShopDeliveryPreferences {
  preferredDeliveryPeriod: DeliveryPeriod;
  standingInstructions: string | null;
  substitutionPreference: SubstitutionPreference;
}

export interface ServiceableZoneResult {
  serviceable: boolean;
  zoneId: string;
  zoneName: string;
  fee: number;
  minOrderAmount: number;
  availableSlots: string[];
}

export interface ShopMember {
  userId: string;
  role: ShopRole;
  status: ShopMemberStatus;
  fullName: string | null;
  email: string;
  phone: string | null;
  joinedAt: string;
}

