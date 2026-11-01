import type { PaymentMethod } from './transactions.js';

export interface AccountBalancesDTO {
  starting_cash_paise: number;
  starting_online_paise: number;
  starting_total_paise: number;
  current_cash_paise: number;
  current_online_paise: number;
  total_available_paise: number;
  formatted_starting_cash: string;
  formatted_starting_online: string;
  formatted_starting_total: string;
  formatted_current_cash: string;
  formatted_current_online: string;
  formatted_total_available: string;
  balances_configured: boolean;
  balances_configured_at: string | null;
}

export interface ConfigureStartingBalancesRequest {
  starting_cash: string; // e.g. "5000" or "0.00"
  starting_online: string; // e.g. "25000" or "0.00"
}

export interface BalanceMovementDTO {
  id: string;
  movement_type: 'transfer' | 'adjustment';
  from_method?: PaymentMethod | null;
  to_method?: PaymentMethod | null;
  payment_method?: PaymentMethod | null;
  amount_paise: number;
  adjustment_paise: number;
  formatted_amount: string;
  reason?: string | null;
  movement_date: string; // YYYY-MM-DD
  recorded_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTransferRequest {
  id?: string; // Client-generated UUID v7
  amount: string; // Positive decimal string in INR
  from_method: PaymentMethod;
  to_method: PaymentMethod;
  movement_date?: string; // YYYY-MM-DD
  reason?: string | null;
  recorded_at?: string;
}

export interface CreateAdjustmentRequest {
  id?: string; // Client-generated UUID v7
  payment_method: PaymentMethod;
  amount: string; // Decimal string in INR (positive amount)
  direction: 'increase' | 'decrease'; // Direction of adjustment
  reason: string; // Required audit explanation
  movement_date?: string; // YYYY-MM-DD
  recorded_at?: string;
}

export interface BalanceMovementListResponse {
  items: BalanceMovementDTO[];
  total_count: number;
}
