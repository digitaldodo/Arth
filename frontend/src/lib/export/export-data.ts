import type {
  CategoryDTO,
  CategoryListResponse,
  TransactionDTO,
  TransactionListResponse,
} from '@arth/contracts';
import { fetchCategories, fetchTransactions } from '../api-client';

const EXPORT_PAGE_SIZE = 100;

function isTransactionListResponse(value: unknown): value is TransactionListResponse {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<TransactionListResponse>;
  return (
    Array.isArray(result.items) &&
    Number.isInteger(result.page) &&
    Number.isInteger(result.page_size) &&
    Number.isInteger(result.total_count) &&
    (result.total_count as number) >= 0 &&
    typeof result.has_more === 'boolean'
  );
}

function isCategoryListResponse(value: unknown): value is CategoryListResponse {
  if (!value || typeof value !== 'object') return false;
  const categories = (value as Partial<CategoryListResponse>).categories;
  return Boolean(Array.isArray(categories) && categories.every((category) =>
    category && typeof category.id === 'string' && category.id.length > 0 &&
    typeof category.name === 'string' && (category.type === 'income' || category.type === 'expense')
  ));
}

/** Fetches a complete authenticated ledger snapshot using the canonical API contract. */
export async function fetchAllExportData(
  onPage?: (page: number) => void
): Promise<{ transactions: TransactionDTO[]; categories: CategoryDTO[] }> {
  const categoryResult: unknown = await fetchCategories({ include_archived: true });
  if (!isCategoryListResponse(categoryResult)) {
    throw new Error('The category service returned an unexpected response. Please retry the export.');
  }

  const categories = categoryResult.categories;
  const transactions: TransactionDTO[] = [];
  const seenIds = new Set<string>();
  let expectedTotal: number | null = null;
  let page = 1;

  for (;;) {
    onPage?.(page);
    const result: unknown = await fetchTransactions({ page, page_size: EXPORT_PAGE_SIZE });
    if (!isTransactionListResponse(result)) {
      throw new Error(`The transaction service returned an unexpected response on page ${page}. Please retry the export.`);
    }
    if (result.page !== page || result.page_size !== EXPORT_PAGE_SIZE) {
      throw new Error(`The transaction service returned inconsistent pagination on page ${page}. Please retry the export.`);
    }
    if (expectedTotal === null) expectedTotal = result.total_count;
    if (result.total_count !== expectedTotal) {
      throw new Error('Transactions changed while the export was being fetched. Please retry to create a complete backup.');
    }
    if (result.has_more !== (page * EXPORT_PAGE_SIZE < expectedTotal)) {
      throw new Error(`The transaction service returned inconsistent pagination on page ${page}. Please retry the export.`);
    }
    if (result.items.length > EXPORT_PAGE_SIZE || (result.has_more && result.items.length === 0)) {
      throw new Error(`The transaction service returned invalid pagination on page ${page}. Please retry the export.`);
    }

    for (const transaction of result.items) {
      if (
        !transaction ||
        typeof transaction.id !== 'string' || transaction.id.length === 0 ||
        typeof transaction.category_id !== 'string' ||
        typeof transaction.transaction_date !== 'string' ||
        (transaction.type !== 'income' && transaction.type !== 'expense') ||
        !Number.isSafeInteger(transaction.amount_paise) ||
        seenIds.has(transaction.id)
      ) {
        throw new Error(`The transaction service returned invalid or duplicate records on page ${page}. Please retry the export.`);
      }
      seenIds.add(transaction.id);
      transactions.push(transaction);
    }

    if (!result.has_more) break;
    page += 1;
    if (page > Math.ceil(expectedTotal / EXPORT_PAGE_SIZE) + 1) {
      throw new Error('The transaction service pagination did not make progress. Please retry the export.');
    }
  }

  if (transactions.length !== expectedTotal) {
    throw new Error(`Only ${transactions.length} of ${expectedTotal} transactions were fetched. The export was stopped to prevent a partial backup.`);
  }

  return { transactions, categories };
}
