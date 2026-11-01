import {
  parseINRToPaise,
  type CreateTransactionRequest,
  type TransactionListQuery,
  type CategoryListQuery,
  type TransactionType,
  type PaymentMethod,
  type NecessityClass,
} from '@arth/contracts';

// RFC 9562 UUID v7 regex (verifies version 7 and variant bits)
const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extractTimestampFromUuidV7(id: string): Date | null {
  if (!UUID_V7_REGEX.test(id)) return null;
  const hex = id.substring(0, 8) + id.substring(9, 13);
  const ms = parseInt(hex, 16);
  if (isNaN(ms) || ms <= 0) return null;
  return new Date(ms);
}
// Standard UUID regex for category references
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// YYYY-MM-DD date regex
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class ValidationError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  public readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface ValidatedCreateTransactionInput {
  id: string;
  amount_paise: bigint;
  type: TransactionType;
  category_id: string;
  transaction_date: string;
  payment_method: PaymentMethod;
  necessity: NecessityClass | null;
  description: string | null;
  notes: string | null;
  recorded_at: string;
  created_at?: string;
}

export interface ValidatedTransactionListQuery {
  page: number;
  page_size: number;
  type?: TransactionType;
  category_id?: string;
  necessity?: NecessityClass;
  start_date?: string;
  end_date?: string;
}

export interface ValidatedCategoryListQuery {
  type?: TransactionType;
}

/**
 * Validates transaction creation request body according to Arth financial rules.
 */
export function validateCreateTransactionRequest(body: unknown): ValidatedCreateTransactionInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const payload = body as Record<string, unknown>;

  // 1. Validate ID (must be client-generated UUID v7)
  if (typeof payload.id !== 'string' || !UUID_V7_REGEX.test(payload.id)) {
    throw new ValidationError('Invalid transaction ID: must be a valid UUID v7');
  }

  // 2. Validate Type
  if (payload.type !== 'income' && payload.type !== 'expense') {
    throw new ValidationError("Transaction type must be 'income' or 'expense'");
  }
  const type: TransactionType = payload.type;

  // 3. Validate Amount (Exact decimal string converted to integer paise)
  if (typeof payload.amount !== 'string') {
    throw new ValidationError('Amount must be provided as a decimal string');
  }
  let amount_paise: bigint;
  try {
    amount_paise = parseINRToPaise(payload.amount);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid amount';
    throw new ValidationError(msg);
  }

  // 4. Validate Category ID
  if (typeof payload.category_id !== 'string' || !UUID_REGEX.test(payload.category_id)) {
    throw new ValidationError('Category ID must be a valid UUID');
  }

  // 5. Validate Transaction Date
  if (typeof payload.transaction_date !== 'string' || !DATE_REGEX.test(payload.transaction_date)) {
    throw new ValidationError('Transaction date must be in YYYY-MM-DD format');
  }
  const [year, month, day] = payload.transaction_date.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    isNaN(parsedDate.getTime()) ||
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new ValidationError('Transaction date is not a valid calendar date');
  }

  // 6. Validate Payment Method
  if (payload.payment_method !== 'online' && payload.payment_method !== 'cash') {
    throw new ValidationError("Payment method must be 'online' or 'cash'");
  }
  const payment_method: PaymentMethod = payload.payment_method;

  // 7. Validate Necessity
  let necessity: NecessityClass | null = null;
  if (type === 'expense') {
    if (
      payload.necessity !== 'essential' &&
      payload.necessity !== 'optional' &&
      payload.necessity !== 'luxury'
    ) {
      throw new ValidationError(
        "Expense transactions require a valid necessity ('essential', 'optional', or 'luxury')"
      );
    }
    necessity = payload.necessity;
  } else {
    // Income transactions must NOT have necessity
    if (payload.necessity !== undefined && payload.necessity !== null && payload.necessity !== '') {
      throw new ValidationError('Income transactions must not have a necessity value');
    }
    necessity = null;
  }

  // 8. Description & Notes
  let description: string | null = null;
  if (typeof payload.description === 'string') {
    const trimmed = payload.description.trim();
    if (trimmed.length > 500) {
      throw new ValidationError('Description cannot exceed 500 characters');
    }
    description = trimmed.length > 0 ? trimmed : null;
  }

  let notes: string | null = null;
  if (typeof payload.notes === 'string') {
    const trimmed = payload.notes.trim();
    if (trimmed.length > 1000) {
      throw new ValidationError('Notes cannot exceed 1000 characters');
    }
    notes = trimmed.length > 0 ? trimmed : null;
  }

  // 9. Validate Recording Timestamp (preserves original recording timestamp across offline sync)
  let recorded_at: string;
  if (payload.recorded_at !== undefined && payload.recorded_at !== null) {
    if (typeof payload.recorded_at !== 'string' || isNaN(Date.parse(payload.recorded_at))) {
      throw new ValidationError('recorded_at must be a valid ISO 8601 timestamp string');
    }
    recorded_at = new Date(payload.recorded_at).toISOString();
  } else if (payload.created_at !== undefined && payload.created_at !== null) {
    if (typeof payload.created_at !== 'string' || isNaN(Date.parse(payload.created_at))) {
      throw new ValidationError('created_at must be a valid ISO 8601 timestamp string');
    }
    recorded_at = new Date(payload.created_at).toISOString();
  } else {
    const extracted = extractTimestampFromUuidV7(payload.id as string);
    recorded_at = extracted ? extracted.toISOString() : new Date().toISOString();
  }

  let created_at: string | undefined = undefined;
  if (payload.created_at !== undefined && payload.created_at !== null) {
    if (typeof payload.created_at === 'string' && !isNaN(Date.parse(payload.created_at))) {
      created_at = new Date(payload.created_at).toISOString();
    }
  }

  return {
    id: (payload.id as string).toLowerCase(),
    amount_paise,
    type,
    category_id: (payload.category_id as string).toLowerCase(),
    transaction_date: payload.transaction_date as string,
    payment_method,
    necessity,
    description,
    notes,
    recorded_at,
    created_at,
  };
}

/**
 * Validates query parameters for transaction listing.
 */
export function validateTransactionListQuery(
  query: Record<string, unknown>
): ValidatedTransactionListQuery {
  let page = 1;
  if (query.page !== undefined) {
    const parsed = parseInt(String(query.page), 10);
    if (isNaN(parsed) || parsed < 1) {
      throw new ValidationError('Page must be a positive integer greater than or equal to 1');
    }
    page = parsed;
  }

  let page_size = 20;
  if (query.page_size !== undefined) {
    const parsed = parseInt(String(query.page_size), 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 100) {
      throw new ValidationError('Page size must be between 1 and 100');
    }
    page_size = parsed;
  }

  let type: TransactionType | undefined = undefined;
  if (query.type !== undefined) {
    if (query.type !== 'income' && query.type !== 'expense') {
      throw new ValidationError("Query type must be 'income' or 'expense'");
    }
    type = query.type;
  }

  let category_id: string | undefined = undefined;
  if (query.category_id !== undefined) {
    if (typeof query.category_id !== 'string' || !UUID_REGEX.test(query.category_id)) {
      throw new ValidationError('Query category_id must be a valid UUID');
    }
    category_id = query.category_id.toLowerCase();
  }

  let necessity: NecessityClass | undefined = undefined;
  if (query.necessity !== undefined) {
    if (
      query.necessity !== 'essential' &&
      query.necessity !== 'optional' &&
      query.necessity !== 'luxury'
    ) {
      throw new ValidationError("Query necessity must be 'essential', 'optional', or 'luxury'");
    }
    necessity = query.necessity as NecessityClass;
  }

  let start_date: string | undefined = undefined;
  if (query.start_date !== undefined) {
    if (typeof query.start_date !== 'string' || !DATE_REGEX.test(query.start_date)) {
      throw new ValidationError('Query start_date must be in YYYY-MM-DD format');
    }
    start_date = query.start_date;
  }

  let end_date: string | undefined = undefined;
  if (query.end_date !== undefined) {
    if (typeof query.end_date !== 'string' || !DATE_REGEX.test(query.end_date)) {
      throw new ValidationError('Query end_date must be in YYYY-MM-DD format');
    }
    end_date = query.end_date;
  }

  return {
    page,
    page_size,
    type,
    category_id,
    necessity,
    start_date,
    end_date,
  };
}

/**
 * Validates query parameters for category listing.
 */
export function validateCategoryListQuery(
  query: Record<string, unknown>
): ValidatedCategoryListQuery {
  let type: TransactionType | undefined = undefined;
  if (query.type !== undefined) {
    if (query.type !== 'income' && query.type !== 'expense') {
      throw new ValidationError("Query type must be 'income' or 'expense'");
    }
    type = query.type;
  }

  return { type };
}

export function validateTransactionId(id: unknown): string {
  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    throw new ValidationError('Invalid transaction ID: must be a valid UUID');
  }
  return id.toLowerCase();
}

export interface ValidatedUpdateTransactionInput {
  user_id?: string;
  amount_paise?: bigint;
  type?: TransactionType;
  category_id?: string;
  transaction_date?: string;
  payment_method?: PaymentMethod;
  necessity?: NecessityClass | null;
  description?: string | null;
  notes?: string | null;
}

export function validateUpdateTransactionRequest(body: unknown): ValidatedUpdateTransactionInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const payload = body as Record<string, unknown>;
  const result: ValidatedUpdateTransactionInput = {};

  if (payload.user_id !== undefined) {
    if (typeof payload.user_id !== 'string') {
      throw new ValidationError('user_id must be a string');
    }
    result.user_id = payload.user_id;
  }

  if (payload.type !== undefined) {
    if (payload.type !== 'income' && payload.type !== 'expense') {
      throw new ValidationError("Transaction type must be 'income' or 'expense'");
    }
    result.type = payload.type;
  }

  if (payload.amount !== undefined) {
    if (typeof payload.amount !== 'string') {
      throw new ValidationError('Amount must be provided as a decimal string');
    }
    try {
      result.amount_paise = parseINRToPaise(payload.amount);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid amount';
      throw new ValidationError(msg);
    }
  }

  if (payload.category_id !== undefined) {
    if (typeof payload.category_id !== 'string' || !UUID_REGEX.test(payload.category_id)) {
      throw new ValidationError('Category ID must be a valid UUID');
    }
    result.category_id = payload.category_id.toLowerCase();
  }

  if (payload.transaction_date !== undefined) {
    if (typeof payload.transaction_date !== 'string' || !DATE_REGEX.test(payload.transaction_date)) {
      throw new ValidationError('Transaction date must be in YYYY-MM-DD format');
    }
    const [year, month, day] = payload.transaction_date.split('-').map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (
      isNaN(parsedDate.getTime()) ||
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day
    ) {
      throw new ValidationError('Transaction date is not a valid calendar date');
    }
    result.transaction_date = payload.transaction_date;
  }

  if (payload.payment_method !== undefined) {
    if (payload.payment_method !== 'online' && payload.payment_method !== 'cash') {
      throw new ValidationError("Payment method must be 'online' or 'cash'");
    }
    result.payment_method = payload.payment_method;
  }

  if (payload.necessity !== undefined) {
    if (result.type === 'expense' || payload.type === 'expense') {
      if (
        payload.necessity !== 'essential' &&
        payload.necessity !== 'optional' &&
        payload.necessity !== 'luxury'
      ) {
        throw new ValidationError(
          "Expense transactions require a valid necessity ('essential', 'optional', or 'luxury')"
        );
      }
      result.necessity = payload.necessity;
    } else if (result.type === 'income' || payload.type === 'income') {
      if (payload.necessity !== null && payload.necessity !== '') {
        throw new ValidationError('Income transactions must not have a necessity value');
      }
      result.necessity = null;
    } else {
      if (
        payload.necessity !== null &&
        payload.necessity !== 'essential' &&
        payload.necessity !== 'optional' &&
        payload.necessity !== 'luxury'
      ) {
        throw new ValidationError('Invalid necessity value');
      }
      result.necessity = payload.necessity as NecessityClass | null;
    }
  }

  if (payload.description !== undefined) {
    if (payload.description === null) {
      result.description = null;
    } else if (typeof payload.description === 'string') {
      const trimmed = payload.description.trim();
      if (trimmed.length > 500) {
        throw new ValidationError('Description cannot exceed 500 characters');
      }
      result.description = trimmed.length > 0 ? trimmed : null;
    } else {
      throw new ValidationError('Description must be a string or null');
    }
  }

  if (payload.notes !== undefined) {
    if (payload.notes === null) {
      result.notes = null;
    } else if (typeof payload.notes === 'string') {
      const trimmed = payload.notes.trim();
      if (trimmed.length > 1000) {
        throw new ValidationError('Notes cannot exceed 1000 characters');
      }
      result.notes = trimmed.length > 0 ? trimmed : null;
    } else {
      throw new ValidationError('Notes must be a string or null');
    }
  }

  return result;
}
