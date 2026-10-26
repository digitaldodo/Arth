import {
  parseINRToPaise,
  parseNonNegativeINRToPaise,
  type PaymentMethod,
  type ConfigureStartingBalancesRequest,
  type CreateTransferRequest,
  type CreateAdjustmentRequest,
} from '@arth/contracts';

export class BalanceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BalanceValidationError';
  }
}

export interface ValidatedConfigureStartingBalances {
  starting_cash_paise: bigint;
  starting_online_paise: bigint;
}

export interface ValidatedCreateTransfer {
  id?: string;
  amount_paise: bigint;
  from_method: PaymentMethod;
  to_method: PaymentMethod;
  movement_date?: string;
  reason?: string | null;
}

export interface ValidatedCreateAdjustment {
  id?: string;
  payment_method: PaymentMethod;
  adjustment_paise: bigint;
  direction: 'increase' | 'decrease';
  reason: string;
  movement_date?: string;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function validateConfigureStartingBalances(
  body: unknown
): ValidatedConfigureStartingBalances {
  if (!body || typeof body !== 'object') {
    throw new BalanceValidationError('Request body must be a JSON object');
  }

  const { starting_cash, starting_online } =
    body as Partial<ConfigureStartingBalancesRequest>;

  if (typeof starting_cash !== 'string') {
    throw new BalanceValidationError('starting_cash must be a string amount in INR');
  }

  if (typeof starting_online !== 'string') {
    throw new BalanceValidationError('starting_online must be a string amount in INR');
  }

  let cashPaise: bigint;
  let onlinePaise: bigint;

  try {
    cashPaise = parseNonNegativeINRToPaise(starting_cash);
  } catch (err) {
    throw new BalanceValidationError(
      `Invalid starting_cash: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    onlinePaise = parseNonNegativeINRToPaise(starting_online);
  } catch (err) {
    throw new BalanceValidationError(
      `Invalid starting_online: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    starting_cash_paise: cashPaise,
    starting_online_paise: onlinePaise,
  };
}

export function validateCreateTransfer(body: unknown): ValidatedCreateTransfer {
  if (!body || typeof body !== 'object') {
    throw new BalanceValidationError('Request body must be a JSON object');
  }

  const { id, amount, from_method, to_method, movement_date, reason } =
    body as Partial<CreateTransferRequest>;

  if (typeof amount !== 'string') {
    throw new BalanceValidationError('amount must be a string amount in INR');
  }

  let amountPaise: bigint;
  try {
    amountPaise = parseINRToPaise(amount);
  } catch (err) {
    throw new BalanceValidationError(
      `Invalid transfer amount: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (from_method !== 'cash' && from_method !== 'online') {
    throw new BalanceValidationError('from_method must be either "cash" or "online"');
  }

  if (to_method !== 'cash' && to_method !== 'online') {
    throw new BalanceValidationError('to_method must be either "cash" or "online"');
  }

  if (from_method === to_method) {
    throw new BalanceValidationError('from_method and to_method must be different');
  }

  if (movement_date !== undefined && movement_date !== null) {
    if (typeof movement_date !== 'string' || !isValidDate(movement_date)) {
      throw new BalanceValidationError('movement_date must be a valid date in YYYY-MM-DD format');
    }
  }

  return {
    id: typeof id === 'string' && id.trim() ? id.trim() : undefined,
    amount_paise: amountPaise,
    from_method,
    to_method,
    movement_date: movement_date || undefined,
    reason: typeof reason === 'string' ? reason.trim() : null,
  };
}

export function validateCreateAdjustment(body: unknown): ValidatedCreateAdjustment {
  if (!body || typeof body !== 'object') {
    throw new BalanceValidationError('Request body must be a JSON object');
  }

  const { id, payment_method, amount, direction, reason, movement_date } =
    body as Partial<CreateAdjustmentRequest>;

  if (payment_method !== 'cash' && payment_method !== 'online') {
    throw new BalanceValidationError('payment_method must be either "cash" or "online"');
  }

  if (typeof amount !== 'string') {
    throw new BalanceValidationError('amount must be a string amount in INR');
  }

  let absPaise: bigint;
  try {
    absPaise = parseINRToPaise(amount);
  } catch (err) {
    throw new BalanceValidationError(
      `Invalid adjustment amount: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (direction !== 'increase' && direction !== 'decrease') {
    throw new BalanceValidationError('direction must be either "increase" or "decrease"');
  }

  if (typeof reason !== 'string' || !reason.trim()) {
    throw new BalanceValidationError('reason is required for an auditable balance adjustment');
  }

  if (movement_date !== undefined && movement_date !== null) {
    if (typeof movement_date !== 'string' || !isValidDate(movement_date)) {
      throw new BalanceValidationError('movement_date must be a valid date in YYYY-MM-DD format');
    }
  }

  const adjustmentPaise = direction === 'increase' ? absPaise : -absPaise;

  return {
    id: typeof id === 'string' && id.trim() ? id.trim() : undefined,
    payment_method,
    adjustment_paise: adjustmentPaise,
    direction,
    reason: reason.trim(),
    movement_date: movement_date || undefined,
  };
}
