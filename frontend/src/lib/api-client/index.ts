import type {
  AuthIdentityResponse,
  HealthCheckResponse,
  CreateTransactionRequest,
  CreateTransactionResponse,
  UpdateTransactionRequest,
  UpdateTransactionResponse,
  DeleteTransactionResponse,
  RestoreTransactionResponse,
  TransactionListQuery,
  TransactionListResponse,
  CategoryListQuery,
  CategoryListResponse,
  CreateCategoryRequest,
  CreateCategoryResponse,
  UpdateCategoryRequest,
  UpdateCategoryResponse,
  ArchiveCategoryResponse,
  ReorderCategoriesRequest,
  ReorderCategoriesResponse,
  PersonListQuery,
  PersonListResponse,
  PersonDetailResponse,
  CreatePersonRequest,
  CreatePersonResponse,
  UpdatePersonRequest,
  UpdatePersonResponse,
  ArchivePersonResponse,
  CreatePersonRecordRequest,
  CreatePersonRecordResponse,
  RecordSettlementRequest,
  RecordSettlementResponse,
  DashboardSummaryQuery,
  DashboardSummaryResponse,
} from '@arth/contracts';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Checks the operational status of the Arth backend service directly.
 */
export async function fetchHealthStatus(): Promise<HealthCheckResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Health check failed with HTTP status ${response.status}`);
  }

  return response.json();
}

/**
 * Fetches the currently authenticated user identity through the secure BFF proxy.
 */
export async function fetchCurrentUser(): Promise<AuthIdentityResponse | null> {
  try {
    const response = await fetch('/api/backend/auth/me', {
      cache: 'no-store',
    });

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch user identity: ${response.status}`);
    }

    return response.json();
  } catch {
    return null;
  }
}

/**
 * Submits a new transaction creation request to the BFF proxy.
 * Includes support for safe client retries using the same UUID v7.
 */
export async function createTransaction(
  req: CreateTransactionRequest
): Promise<CreateTransactionResponse> {
  const response = await fetch('/api/backend/transactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(req),
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data.message || `Failed to create transaction (${response.status})`;
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

/**
 * Lists the authenticated user's active transactions through the BFF proxy.
 */

/**
 * Updates an existing transaction through the BFF proxy.
 */
export async function updateTransaction(
  id: string,
  req: UpdateTransactionRequest
): Promise<UpdateTransactionResponse> {
  const response = await fetch(`/api/backend/transactions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(req),
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data.message || `Failed to update transaction (${response.status})`;
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

/**
 * Soft-deletes a transaction from the active ledger through the BFF proxy.
 */
export async function deleteTransaction(
  id: string
): Promise<DeleteTransactionResponse> {
  const response = await fetch(`/api/backend/transactions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data.message || `Failed to delete transaction (${response.status})`;
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

/**
 * Restores a soft-deleted transaction through the BFF proxy.
 */
export async function restoreTransaction(
  id: string
): Promise<RestoreTransactionResponse> {
  const response = await fetch(`/api/backend/transactions/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data.message || `Failed to restore transaction (${response.status})`;
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

export async function fetchTransactions(
  query: TransactionListQuery = {}
): Promise<TransactionListResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.page_size) params.set('page_size', String(query.page_size));
  if (query.type) params.set('type', query.type);
  if (query.category_id) params.set('category_id', query.category_id);
  if (query.start_date) params.set('start_date', query.start_date);
  if (query.end_date) params.set('end_date', query.end_date);

  const qs = params.toString();
  const url = qs ? `/api/backend/transactions?${qs}` : '/api/backend/transactions';

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Failed to fetch transactions (${response.status})`);
  }

  return data;
}

/**
 * Fetches categories for the authenticated user through the BFF proxy.
 */
export async function fetchCategories(
  query: CategoryListQuery = {}
): Promise<CategoryListResponse> {
  const params = new URLSearchParams();
  if (query.type) params.set('type', query.type);
  if (query.include_archived !== undefined) {
    params.set('include_archived', String(query.include_archived));
  }

  const qs = params.toString();
  const url = qs ? `/api/backend/categories?${qs}` : '/api/backend/categories';

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Failed to fetch categories (${response.status})`);
  }

  return data;
}

/**
 * Creates a new category for the authenticated user.
 */
export async function createCategory(
  req: CreateCategoryRequest
): Promise<CreateCategoryResponse> {
  const response = await fetch('/api/backend/categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(req),
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data.message || `Failed to create category (${response.status})`;
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

/**
 * Updates an existing category (e.g. rename, color, icon, sort_order).
 */
export async function updateCategory(
  id: string,
  req: UpdateCategoryRequest
): Promise<UpdateCategoryResponse> {
  const response = await fetch(`/api/backend/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(req),
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data.message || `Failed to update category (${response.status})`;
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

/**
 * Archives or restores a category (non-destructive).
 */
export async function archiveCategory(
  id: string,
  archived: boolean
): Promise<ArchiveCategoryResponse> {
  const response = await fetch(`/api/backend/categories/${encodeURIComponent(id)}/archive`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ archived }),
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data.message || `Failed to archive/restore category (${response.status})`;
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

/**
 * Reorders categories of a specific type atomically.
 */
export async function reorderCategories(
  req: ReorderCategoriesRequest
): Promise<ReorderCategoriesResponse> {
  const response = await fetch('/api/backend/categories', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(req),
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data.message || `Failed to reorder categories (${response.status})`;
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

/**
 * Lists people for the authenticated user with optional search, direction, and archival filters.
 */
export async function fetchPeople(
  query: PersonListQuery = {}
): Promise<PersonListResponse> {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.include_archived !== undefined) {
    params.set('include_archived', String(query.include_archived));
  }
  if (query.direction) params.set('direction', query.direction);

  const qs = params.toString();
  const url = qs ? `/api/backend/people?${qs}` : '/api/backend/people';

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `Failed to fetch people (${response.status})`);
  }
  return data;
}

/**
 * Retrieves details, named money records, and settlements for a single person.
 */
export async function fetchPersonDetail(
  id: string
): Promise<PersonDetailResponse> {
  const response = await fetch(`/api/backend/people/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `Failed to fetch person details (${response.status})`);
  }
  return data;
}

/**
 * Creates a new person with initial direction.
 */
export async function createPerson(
  req: CreatePersonRequest
): Promise<CreatePersonResponse> {
  const response = await fetch('/api/backend/people', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(req),
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || `Failed to create person (${response.status})`) as Error & {
      statusCode?: number;
    };
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

/**
 * Renames a person or updates direction (only allowed when fully settled).
 */
export async function updatePerson(
  id: string,
  req: UpdatePersonRequest
): Promise<UpdatePersonResponse> {
  const response = await fetch(`/api/backend/people/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(req),
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || `Failed to update person (${response.status})`) as Error & {
      statusCode?: number;
    };
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

/**
 * Archives or unarchives a person.
 */
export async function archivePerson(
  id: string,
  archived: boolean
): Promise<ArchivePersonResponse> {
  const response = await fetch(`/api/backend/people/${encodeURIComponent(id)}/archive`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ archived }),
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || `Failed to archive person (${response.status})`) as Error & {
      statusCode?: number;
    };
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

/**
 * Creates a named money record for a person.
 */
export async function createPersonRecord(
  personId: string,
  req: CreatePersonRecordRequest
): Promise<CreatePersonRecordResponse> {
  const response = await fetch(
    `/api/backend/people/${encodeURIComponent(personId)}/records`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(req),
      cache: 'no-store',
    }
  );

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || `Failed to create money record (${response.status})`) as Error & {
      statusCode?: number;
    };
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

/**
 * Records a payment or collection against a specific named money record.
 */
export async function recordSettlement(
  recordId: string,
  req: RecordSettlementRequest
): Promise<RecordSettlementResponse> {
  const response = await fetch(
    `/api/backend/people/records/${encodeURIComponent(recordId)}/settlements`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(req),
      cache: 'no-store',
    }
  );

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || `Failed to record settlement (${response.status})`) as Error & {
      statusCode?: number;
    };
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

/**
 * Fetches the aggregated dashboard financial summary for the specified date range.
 */
export async function fetchDashboardSummary(
  query: DashboardSummaryQuery
): Promise<DashboardSummaryResponse> {
  const params = new URLSearchParams({
    start_date: query.start_date,
    end_date: query.end_date,
  });

  const response = await fetch(`/api/backend/dashboard?${params.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(
      data.message || `Failed to fetch dashboard summary (${response.status})`
    ) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }
  return data;
}
