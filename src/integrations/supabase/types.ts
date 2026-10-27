// Types for the MMS Jersey database functions (see supabase/migrations).
// The app never touches tables directly: everything goes through public.jersey_* functions.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type JerseySettings = {
  season_label: string;
  unit_price: number;
  sizes: string[];
  parents_can_change_size: boolean;
  orders_open: boolean;
  upi_id: string;
  payee_name: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_name: string;
  bank_ifsc: string;
  bank_branch: string;
  contact_note: string;
};

export type PaymentStatus = "pending" | "submitted" | "verified" | "rejected";
export type OrderState = PaymentStatus | "none";

export type PublicPlayer = {
  id: string;
  full_name: string;
  class_name: string | null;
  jersey_number: number | null;
  print_name: string | null;
  jersey_size: string | null;
  order_state: OrderState;
};

export type AdminPlayer = Omit<PublicPlayer, "order_state"> & {
  is_active: boolean;
  order_id: string | null;
  order_state: OrderState;
  payment_method: string | null;
};

export type JerseyOrder = {
  id: number;
  created_at: string;
  order_id: string;
  player_id: string | null;
  player_name: string;
  class_name: string | null;
  jersey_number: number | null;
  print_name: string | null;
  jersey_size: string;
  amount: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_proof: string | null;
  payment_reference: string | null;
  payment_submitted_at: string | null;
  payment_received_amount: number | null;
  payment_verified_at: string | null;
  payment_verified_by: string | null;
  payment_rejection_reason: string | null;
  order_status: string;
  admin_notes: string | null;
};

type Fn<Args, Returns> = { Args: Args; Returns: Returns };

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      jersey_is_admin: Fn<Record<string, never>, boolean>;
      jersey_get_settings: Fn<Record<string, never>, JerseySettings>;
      jersey_list_players: Fn<Record<string, never>, PublicPlayer[]>;
      jersey_place_order: Fn<
        {
          p_player_id: string;
          p_jersey_size: string;
          p_payment_method: string;
          p_payment_proof: string;
          p_payment_reference?: string | undefined;
        },
        JerseyOrder & { access_token: string }
      >;
      jersey_get_order: Fn<{ p_order_id: string; p_access_token: string }, JerseyOrder>;
      jersey_admin_list_orders: Fn<Record<string, never>, JerseyOrder[]>;
      jersey_admin_list_players: Fn<Record<string, never>, AdminPlayer[]>;
      jersey_admin_save_player: Fn<
        {
          p_id?: string | undefined;
          p_full_name: string;
          p_class_name?: string | undefined;
          p_jersey_number?: number | undefined;
          p_print_name?: string | undefined;
          p_jersey_size?: string | undefined;
          p_is_active?: boolean | undefined;
        },
        string
      >;
      jersey_admin_import_players: Fn<{ p_rows: Json }, number>;
      jersey_admin_delete_player: Fn<{ p_id: string }, undefined>;
      jersey_admin_verify_payment: Fn<
        { p_id: number; p_received_amount?: number | undefined },
        JerseyOrder
      >;
      jersey_admin_reject_payment: Fn<{ p_id: number; p_reason: string }, JerseyOrder>;
      jersey_admin_reopen_payment: Fn<{ p_id: number }, JerseyOrder>;
      jersey_admin_record_cash: Fn<
        {
          p_player_id: string;
          p_received_amount: number;
          p_jersey_size?: string | undefined;
          p_note?: string | undefined;
        },
        JerseyOrder
      >;
      jersey_admin_set_proof: Fn<{ p_id: number; p_path: string }, JerseyOrder>;
      jersey_admin_update_order: Fn<
        { p_id: number; p_order_status: string; p_admin_notes: string },
        JerseyOrder
      >;
      jersey_admin_delete_order: Fn<{ p_id: number }, undefined>;
      jersey_admin_save_settings: Fn<{ p: Json }, JerseySettings>;
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
