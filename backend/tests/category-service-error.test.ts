import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SupabaseCategoryService,
  InMemoryCategoryService,
} from '../src/modules/categories/category.service.js';
import { ValidationError } from '../src/modules/categories/category.validation.js';

describe('Category Reordering Service Error Translation & Permutation Invariants', () => {
  const dummyConfig = {
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseAnonKey: 'test-anon-key',
    port: 3001,
    host: '0.0.0.0',
    logLevel: 'silent',
    nodeEnv: 'test' as const,
  };

  test('SupabaseCategoryService converts code 22023 to ValidationError', async () => {
    const service = new SupabaseCategoryService(dummyConfig);
    // Mock getScopedClient to return an rpc that fails with 22023
    (service as unknown as { getScopedClient: () => unknown }).getScopedClient = () => ({
      rpc: async () => ({
        data: null,
        error: { code: '22023', message: 'Category IDs list cannot be empty' },
      }),
    });

    await assert.rejects(
      async () => {
        await service.reorderCategories('user-1', {
          type: 'expense',
          category_ids: [],
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ValidationError);
        assert.equal(err.message, 'Category IDs list cannot be empty');
        return true;
      }
    );
  });

  test('SupabaseCategoryService converts custom validation error codes/messages to ValidationError', async () => {
    const service = new SupabaseCategoryService(dummyConfig);
    (service as unknown as { getScopedClient: () => unknown }).getScopedClient = () => ({
      rpc: async () => ({
        data: null,
        error: {
          code: 'P0001',
          message: 'Category IDs list must contain all active categories of the specified type',
        },
      }),
    });

    await assert.rejects(
      async () => {
        await service.reorderCategories('user-1', {
          type: 'income',
          category_ids: ['00000000-0000-0000-0000-000000000001'],
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /must contain all active categories/);
        return true;
      }
    );
  });

  test('SupabaseCategoryService preserves unexpected error code and message', async () => {
    const service = new SupabaseCategoryService(dummyConfig);
    (service as unknown as { getScopedClient: () => unknown }).getScopedClient = () => ({
      rpc: async () => ({
        data: null,
        error: { code: '50001', message: 'Internal connection lost' },
      }),
    });

    await assert.rejects(
      async () => {
        await service.reorderCategories('user-1', {
          type: 'expense',
          category_ids: ['00000000-0000-0000-0000-000000000001'],
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(!(err instanceof ValidationError));
        assert.match(err.message, /Failed to reorder categories: \[50001\] Internal connection lost/);
        return true;
      }
    );
  });

  test('InMemoryCategoryService reorders expense categories without affecting income categories', async () => {
    const service = new InMemoryCategoryService();
    const userId = 'test-user-id';

    const initialIncome = (await service.listCategories(userId, { type: 'income' })).categories;
    const initialExpense = (await service.listCategories(userId, { type: 'expense' })).categories;

    assert.ok(initialExpense.length >= 3);
    assert.ok(initialIncome.length >= 2);

    const reversedExpenseIds = initialExpense.map((c) => c.id).reverse();

    const reordered = await service.reorderCategories(userId, {
      type: 'expense',
      category_ids: reversedExpenseIds,
    });

    assert.equal(reordered.categories[0].id, reversedExpenseIds[0]);

    // Verify income categories are unaffected and keep original order
    const afterIncome = (await service.listCategories(userId, { type: 'income' })).categories;
    assert.deepEqual(
      afterIncome.map((c) => c.id),
      initialIncome.map((c) => c.id)
    );
  });

  test('InMemoryCategoryService rejects duplicate IDs with ValidationError', async () => {
    const service = new InMemoryCategoryService();
    const userId = 'test-user-id';
    const expense = (await service.listCategories(userId, { type: 'expense' })).categories;

    await assert.rejects(
      async () => {
        await service.reorderCategories(userId, {
          type: 'expense',
          category_ids: [expense[0].id, expense[0].id, expense[1].id],
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /must not contain duplicates/);
        return true;
      }
    );
  });

  test('InMemoryCategoryService rejects incomplete list with ValidationError', async () => {
    const service = new InMemoryCategoryService();
    const userId = 'test-user-id';
    const expense = (await service.listCategories(userId, { type: 'expense' })).categories;

    await assert.rejects(
      async () => {
        await service.reorderCategories(userId, {
          type: 'expense',
          category_ids: [expense[0].id],
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /must contain all active categories/);
        return true;
      }
    );
  });
});
