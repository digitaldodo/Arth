import type { CategoryDTO, TransactionDTO } from '@arth/contracts';

/**
 * Computes a map of category IDs to the count of matching active transactions.
 */
export function computeCategoryCounts(
  transactions: TransactionDTO[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.category_id) {
      counts.set(tx.category_id, (counts.get(tx.category_id) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Filters the provided category taxonomy to only those categories that have at least
 * one matching transaction in the current dataset.
 * Preserves the original sort order and metadata of the categories list.
 */
export function filterEligibleCategories(
  categories: CategoryDTO[],
  transactions: TransactionDTO[]
): CategoryDTO[] {
  const counts = computeCategoryCounts(transactions);
  return categories.filter((c) => (counts.get(c.id) || 0) > 0);
}

/**
 * Determines whether a selected category ID remains valid within the set of eligible categories.
 * If the category is no longer present in the eligible set, gracefully falls back to 'all'.
 */
export function resolveEligibleCategory(
  selectedCategory: string,
  eligibleCategories: CategoryDTO[]
): string {
  if (selectedCategory === 'all') {
    return 'all';
  }
  const isStillEligible = eligibleCategories.some(
    (c) => c.id === selectedCategory
  );
  return isStillEligible ? selectedCategory : 'all';
}
