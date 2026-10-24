import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import {
  GET as handleGetCategories,
  POST as handlePostCategory,
  PUT as handlePutReorder,
} from '../src/app/api/backend/categories/route.js';
import { PATCH as handlePatchCategory } from '../src/app/api/backend/categories/[id]/route.js';
import { PATCH as handlePatchArchive } from '../src/app/api/backend/categories/[id]/archive/route.js';

describe('Frontend Category Proxy Authentication & Handlers', () => {
  test('BFF proxy GET /api/backend/categories returns 401 Unauthorized without session', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/categories?type=expense&include_archived=true');
    const res = await handleGetCategories(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy POST /api/backend/categories returns 401 Unauthorized without session', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Subscriptions', type: 'expense' }),
    });
    const res = await handlePostCategory(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy PUT /api/backend/categories returns 401 Unauthorized without session', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/categories', {
      method: 'PUT',
      body: JSON.stringify({
        type: 'expense',
        category_ids: ['00000000-0000-7000-8000-000000000001'],
      }),
    });
    const res = await handlePutReorder(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy PATCH /api/backend/categories/[id] returns 401 Unauthorized without session', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/categories/00000000-0000-7000-8000-000000000001', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed Category' }),
    });
    const params = Promise.resolve({ id: '00000000-0000-7000-8000-000000000001' });
    const res = await handlePatchCategory(req, { params });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy PATCH /api/backend/categories/[id]/archive returns 401 Unauthorized without session', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/categories/00000000-0000-7000-8000-000000000001/archive', {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
    const params = Promise.resolve({ id: '00000000-0000-7000-8000-000000000001' });
    const res = await handlePatchArchive(req, { params });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });
});
