import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { InMemoryCategoryService } from '../src/modules/categories/category.service.js';
import type { FastifyInstance } from 'fastify';

describe('Backend Category Management & Custom Ordering API', () => {
  let app: FastifyInstance;
  let service: InMemoryCategoryService;

  const userA = {
    userId: '11111111-1111-7111-8111-111111111111',
    email: 'user-a@example.com',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const userB = {
    userId: '22222222-2222-7222-8222-222222222222',
    email: 'user-b@example.com',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  before(async () => {
    service = new InMemoryCategoryService();
    service.seedDefaults(userA.userId);
    service.seedDefaults(userB.userId);

    const mockVerifier = async (token: string) => {
      if (token === 'user-a-token') return userA;
      if (token === 'user-b-token') return userB;
      throw new Error('Invalid token');
    };

    app = await buildApp(
      { env: 'test' },
      mockVerifier,
      undefined,
      service
    );
    await app.ready();
  });

  // 1. Authentication boundary
  test('rejects unauthenticated requests to category endpoints with 401', async () => {
    const listRes = await app.inject({ method: 'GET', url: '/api/v1/categories' });
    assert.equal(listRes.statusCode, 401);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      payload: { name: 'Books', type: 'expense' },
    });
    assert.equal(createRes.statusCode, 401);

    const reorderRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/categories/reorder',
      payload: { type: 'expense', category_ids: [] },
    });
    assert.equal(reorderRes.statusCode, 401);
  });

  // 2. Category creation & validation
  test('creates valid expense and income categories with 201 Created', async () => {
    const resExp = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        name: 'Gym & Fitness',
        type: 'expense',
        icon: '🏋️',
        color: '#2563EB',
      },
    });

    assert.equal(resExp.statusCode, 201);
    const bodyExp = resExp.json();
    assert.equal(bodyExp.category.name, 'Gym & Fitness');
    assert.equal(bodyExp.category.type, 'expense');
    assert.equal(bodyExp.category.icon, '🏋️');
    assert.equal(bodyExp.category.color, '#2563EB');
    assert.equal(bodyExp.category.is_default, false);
    assert.equal(bodyExp.category.archived_at, null);

    const resInc = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        name: 'Dividends',
        type: 'income',
      },
    });

    assert.equal(resInc.statusCode, 201);
    assert.equal(resInc.json().category.name, 'Dividends');
    assert.equal(resInc.json().category.type, 'income');
  });

  test('rejects empty, overly long, or whitespace-only category names', async () => {
    const resEmpty = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: '   ', type: 'expense' },
    });
    assert.equal(resEmpty.statusCode, 400);
    assert.match(resEmpty.json().message, /cannot be empty/);

    const resLong = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: 'A'.repeat(51), type: 'expense' },
    });
    assert.equal(resLong.statusCode, 400);
    assert.match(resLong.json().message, /cannot exceed 50 characters/);
  });

  test('rejects case-insensitive duplicate active category names with 409 Conflict', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: 'food & dining', type: 'expense' }, // duplicate of seeded 'Food & Dining'
    });

    assert.equal(res.statusCode, 409);
    assert.match(res.json().message, /already exists/);
  });

  // 3. Category update & rename
  test('renames existing category and updates color', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/categories?type=expense',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const category = listRes.json().categories[0];

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${category.id}`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        name: 'Food, Dining & Cafes',
        color: '#10B981',
      },
    });

    assert.equal(updateRes.statusCode, 200);
    assert.equal(updateRes.json().category.name, 'Food, Dining & Cafes');
    assert.equal(updateRes.json().category.color, '#10B981');
  });

  test('rejects renaming if new name collides with another active category of same type', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/categories?type=expense',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const cat1 = listRes.json().categories[0];
    const cat2 = listRes.json().categories[1];

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${cat1.id}`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: cat2.name.toUpperCase() }, // duplicate of cat2
    });

    assert.equal(res.statusCode, 409);
    assert.match(res.json().message, /already exists/);
  });

  test('rejects attempt to modify category type', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/categories?type=expense',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const cat = listRes.json().categories[0];

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${cat.id}`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { type: 'income' }, // PROHIBITED
    });

    assert.equal(res.statusCode, 400);
    assert.match(res.json().message, /cannot be modified/);
  });

  // 4. Archive & Restore
  test('archives category and excludes it from default listing', async () => {
    const listBefore = await app.inject({
      method: 'GET',
      url: '/api/v1/categories?type=expense',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const catToArchive = listBefore.json().categories[0];

    // Archive
    const archRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${catToArchive.id}/archive`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { archived: true },
    });

    assert.equal(archRes.statusCode, 200);
    assert.ok(archRes.json().category.archived_at !== null);
    assert.equal(archRes.json().category.is_archived, true);

    // Normal query excludes it
    const listAfter = await app.inject({
      method: 'GET',
      url: '/api/v1/categories?type=expense',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.ok(listAfter.json().categories.every((c: { id: string }) => c.id !== catToArchive.id));

    // Management query (includeArchived=true) includes it
    const listWithArchived = await app.inject({
      method: 'GET',
      url: '/api/v1/categories?type=expense&includeArchived=true',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const found = listWithArchived.json().categories.find((c: { id: string }) => c.id === catToArchive.id);
    assert.ok(found);
    assert.equal(found.is_archived, true);

    // Restore
    const restoreRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${catToArchive.id}/archive`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { archived: false },
    });
    assert.equal(restoreRes.statusCode, 200);
    assert.equal(restoreRes.json().category.archived_at, null);
    assert.equal(restoreRes.json().category.is_archived, false);
  });

  // 5. Cross-user isolation
  test('rejects cross-user update or archive mutations with 404', async () => {
    // User B tries to update User A's category
    const listA = await app.inject({
      method: 'GET',
      url: '/api/v1/categories',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const catA = listA.json().categories[0];

    const resUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${catA.id}`,
      headers: { authorization: 'Bearer user-b-token' }, // user B!
      payload: { name: 'Hacked Name' },
    });
    assert.equal(resUpdate.statusCode, 404);

    const resArchive = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${catA.id}/archive`,
      headers: { authorization: 'Bearer user-b-token' }, // user B!
      payload: { archived: true },
    });
    assert.equal(resArchive.statusCode, 404);
  });

  // 6. Custom Ordering & Reordering
  test('reorders active categories and preserves custom order atomically', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/categories?type=income',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const incomeCats = listRes.json().categories;
    assert.ok(incomeCats.length >= 3);

    // Reverse the order of active income category IDs
    const reversedIds = incomeCats.map((c: { id: string }) => c.id).reverse();

    const reorderRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/categories/reorder',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        type: 'income',
        category_ids: reversedIds,
      },
    });

    assert.equal(reorderRes.statusCode, 200);
    const updated = reorderRes.json().categories;
    assert.equal(updated.length, reversedIds.length);
    assert.equal(updated[0].id, reversedIds[0]);
    assert.equal(updated[1].id, reversedIds[1]);

    // Verify subsequent GET returns the new custom order
    const verifyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/categories?type=income',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const verifiedCats = verifyRes.json().categories;
    assert.equal(verifiedCats[0].id, reversedIds[0]);
  });

  test('rejects incomplete, duplicate, or foreign category IDs in reorder request', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/categories?type=income',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const incomeCats = listRes.json().categories;
    const catIds = incomeCats.map((c: { id: string }) => c.id);

    // Incomplete list (missing categories)
    const incompleteRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/categories/reorder',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        type: 'income',
        category_ids: [catIds[0]], // only 1 of 4!
      },
    });
    assert.equal(incompleteRes.statusCode, 400);
    assert.match(incompleteRes.json().message, /must contain all active categories/);

    // Duplicate ID in list
    const dupRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/categories/reorder',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        type: 'income',
        category_ids: [catIds[0], catIds[0]],
      },
    });
    assert.equal(dupRes.statusCode, 400);
    assert.match(dupRes.json().message, /Duplicate category ID/);

    // Foreign user's category ID
    const listB = await app.inject({
      method: 'GET',
      url: '/api/v1/categories?type=income',
      headers: { authorization: 'Bearer user-b-token' },
    });
    const catBId = listB.json().categories[0].id;
    const foreignIds = [...catIds.slice(1), catBId];

    const foreignRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/categories/reorder',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        type: 'income',
        category_ids: foreignIds,
      },
    });
    assert.equal(foreignRes.statusCode, 400);
    assert.match(foreignRes.json().message, /invalid, archived, or belong to another user/);
  });
});
