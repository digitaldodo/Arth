import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.INTERNAL_API_URL = 'http://127.0.0.1:3001';

import {
  GET as handleGetPeople,
  POST as handlePostPerson,
} from '../src/app/api/backend/people/route.js';
import {
  GET as handleGetPersonDetail,
  PATCH as handlePatchPerson,
} from '../src/app/api/backend/people/[id]/route.js';
import { PATCH as handlePatchArchive } from '../src/app/api/backend/people/[id]/archive/route.js';
import { POST as handlePostRecord } from '../src/app/api/backend/people/[id]/records/route.js';
import { POST as handlePostSettlement } from '../src/app/api/backend/people/records/[recordId]/settlements/route.js';

describe('Frontend People BFF Proxy Authentication & Route Handlers', () => {
  const dummyId = '00000000-0000-7000-8000-000000000001';
  const dummyRecordId = '00000000-0000-7000-8000-000000000002';

  test('BFF proxy GET /api/backend/people returns 401 Unauthorized without session', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/people?direction=i_owe_them');
    const res = await handleGetPeople(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy POST /api/backend/people returns 401 Unauthorized without session', async () => {
    const req = new NextRequest('http://localhost:3000/api/backend/people', {
      method: 'POST',
      body: JSON.stringify({ name: 'Rahul', direction: 'i_owe_them' }),
    });
    const res = await handlePostPerson(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy GET /api/backend/people/[id] returns 401 Unauthorized without session', async () => {
    const req = new NextRequest(`http://localhost:3000/api/backend/people/${dummyId}`);
    const params = Promise.resolve({ id: dummyId });
    const res = await handleGetPersonDetail(req, { params });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy PATCH /api/backend/people/[id] returns 401 Unauthorized without session', async () => {
    const req = new NextRequest(`http://localhost:3000/api/backend/people/${dummyId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Rahul Sharma' }),
    });
    const params = Promise.resolve({ id: dummyId });
    const res = await handlePatchPerson(req, { params });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy PATCH /api/backend/people/[id]/archive returns 401 Unauthorized without session', async () => {
    const req = new NextRequest(`http://localhost:3000/api/backend/people/${dummyId}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
    const params = Promise.resolve({ id: dummyId });
    const res = await handlePatchArchive(req, { params });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy POST /api/backend/people/[id]/records returns 401 Unauthorized without session', async () => {
    const req = new NextRequest(`http://localhost:3000/api/backend/people/${dummyId}/records`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Movie tickets', amount: '500.00' }),
    });
    const params = Promise.resolve({ id: dummyId });
    const res = await handlePostRecord(req, { params });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('BFF proxy POST /api/backend/people/records/[recordId]/settlements returns 401 Unauthorized without session', async () => {
    const req = new NextRequest(`http://localhost:3000/api/backend/people/records/${dummyRecordId}/settlements`, {
      method: 'POST',
      body: JSON.stringify({ amount: '250.00' }),
    });
    const params = Promise.resolve({ recordId: dummyRecordId });
    const res = await handlePostSettlement(req, { params });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });
});
