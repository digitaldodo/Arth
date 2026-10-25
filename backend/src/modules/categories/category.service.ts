import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v7 as uuidv7 } from 'uuid';
import type {
  CategoryDTO,
  CategoryListResponse,
  ReorderCategoriesResponse,
  TransactionType,
} from '@arth/contracts';
import type { AppConfig } from '../../config/index.js';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  type ValidatedCreateCategoryInput,
  type ValidatedUpdateCategoryInput,
  type ValidatedArchiveCategoryInput,
  type ValidatedReorderCategoriesInput,
  type ValidatedCategoryListQuery,
} from './category.validation.js';

export interface StoredCategoryRecord {
  id: string;
  user_id: string;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_default: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ICategoryService {
  listCategories(
    userId: string,
    query: ValidatedCategoryListQuery,
    token?: string
  ): Promise<CategoryListResponse>;

  createCategory(
    userId: string,
    input: ValidatedCreateCategoryInput,
    token?: string
  ): Promise<CategoryDTO>;

  updateCategory(
    userId: string,
    categoryId: string,
    input: ValidatedUpdateCategoryInput,
    token?: string
  ): Promise<CategoryDTO>;

  archiveCategory(
    userId: string,
    categoryId: string,
    input: ValidatedArchiveCategoryInput,
    token?: string
  ): Promise<CategoryDTO>;

  reorderCategories(
    userId: string,
    input: ValidatedReorderCategoriesInput,
    token?: string
  ): Promise<ReorderCategoriesResponse>;
}

function mapToCategoryDTO(rec: StoredCategoryRecord): CategoryDTO {
  return {
    id: rec.id,
    name: rec.name,
    type: rec.type,
    icon: rec.icon,
    color: rec.color,
    sort_order: rec.sort_order,
    is_default: rec.is_default,
    archived_at: rec.archived_at,
    is_archived: rec.archived_at !== null,
  };
}

/**
 * Production implementation using user-scoped Supabase client carrying the caller's JWT.
 */
export class SupabaseCategoryService implements ICategoryService {
  constructor(private readonly config: AppConfig) {}

  private getScopedClient(token?: string): SupabaseClient {
    if (!this.config.supabaseUrl || !this.config.supabaseAnonKey) {
      throw new Error('Supabase client is not configured on the backend');
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return createClient(this.config.supabaseUrl, this.config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers },
    });
  }

  async listCategories(
    userId: string,
    query: ValidatedCategoryListQuery,
    token?: string
  ): Promise<CategoryListResponse> {
    const client = this.getScopedClient(token);

    let qb = client
      .from('categories')
      .select('id, user_id, name, type, icon, color, sort_order, is_default, archived_at, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .order('id', { ascending: true });

    if (!query.include_archived) {
      qb = qb.is('archived_at', null);
    }

    if (query.type) {
      qb = qb.eq('type', query.type);
    }

    const { data, error } = await qb;

    if (error) {
      throw new Error(`Failed to list categories: ${error.message}`);
    }

    const categories = (data || []).map((c) =>
      mapToCategoryDTO(c as unknown as StoredCategoryRecord)
    );

    return { categories };
  }

  async createCategory(
    userId: string,
    input: ValidatedCreateCategoryInput,
    token?: string
  ): Promise<CategoryDTO> {
    const client = this.getScopedClient(token);

    // 1. Assign sort order if omitted
    let sortOrder = input.sort_order;
    if (sortOrder === undefined) {
      const { data: maxOrderData } = await client
        .from('categories')
        .select('sort_order')
        .eq('type', input.type)
        .is('archived_at', null)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      sortOrder = maxOrderData ? maxOrderData.sort_order + 1 : 1;
    }

    // 2. Insert category atomically — relying on idx_categories_user_type_name_active for uniqueness
    const { data: inserted, error: insertErr } = await client
      .from('categories')
      .insert({
        user_id: userId,
        name: input.name,
        type: input.type,
        icon: input.icon,
        color: input.color,
        sort_order: sortOrder,
        is_default: false,
      })
      .select('id, user_id, name, type, icon, color, sort_order, is_default, archived_at, created_at, updated_at')
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') {
        throw new ConflictError(`An active ${input.type} category named '${input.name}' already exists`);
      }
      throw new Error(`Failed to create category: ${insertErr.message}`);
    }

    return mapToCategoryDTO(inserted as unknown as StoredCategoryRecord);
  }

  async updateCategory(
    userId: string,
    categoryId: string,
    input: ValidatedUpdateCategoryInput,
    token?: string
  ): Promise<CategoryDTO> {
    const client = this.getScopedClient(token);

    // 1. Fetch existing category
    const { data: category, error: catErr } = await client
      .from('categories')
      .select('id, user_id, name, type, icon, color, sort_order, is_default, archived_at, created_at, updated_at')
      .eq('id', categoryId)
      .maybeSingle();

    if (catErr || !category) {
      throw new NotFoundError('Category not found');
    }

    // 2. Update category — relying on authoritative idx_categories_user_type_name_active for collision detection
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.name !== undefined) updates.name = input.name;
    if (input.icon !== undefined) updates.icon = input.icon;
    if (input.color !== undefined) updates.color = input.color;
    if (input.sort_order !== undefined) updates.sort_order = input.sort_order;

    const { data: updated, error: updateErr } = await client
      .from('categories')
      .update(updates)
      .eq('id', categoryId)
      .select('id, user_id, name, type, icon, color, sort_order, is_default, archived_at, created_at, updated_at')
      .single();

    if (updateErr) {
      if (updateErr.code === '23505') {
        throw new ConflictError(`An active category named '${input.name}' already exists`);
      }
      throw new Error(`Failed to update category: ${updateErr.message}`);
    }

    return mapToCategoryDTO(updated as unknown as StoredCategoryRecord);
  }

  async archiveCategory(
    userId: string,
    categoryId: string,
    input: ValidatedArchiveCategoryInput,
    token?: string
  ): Promise<CategoryDTO> {
    const client = this.getScopedClient(token);

    // 1. Fetch category
    const { data: category, error: catErr } = await client
      .from('categories')
      .select('id, user_id, name, type, icon, color, sort_order, is_default, archived_at, created_at, updated_at')
      .eq('id', categoryId)
      .maybeSingle();

    if (catErr || !category) {
      throw new NotFoundError('Category not found');
    }

    // 2. Idempotent check
    const isCurrentlyArchived = category.archived_at !== null;
    if (input.archived === isCurrentlyArchived) {
      return mapToCategoryDTO(category as unknown as StoredCategoryRecord);
    }

    // 3. If restoring, verify active uniqueness
    if (!input.archived) {
      const { data: duplicate } = await client
        .from('categories')
        .select('id')
        .eq('type', category.type)
        .ilike('name', category.name)
        .neq('id', categoryId)
        .is('archived_at', null)
        .maybeSingle();

      if (duplicate) {
        throw new ConflictError(
          `Cannot restore category because an active category named '${category.name}' already exists`
        );
      }
    }

    const archivedAtValue = input.archived ? new Date().toISOString() : null;

    const { data: updated, error: updateErr } = await client
      .from('categories')
      .update({
        archived_at: archivedAtValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', categoryId)
      .select('id, user_id, name, type, icon, color, sort_order, is_default, archived_at, created_at, updated_at')
      .single();

    if (updateErr) {
      throw new Error(`Failed to archive/restore category: ${updateErr.message}`);
    }

    return mapToCategoryDTO(updated as unknown as StoredCategoryRecord);
  }

  async reorderCategories(
    userId: string,
    input: ValidatedReorderCategoriesInput,
    token?: string
  ): Promise<ReorderCategoriesResponse> {
    const client = this.getScopedClient(token);

    // Execute atomic PostgreSQL function fn_reorder_categories
    const { data, error } = await client.rpc('fn_reorder_categories', {
      p_type: input.type,
      p_category_ids: input.category_ids,
    });

    if (error) {
      if (
        error.code === '22023' ||
        error.code === '22000' ||
        error.code === 'P0001' ||
        error.message?.includes('Category IDs') ||
        error.message?.includes('category IDs') ||
        error.message?.includes('invalid, archived, or belong')
      ) {
        throw new ValidationError(error.message);
      }
      throw new Error(`Failed to reorder categories: [${error.code || 'UNKNOWN'}] ${error.message}`);
    }

    const categories = (data || []).map((c: StoredCategoryRecord) =>
      mapToCategoryDTO(c)
    );

    return { categories };
  }
}

/**
 * In-memory category service for deterministic, fast automated testing.
 */
export class InMemoryCategoryService implements ICategoryService {
  public categories: StoredCategoryRecord[] = [];

  constructor() {
    this.seedDefaults('test-user-id');
  }

  public seedDefaults(userId: string): void {
    const defaults: Array<Pick<StoredCategoryRecord, 'name' | 'type' | 'sort_order'>> = [
      { name: 'Food & Dining', type: 'expense', sort_order: 1 },
      { name: 'Transport', type: 'expense', sort_order: 2 },
      { name: 'Housing', type: 'expense', sort_order: 3 },
      { name: 'Utilities', type: 'expense', sort_order: 4 },
      { name: 'Healthcare', type: 'expense', sort_order: 5 },
      { name: 'Entertainment', type: 'expense', sort_order: 6 },
      { name: 'Shopping', type: 'expense', sort_order: 7 },
      { name: 'Education', type: 'expense', sort_order: 8 },
      { name: 'Personal Care', type: 'expense', sort_order: 9 },
      { name: 'Travel', type: 'expense', sort_order: 10 },
      { name: 'Other Expense', type: 'expense', sort_order: 11 },
      { name: 'Salary', type: 'income', sort_order: 1 },
      { name: 'Freelance', type: 'income', sort_order: 2 },
      { name: 'Investments', type: 'income', sort_order: 3 },
      { name: 'Other Income', type: 'income', sort_order: 4 },
    ];

    const userPrefix = userId.replace(/-/g, '').slice(0, 8);
    const now = new Date().toISOString();

    defaults.forEach((def, idx) => {
      const id = `${userPrefix}-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`;
      if (!this.categories.some((c) => c.user_id === userId && c.name === def.name)) {
        this.categories.push({
          id,
          user_id: userId,
          name: def.name,
          type: def.type,
          icon: null,
          color: null,
          sort_order: def.sort_order,
          is_default: true,
          archived_at: null,
          created_at: now,
          updated_at: now,
        });
      }
    });
  }

  async listCategories(
    userId: string,
    query: ValidatedCategoryListQuery
  ): Promise<CategoryListResponse> {
    let list = this.categories.filter((c) => c.user_id === userId);

    if (!query.include_archived) {
      list = list.filter((c) => c.archived_at === null);
    }

    if (query.type) {
      list = list.filter((c) => c.type === query.type);
    }

    list.sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      if (a.name !== b.name) {
        return a.name.localeCompare(b.name);
      }
      return a.id.localeCompare(b.id);
    });

    return { categories: list.map(mapToCategoryDTO) };
  }

  async createCategory(
    userId: string,
    input: ValidatedCreateCategoryInput
  ): Promise<CategoryDTO> {
    const existing = this.categories.find(
      (c) =>
        c.user_id === userId &&
        c.type === input.type &&
        c.name.toLowerCase() === input.name.toLowerCase() &&
        c.archived_at === null
    );

    if (existing) {
      throw new ConflictError(
        `An active ${input.type} category named '${input.name}' already exists`
      );
    }

    let sortOrder = input.sort_order;
    if (sortOrder === undefined) {
      const activeForType = this.categories.filter(
        (c) => c.user_id === userId && c.type === input.type && c.archived_at === null
      );
      const maxSort = activeForType.reduce((max, c) => Math.max(max, c.sort_order), 0);
      sortOrder = maxSort + 1;
    }

    const now = new Date().toISOString();
    const newRecord: StoredCategoryRecord = {
      id: uuidv7(),
      user_id: userId,
      name: input.name,
      type: input.type,
      icon: input.icon,
      color: input.color,
      sort_order: sortOrder,
      is_default: false,
      archived_at: null,
      created_at: now,
      updated_at: now,
    };

    this.categories.push(newRecord);
    return mapToCategoryDTO(newRecord);
  }

  async updateCategory(
    userId: string,
    categoryId: string,
    input: ValidatedUpdateCategoryInput
  ): Promise<CategoryDTO> {
    const category = this.categories.find(
      (c) => c.id === categoryId && c.user_id === userId
    );

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    if (input.name && input.name.toLowerCase() !== category.name.toLowerCase()) {
      const duplicate = this.categories.find(
        (c) =>
          c.user_id === userId &&
          c.type === category.type &&
          c.id !== categoryId &&
          c.name.toLowerCase() === input.name!.toLowerCase() &&
          c.archived_at === null
      );

      if (duplicate) {
        throw new ConflictError(
          `An active ${category.type} category named '${input.name}' already exists`
        );
      }
    }

    if (input.name !== undefined) category.name = input.name;
    if (input.icon !== undefined) category.icon = input.icon;
    if (input.color !== undefined) category.color = input.color;
    if (input.sort_order !== undefined) category.sort_order = input.sort_order;
    category.updated_at = new Date().toISOString();

    return mapToCategoryDTO(category);
  }

  async archiveCategory(
    userId: string,
    categoryId: string,
    input: ValidatedArchiveCategoryInput
  ): Promise<CategoryDTO> {
    const category = this.categories.find(
      (c) => c.id === categoryId && c.user_id === userId
    );

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    const isCurrentlyArchived = category.archived_at !== null;
    if (input.archived === isCurrentlyArchived) {
      return mapToCategoryDTO(category);
    }

    if (!input.archived) {
      const duplicate = this.categories.find(
        (c) =>
          c.user_id === userId &&
          c.type === category.type &&
          c.id !== categoryId &&
          c.name.toLowerCase() === category.name.toLowerCase() &&
          c.archived_at === null
      );

      if (duplicate) {
        throw new ConflictError(
          `Cannot restore category because an active category named '${category.name}' already exists`
        );
      }
    }

    category.archived_at = input.archived ? new Date().toISOString() : null;
    category.updated_at = new Date().toISOString();

    return mapToCategoryDTO(category);
  }

  async reorderCategories(
    userId: string,
    input: ValidatedReorderCategoriesInput
  ): Promise<ReorderCategoriesResponse> {
    const activeCategories = this.categories.filter(
      (c) => c.user_id === userId && c.type === input.type && c.archived_at === null
    );

    const uniqueIds = new Set(input.category_ids);
    if (uniqueIds.size !== input.category_ids.length) {
      throw new ValidationError('Category IDs list must not contain duplicates');
    }

    if (activeCategories.length !== input.category_ids.length) {
      throw new ValidationError(
        'Category IDs list must contain all active categories of the specified type'
      );
    }

    // Verify all IDs match active categories of caller and type
    const activeMap = new Map(activeCategories.map((c) => [c.id, c]));
    for (const id of input.category_ids) {
      if (!activeMap.has(id)) {
        throw new ValidationError(
          'One or more category IDs are invalid, archived, or belong to another user/type'
        );
      }
    }

    // Atomic update
    input.category_ids.forEach((id, index) => {
      const cat = activeMap.get(id)!;
      cat.sort_order = index + 1;
      cat.updated_at = new Date().toISOString();
    });

    const updated = activeCategories.sort((a, b) => a.sort_order - b.sort_order);
    return { categories: updated.map(mapToCategoryDTO) };
  }
}
