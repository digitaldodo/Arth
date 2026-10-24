import type {
  TransactionType,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ArchiveCategoryRequest,
  ReorderCategoriesRequest,
} from '@arth/contracts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export interface ValidatedCreateCategoryInput {
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  sort_order?: number;
}

export interface ValidatedUpdateCategoryInput {
  name?: string;
  icon?: string | null;
  color?: string | null;
  sort_order?: number;
}

export interface ValidatedArchiveCategoryInput {
  archived: boolean;
}

export interface ValidatedReorderCategoriesInput {
  type: TransactionType;
  category_ids: string[];
}

export interface ValidatedCategoryListQuery {
  type?: TransactionType;
  include_archived: boolean;
}

export function validateCreateCategoryRequest(body: unknown): ValidatedCreateCategoryInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const payload = body as Record<string, unknown>;

  // 1. Name validation
  if (typeof payload.name !== 'string') {
    throw new ValidationError('Category name is required and must be a string');
  }
  const name = payload.name.trim();
  if (name.length === 0) {
    throw new ValidationError('Category name cannot be empty');
  }
  if (name.length > 50) {
    throw new ValidationError('Category name cannot exceed 50 characters');
  }

  // 2. Type validation
  if (payload.type !== 'income' && payload.type !== 'expense') {
    throw new ValidationError("Category type must be 'income' or 'expense'");
  }
  const type: TransactionType = payload.type;

  // 3. Optional icon validation
  let icon: string | null = null;
  if (payload.icon !== undefined && payload.icon !== null) {
    if (typeof payload.icon !== 'string') {
      throw new ValidationError('Icon must be a string');
    }
    const trimmedIcon = payload.icon.trim();
    if (trimmedIcon.length > 10) {
      throw new ValidationError('Icon identifier cannot exceed 10 characters');
    }
    icon = trimmedIcon.length > 0 ? trimmedIcon : null;
  }

  // 4. Optional color validation
  let color: string | null = null;
  if (payload.color !== undefined && payload.color !== null) {
    if (typeof payload.color !== 'string') {
      throw new ValidationError('Color must be a string');
    }
    const trimmedColor = payload.color.trim();
    if (trimmedColor.length > 0) {
      if (!/^#[0-9a-fA-F]{6}$/.test(trimmedColor)) {
        throw new ValidationError('Color must be a valid 6-character hex code (e.g. #2563EB)');
      }
      color = trimmedColor;
    }
  }

  // 5. Optional sort order
  let sort_order: number | undefined = undefined;
  if (payload.sort_order !== undefined && payload.sort_order !== null) {
    const parsed = Number(payload.sort_order);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new ValidationError('Sort order must be a non-negative integer');
    }
    sort_order = parsed;
  }

  return { name, type, icon, color, sort_order };
}

export function validateUpdateCategoryRequest(body: unknown): ValidatedUpdateCategoryInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const payload = body as Record<string, unknown>;

  // Prohibit protected fields
  if (payload.type !== undefined) {
    throw new ValidationError(
      'Category type cannot be modified once created to preserve historical transaction integrity'
    );
  }
  if (payload.id !== undefined || payload.user_id !== undefined) {
    throw new ValidationError('Category identifier and ownership cannot be modified');
  }

  const result: ValidatedUpdateCategoryInput = {};
  let hasUpdates = false;

  if (payload.name !== undefined) {
    if (typeof payload.name !== 'string') {
      throw new ValidationError('Category name must be a string');
    }
    const name = payload.name.trim();
    if (name.length === 0) {
      throw new ValidationError('Category name cannot be empty');
    }
    if (name.length > 50) {
      throw new ValidationError('Category name cannot exceed 50 characters');
    }
    result.name = name;
    hasUpdates = true;
  }

  if (payload.icon !== undefined) {
    if (payload.icon === null) {
      result.icon = null;
    } else if (typeof payload.icon === 'string') {
      const trimmed = payload.icon.trim();
      if (trimmed.length > 10) {
        throw new ValidationError('Icon identifier cannot exceed 10 characters');
      }
      result.icon = trimmed.length > 0 ? trimmed : null;
    } else {
      throw new ValidationError('Icon must be a string or null');
    }
    hasUpdates = true;
  }

  if (payload.color !== undefined) {
    if (payload.color === null) {
      result.color = null;
    } else if (typeof payload.color === 'string') {
      const trimmed = payload.color.trim();
      if (trimmed.length > 0 && !/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
        throw new ValidationError('Color must be a valid 6-character hex code (e.g. #2563EB)');
      }
      result.color = trimmed.length > 0 ? trimmed : null;
    } else {
      throw new ValidationError('Color must be a string or null');
    }
    hasUpdates = true;
  }

  if (payload.sort_order !== undefined) {
    const parsed = Number(payload.sort_order);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new ValidationError('Sort order must be a non-negative integer');
    }
    result.sort_order = parsed;
    hasUpdates = true;
  }

  if (!hasUpdates) {
    throw new ValidationError('No valid editable fields provided in update payload');
  }

  return result;
}

export function validateArchiveCategoryRequest(body: unknown): ValidatedArchiveCategoryInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const payload = body as Record<string, unknown>;
  if (typeof payload.archived !== 'boolean') {
    throw new ValidationError("Property 'archived' is required and must be a boolean");
  }

  return { archived: payload.archived };
}

export function validateReorderCategoriesRequest(body: unknown): ValidatedReorderCategoriesInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const payload = body as Record<string, unknown>;

  if (payload.type !== 'income' && payload.type !== 'expense') {
    throw new ValidationError("Category type must be 'income' or 'expense'");
  }
  const type: TransactionType = payload.type;

  if (!Array.isArray(payload.category_ids)) {
    throw new ValidationError("Property 'category_ids' must be an array of category UUIDs");
  }

  if (payload.category_ids.length === 0) {
    throw new ValidationError('Category IDs list cannot be empty');
  }

  const seen = new Set<string>();
  const normalizedIds: string[] = [];

  for (const id of payload.category_ids) {
    if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
      throw new ValidationError(`Invalid category UUID in reorder list: '${id}'`);
    }
    const lower = id.toLowerCase();
    if (seen.has(lower)) {
      throw new ValidationError(`Duplicate category ID found in reorder list: '${id}'`);
    }
    seen.add(lower);
    normalizedIds.push(lower);
  }

  return { type, category_ids: normalizedIds };
}

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

  const rawArchived = query.includeArchived ?? query.include_archived;
  const include_archived =
    rawArchived === true || rawArchived === 'true' || rawArchived === '1';

  return { type, include_archived };
}
