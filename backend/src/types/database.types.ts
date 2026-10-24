/**
 * PostgreSQL Database Schema Types for Arth.
 * Represents the database tables, enums, and views created by migrations 0001-0007.
 * Kept separate from shared client-facing API contracts (@arth/contracts).
 */

export type TransactionType = 'income' | 'expense';
export type PaymentMethod = 'online' | 'cash';
export type NecessityClass = 'essential' | 'optional' | 'luxury';
export type OutboxStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ProfileRow {
  id: string; // UUID references auth.users(id)
  display_name: string | null;
  timezone: string; // default: 'Asia/Kolkata'
  currency: string; // default: 'INR'
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
