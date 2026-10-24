import {
  parseINRToPaise,
  type PersonDirection,
  type CreatePersonRequest,
  type UpdatePersonRequest,
  type ArchivePersonRequest,
  type CreatePersonRecordRequest,
  type RecordSettlementRequest,
} from '@arth/contracts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

export interface ValidatedCreatePersonInput {
  id?: string;
  name: string;
  direction: PersonDirection;
}

export interface ValidatedUpdatePersonInput {
  name?: string;
  direction?: PersonDirection;
}

export interface ValidatedArchivePersonInput {
  archived: boolean;
}

export interface ValidatedCreatePersonRecordInput {
  id?: string;
  name: string;
  amount_paise: bigint;
  record_date: string;
  notes: string | null;
}

export interface ValidatedRecordSettlementInput {
  id?: string;
  amount_paise: bigint;
  settlement_date: string;
  notes: string | null;
}

export interface ValidatedPersonListQuery {
  search?: string;
  include_archived: boolean;
  direction?: PersonDirection;
}

/**
 * Validates calendar date string YYYY-MM-DD.
 */
function isValidCalendarDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Gets today's date in Asia/Kolkata timezone (IST).
 */
export function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Validates request to create a person.
 */
export function validateCreatePersonRequest(
  payload: Record<string, unknown>
): ValidatedCreatePersonInput {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const { id, name, direction } = payload as Partial<CreatePersonRequest>;

  if (id !== undefined && id !== null) {
    if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
      throw new ValidationError(`Field 'id' must be a valid UUID. Received: '${id}'`);
    }
  }

  if (typeof name !== 'string') {
    throw new ValidationError("Field 'name' is required and must be a string");
  }
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new ValidationError("Field 'name' cannot be empty or only whitespace");
  }
  if (trimmedName.length > 100) {
    throw new ValidationError("Field 'name' cannot exceed 100 characters");
  }

  if (direction !== 'i_owe_them' && direction !== 'they_owe_me') {
    throw new ValidationError(
      "Field 'direction' must be either 'i_owe_them' or 'they_owe_me'"
    );
  }

  return {
    id: id || undefined,
    name: trimmedName,
    direction,
  };
}

/**
 * Validates request to update a person (e.g. rename or direction change).
 */
export function validateUpdatePersonRequest(
  payload: Record<string, unknown>
): ValidatedUpdatePersonInput {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const { name, direction } = payload as Partial<UpdatePersonRequest>;

  if (name === undefined && direction === undefined) {
    throw new ValidationError(
      'At least one field (name or direction) must be provided for update'
    );
  }

  let validatedName: string | undefined;
  if (name !== undefined) {
    if (typeof name !== 'string') {
      throw new ValidationError("Field 'name' must be a string");
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("Field 'name' cannot be empty or only whitespace");
    }
    if (trimmed.length > 100) {
      throw new ValidationError("Field 'name' cannot exceed 100 characters");
    }
    validatedName = trimmed;
  }

  let validatedDirection: PersonDirection | undefined;
  if (direction !== undefined) {
    if (direction !== 'i_owe_them' && direction !== 'they_owe_me') {
      throw new ValidationError(
        "Field 'direction' must be either 'i_owe_them' or 'they_owe_me'"
      );
    }
    validatedDirection = direction;
  }

  return {
    name: validatedName,
    direction: validatedDirection,
  };
}

/**
 * Validates request to archive or unarchive a person.
 */
export function validateArchivePersonRequest(
  payload: Record<string, unknown>
): ValidatedArchivePersonInput {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const { archived } = payload as Partial<ArchivePersonRequest>;
  if (typeof archived !== 'boolean') {
    throw new ValidationError("Field 'archived' is required and must be a boolean");
  }

  return { archived };
}

/**
 * Validates request to create a named money record for a person.
 */
export function validateCreatePersonRecordRequest(
  payload: Record<string, unknown>
): ValidatedCreatePersonRecordInput {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const { id, name, amount, record_date, notes } =
    payload as Partial<CreatePersonRecordRequest>;

  if (id !== undefined && id !== null) {
    if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
      throw new ValidationError(`Field 'id' must be a valid UUID. Received: '${id}'`);
    }
  }

  if (typeof name !== 'string') {
    throw new ValidationError("Field 'name' is required and must be a string");
  }
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new ValidationError("Field 'name' cannot be empty or only whitespace");
  }
  if (trimmedName.length > 100) {
    throw new ValidationError("Field 'name' cannot exceed 100 characters");
  }

  if (!amount || typeof amount !== 'string') {
    throw new ValidationError(
      "Field 'amount' is required and must be a string formatted INR decimal (e.g. '250.00')"
    );
  }

  let amountPaise: bigint;
  try {
    amountPaise = parseINRToPaise(amount);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid amount format';
    throw new ValidationError(msg);
  }

  if (amountPaise <= BigInt(0)) {
    throw new ValidationError('Amount must be strictly greater than 0 paise');
  }

  let dateToUse = record_date;
  if (!dateToUse) {
    dateToUse = getTodayIST();
  } else {
    if (typeof dateToUse !== 'string' || !isValidCalendarDate(dateToUse)) {
      throw new ValidationError(
        `Field 'record_date' must be a valid calendar date in YYYY-MM-DD format. Received: '${dateToUse}'`
      );
    }
  }

  let cleanNotes: string | null = null;
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string') {
      throw new ValidationError("Field 'notes' must be a string");
    }
    const trimmed = notes.trim();
    if (trimmed.length > 500) {
      throw new ValidationError("Field 'notes' cannot exceed 500 characters");
    }
    cleanNotes = trimmed.length > 0 ? trimmed : null;
  }

  return {
    id: id || undefined,
    name: trimmedName,
    amount_paise: amountPaise,
    record_date: dateToUse,
    notes: cleanNotes,
  };
}

/**
 * Validates request to record a settlement.
 */
export function validateRecordSettlementRequest(
  payload: Record<string, unknown>
): ValidatedRecordSettlementInput {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const { id, amount, settlement_date, notes } =
    payload as Partial<RecordSettlementRequest>;

  if (id !== undefined && id !== null) {
    if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
      throw new ValidationError(`Field 'id' must be a valid UUID. Received: '${id}'`);
    }
  }

  if (!amount || typeof amount !== 'string') {
    throw new ValidationError(
      "Field 'amount' is required and must be a string formatted INR decimal (e.g. '100.00')"
    );
  }

  let amountPaise: bigint;
  try {
    amountPaise = parseINRToPaise(amount);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid amount format';
    throw new ValidationError(msg);
  }

  if (amountPaise <= BigInt(0)) {
    throw new ValidationError('Settlement amount must be strictly greater than 0 paise');
  }

  let dateToUse = settlement_date;
  if (!dateToUse) {
    dateToUse = getTodayIST();
  } else {
    if (typeof dateToUse !== 'string' || !isValidCalendarDate(dateToUse)) {
      throw new ValidationError(
        `Field 'settlement_date' must be a valid calendar date in YYYY-MM-DD format. Received: '${dateToUse}'`
      );
    }
  }

  let cleanNotes: string | null = null;
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string') {
      throw new ValidationError("Field 'notes' must be a string");
    }
    const trimmed = notes.trim();
    if (trimmed.length > 500) {
      throw new ValidationError("Field 'notes' cannot exceed 500 characters");
    }
    cleanNotes = trimmed.length > 0 ? trimmed : null;
  }

  return {
    id: id || undefined,
    amount_paise: amountPaise,
    settlement_date: dateToUse,
    notes: cleanNotes,
  };
}

/**
 * Validates list query parameters for people.
 */
export function validatePersonListQuery(
  params: Record<string, unknown>
): ValidatedPersonListQuery {
  const search = typeof params.search === 'string' && params.search.trim().length > 0
    ? params.search.trim()
    : undefined;

  const rawInc = params.include_archived ?? params.includeArchived;
  const include_archived = rawInc === true || rawInc === 'true' || rawInc === '1';

  let direction: PersonDirection | undefined;
  if (params.direction === 'i_owe_them' || params.direction === 'they_owe_me') {
    direction = params.direction;
  }

  return {
    search,
    include_archived,
    direction,
  };
}
