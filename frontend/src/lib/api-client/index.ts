import type {
  AuthIdentityResponse,
  HealthCheckResponse,
  CreateTransactionRequest,
  CreateTransactionResponse,
  TransactionListQuery,
  TransactionListResponse,
  CategoryListQuery,
  CategoryListResponse,
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
 * Fetches the active categories for the authenticated user through the BFF proxy.
 */
export async function fetchCategories(
  query: CategoryListQuery = {}
): Promise<CategoryListResponse> {
  const url = query.type
    ? `/api/backend/categories?type=${encodeURIComponent(query.type)}`
    : '/api/backend/categories';

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
