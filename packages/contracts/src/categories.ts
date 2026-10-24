export type TransactionType = 'income' | 'expense';

export interface CategoryDTO {
  id: string;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_default: boolean;
}

export interface CategoryListQuery {
  type?: TransactionType;
}

export interface CategoryListResponse {
  categories: CategoryDTO[];
}
