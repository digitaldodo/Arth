export type TransactionType = 'income' | 'expense';

export interface CategoryDTO {
  id: string;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_default: boolean;
  archived_at: string | null;
  is_archived?: boolean;
}

export interface CategoryListQuery {
  type?: TransactionType;
  include_archived?: boolean;
}

export interface CategoryListResponse {
  categories: CategoryDTO[];
}

export interface CreateCategoryRequest {
  name: string;
  type: TransactionType;
  icon?: string | null;
  color?: string | null;
  sort_order?: number;
}

export interface CreateCategoryResponse {
  category: CategoryDTO;
}

export interface UpdateCategoryRequest {
  name?: string;
  icon?: string | null;
  color?: string | null;
  sort_order?: number;
}

export interface UpdateCategoryResponse {
  category: CategoryDTO;
}

export interface ArchiveCategoryRequest {
  archived: boolean;
}

export interface ArchiveCategoryResponse {
  category: CategoryDTO;
}

export interface ReorderCategoriesRequest {
  type: TransactionType;
  category_ids: string[];
}

export interface ReorderCategoriesResponse {
  categories: CategoryDTO[];
}
