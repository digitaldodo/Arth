/**
 * PostgreSQL Database Schema Types for Arth.
 * Represents the database tables, enums, views, and RPC functions created by migrations 0001-0024.
 * Kept separate from shared client-facing API contracts (@arth/contracts).
 */

export type TransactionType = 'income' | 'expense';
export type PaymentMethod = 'online' | 'cash';
export type NecessityClass = 'essential' | 'optional' | 'luxury';
export type OutboxStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type BalanceMovementType = 'transfer' | 'adjustment';

export interface ProfileRow {
  id: string; // UUID references auth.users(id)
  display_name: string | null;
  username?: string | null;
  timezone: string; // default: 'Asia/Kolkata'
  currency: string; // default: 'INR'
  starting_cash_paise?: number | bigint;
  starting_online_paise?: number | bigint;
  balances_configured?: boolean;
  balances_configured_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryRow {
  id: string; // UUID
  user_id: string; // UUID references profiles(id)
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_default: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionRow {
  id: string; // UUID v7
  user_id: string; // UUID references profiles(id)
  amount_paise: number | bigint; // strictly positive integer paise
  type: TransactionType;
  category_id: string; // UUID references categories(id)
  transaction_date: string; // YYYY-MM-DD
  payment_method: PaymentMethod;
  necessity: NecessityClass | null; // required if expense, null if income
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null; // soft-delete
  sheets_synced_at: string | null;
}

export interface OutboxEventRow {
  id: string; // UUID
  user_id: string; // UUID references profiles(id)
  entity_type: string; // 'transaction'
  entity_id: string; // UUID
  event_type: 'transaction.created' | 'transaction.updated' | 'transaction.deleted' | 'transaction.restored';
  payload: Record<string, unknown>;
  status: OutboxStatus;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface BalanceMovementRow {
  id: string; // UUID v7
  user_id: string; // UUID references profiles(id)
  movement_type: BalanceMovementType;
  from_method: PaymentMethod | null;
  to_method: PaymentMethod | null;
  payment_method: PaymentMethod | null;
  amount_paise: number | bigint;
  adjustment_paise: number | bigint;
  reason: string | null;
  movement_date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: Partial<ProfileRow>;
      };
      categories: {
        Row: CategoryRow;
        Insert: Omit<CategoryRow, 'created_at' | 'updated_at'>;
        Update: Partial<CategoryRow>;
      };
      transactions: {
        Row: TransactionRow;
        Insert: Omit<TransactionRow, 'created_at' | 'updated_at'>;
        Update: Partial<TransactionRow>;
      };
      outbox_events: {
        Row: OutboxEventRow;
        Insert: Omit<OutboxEventRow, 'created_at' | 'processed_at'>;
        Update: Partial<OutboxEventRow>;
      };
      balance_movements: {
        Row: BalanceMovementRow;
        Insert: Omit<BalanceMovementRow, 'created_at' | 'updated_at'>;
        Update: Partial<BalanceMovementRow>;
      };
    };
    Functions: {
      fn_account_balances: {
        Args: Record<string, never>;
        Returns: {
          starting_cash_paise: number;
          starting_online_paise: number;
          starting_total_paise: number;
          current_cash_paise: number;
          current_online_paise: number;
          total_available_paise: number;
          balances_configured: boolean;
          balances_configured_at: string | null;
        };
      };
      fn_configure_starting_balances: {
        Args: {
          p_starting_cash_paise: number | bigint;
          p_starting_online_paise: number | bigint;
        };
        Returns: Record<string, unknown>;
      };
      fn_dashboard_summary: {
        Args: {
          p_start_date: string;
          p_end_date: string;
        };
        Returns: Record<string, unknown>;
      };
    };
  };
}
