import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { v7 as uuidv7 } from 'uuid';
import { buildApp } from '../src/app.js';
import { InMemoryTransactionService } from '../src/modules/transactions/transaction.service.js';
import { InMemoryCategoryService } from '../src/modules/categories/category.service.js';
import { InMemoryPeopleService } from '../src/modules/people/people.service.js';
import type { FastifyInstance } from 'fastify';

describe('Backend People & Money Tracker API', () => {
  let app: FastifyInstance;
  let txnService: InMemoryTransactionService;
  let catService: InMemoryCategoryService;
  let peopleService: InMemoryPeopleService;

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
    txnService = new InMemoryTransactionService();
    catService = new InMemoryCategoryService();
    peopleService = new InMemoryPeopleService();

    txnService.seedDefaultCategories(userA.userId);
    txnService.seedDefaultCategories(userB.userId);
    catService.seedDefaults(userA.userId);
    catService.seedDefaults(userB.userId);

    const mockVerifier = async (token: string) => {
      if (token === 'user-a-token') return userA;
      if (token === 'user-b-token') return userB;
      throw new Error('Invalid token');
    };

    app = await buildApp(
      { env: 'test' },
      mockVerifier,
      txnService,
      catService,
      peopleService
    );
    await app.ready();
  });

  // 1. Authentication boundary
  test('rejects unauthenticated requests to people endpoints with 401', async () => {
    const validUuid = uuidv7();
    const endpoints = [
      { method: 'GET', url: '/api/v1/people' },
      { method: 'POST', url: '/api/v1/people', payload: { name: 'Rahul', direction: 'i_owe_them' } },
      { method: 'GET', url: `/api/v1/people/${validUuid}` },
      { method: 'PATCH', url: `/api/v1/people/${validUuid}`, payload: { name: 'Rahul S' } },
      { method: 'PATCH', url: `/api/v1/people/${validUuid}/archive`, payload: { archived: true } },
      { method: 'POST', url: `/api/v1/people/${validUuid}/records`, payload: { name: 'Lunch', amount: '250.00' } },
      { method: 'POST', url: `/api/v1/people/records/${validUuid}/settlements`, payload: { amount: '100.00' } },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({
        method: ep.method as 'GET' | 'POST' | 'PATCH',
        url: ep.url,
        payload: ep.payload,
      });
      assert.equal(res.statusCode, 401, `Expected 401 on ${ep.method} ${ep.url}`);
    }
  });

  // 2. Creating people in both directions
  test('creates people with both directions and initial zero outstanding balance', async () => {
    // Person 1: I owe them (Rahul)
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/people',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        name: 'Rahul',
        direction: 'i_owe_them',
      },
    });
    assert.equal(resA.statusCode, 201);
    const bodyA = resA.json();
    assert.equal(bodyA.person.name, 'Rahul');
    assert.equal(bodyA.person.direction, 'i_owe_them');
    assert.equal(bodyA.person.outstanding_paise, 0);
    assert.equal(bodyA.person.status_label, 'I owe Rahul ₹0.00');

    // Person 2: They owe me (Amit)
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/people',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        name: 'Amit',
        direction: 'they_owe_me',
      },
    });
    assert.equal(resB.statusCode, 201);
    const bodyB = resB.json();
    assert.equal(bodyB.person.name, 'Amit');
    assert.equal(bodyB.person.direction, 'they_owe_me');
    assert.equal(bodyB.person.outstanding_paise, 0);
    assert.equal(bodyB.person.status_label, 'Amit owes me ₹0.00');
  });

  // 3. Validation on person creation
  test('rejects empty name or invalid direction', async () => {
    const resEmpty = await app.inject({
      method: 'POST',
      url: '/api/v1/people',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: '   ', direction: 'i_owe_them' },
    });
    assert.equal(resEmpty.statusCode, 400);

    const resInvalidDir = await app.inject({
      method: 'POST',
      url: '/api/v1/people',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: 'Priya', direction: 'invalid_direction' },
    });
    assert.equal(resInvalidDir.statusCode, 400);
  });

  // 4. Adding named money records and calculating balance
  test('creates multiple named records and tracks cumulative outstanding balance', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/people',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const rahul = listRes.json().people.find((p: { name: string }) => p.name === 'Rahul')!;

    // Record 1: Movie tickets ₹500
    const rec1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/people/${rahul.id}/records`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        name: 'Movie tickets',
        amount: '500.00',
        notes: 'IMAX tickets',
      },
    });
    assert.equal(rec1Res.statusCode, 201);
    const rec1Body = rec1Res.json();
    assert.equal(rec1Body.record.name, 'Movie tickets');
    assert.equal(rec1Body.record.amount_paise, 50000);
    assert.equal(rec1Body.record.direction, 'i_owe_them');
    assert.equal(rec1Body.record.status, 'outstanding');
    assert.equal(rec1Body.person.outstanding_paise, 50000);
    assert.equal(rec1Body.person.status_label, 'I owe Rahul ₹500.00');

    // Record 2: Electricity bill ₹800
    const rec2Res = await app.inject({
      method: 'POST',
      url: `/api/v1/people/${rahul.id}/records`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        name: 'Electricity bill',
        amount: '800.00',
      },
    });
    assert.equal(rec2Res.statusCode, 201);
    const rec2Body = rec2Res.json();
    assert.equal(rec2Body.record.amount_paise, 80000);
    // Cumulative outstanding = ₹500 + ₹800 = ₹1,300 (130000 paise)
    assert.equal(rec2Body.person.outstanding_paise, 130000);
    assert.equal(rec2Body.person.status_label, 'I owe Rahul ₹1,300.00');
  });

  // 5. Validation on money records
  test('rejects invalid, zero, or negative amounts on record creation', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/people',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const rahul = listRes.json().people.find((p: { name: string }) => p.name === 'Rahul')!;

    const resZero = await app.inject({
      method: 'POST',
      url: `/api/v1/people/${rahul.id}/records`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: 'Dinner', amount: '0' },
    });
    assert.equal(resZero.statusCode, 400);

    const resNeg = await app.inject({
      method: 'POST',
      url: `/api/v1/people/${rahul.id}/records`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: 'Dinner', amount: '-100.00' },
    });
    assert.equal(resNeg.statusCode, 400);

    const resInvalidDate = await app.inject({
      method: 'POST',
      url: `/api/v1/people/${rahul.id}/records`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: 'Dinner', amount: '100.00', record_date: '2026-02-31' },
    });
    assert.equal(resInvalidDate.statusCode, 400);
  });

  // 6. Partial and full settlements
  test('supports partial settlement and full settlement of named records', async () => {
    // Create new person: Vikram (They owe me ₹1,000)
    const pRes = await app.inject({
      method: 'POST',
      url: '/api/v1/people',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: 'Vikram', direction: 'they_owe_me' },
    });
    const vikram = pRes.json().person;

    const rRes = await app.inject({
      method: 'POST',
      url: `/api/v1/people/${vikram.id}/records`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: 'Concert pass', amount: '1000.00' },
    });
    const record = rRes.json().record;

    // Partial settlement: Receive ₹400
    const set1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/people/records/${record.id}/settlements`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { amount: '400.00', notes: 'UPI partial payment' },
    });
    assert.equal(set1Res.statusCode, 201);
    const set1Body = set1Res.json();
    assert.equal(set1Body.settlement.amount_paise, 40000);
    assert.equal(set1Body.record.status, 'partially_settled');
    assert.equal(set1Body.record.remaining_paise, 60000); // ₹600 remaining
    assert.equal(set1Body.person.outstanding_paise, 60000);
    assert.equal(set1Body.person.status_label, 'Vikram owes me ₹600.00');

    // Over-settlement attempt: Try to settle ₹700 (exceeds ₹600)
    const overRes = await app.inject({
      method: 'POST',
      url: `/api/v1/people/records/${record.id}/settlements`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { amount: '700.00' },
    });
    assert.equal(overRes.statusCode, 409);
    assert.match(overRes.json().message, /exceeds remaining outstanding balance/);

    // Full settlement: Settle remaining ₹600
    const set2Res = await app.inject({
      method: 'POST',
      url: `/api/v1/people/records/${record.id}/settlements`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { amount: '600.00', notes: 'Final settlement' },
    });
    assert.equal(set2Res.statusCode, 201);
    const set2Body = set2Res.json();
    assert.equal(set2Body.record.status, 'settled');
    assert.equal(set2Body.record.remaining_paise, 0);
    assert.equal(set2Body.person.outstanding_paise, 0);
    assert.equal(set2Body.person.status_label, 'Vikram owes me ₹0.00');
  });

  // 7. Direction change rules
  test('blocks direction change while outstanding records exist, allows when fully settled', async () => {
    // Rahul has outstanding records (₹1,300) -> direction change must be rejected
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/people',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const rahul = listRes.json().people.find((p: { name: string }) => p.name === 'Rahul')!;

    const blockRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/people/${rahul.id}`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { direction: 'they_owe_me' },
    });
    assert.equal(blockRes.statusCode, 409);
    assert.match(blockRes.json().message, /outstanding records/);

    // Vikram is fully settled -> direction change must succeed
    const vikram = listRes.json().people.find((p: { name: string }) => p.name === 'Vikram')!;
    const allowRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/people/${vikram.id}`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { direction: 'i_owe_them' },
    });
    assert.equal(allowRes.statusCode, 200);
    assert.equal(allowRes.json().person.direction, 'i_owe_them');
    assert.equal(allowRes.json().person.status_label, 'I owe Vikram ₹0.00');
  });

  // 8. Renaming a person
  test('renames a person and updates their status label correctly', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/people',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const amit = listRes.json().people.find((p: { name: string }) => p.name === 'Amit')!;

    const renameRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/people/${amit.id}`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: 'Amit Sharma' },
    });
    assert.equal(renameRes.statusCode, 200);
    assert.equal(renameRes.json().person.name, 'Amit Sharma');
    assert.equal(renameRes.json().person.status_label, 'Amit Sharma owes me ₹0.00');
  });

  // 9. Archiving and non-destructive retention
  test('archives person, excludes from default listing, but preserves details and history', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/people',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const rahul = listRes.json().people.find((p: { name: string }) => p.name === 'Rahul')!;

    // Archive Rahul
    const arcRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/people/${rahul.id}/archive`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { archived: true },
    });
    assert.equal(arcRes.statusCode, 200);
    assert.equal(arcRes.json().person.is_archived, true);

    // Rahul should NOT be in active list
    const activeList = await app.inject({
      method: 'GET',
      url: '/api/v1/people',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.ok(!activeList.json().people.some((p: { id: string }) => p.id === rahul.id));

    // Rahul SHOULD be in archived list
    const allList = await app.inject({
      method: 'GET',
      url: '/api/v1/people?include_archived=true',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.ok(allList.json().people.some((p: { id: string }) => p.id === rahul.id));

    // Detail endpoint still returns Rahul with records and history
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/people/${rahul.id}`,
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(detailRes.statusCode, 200);
    assert.equal(detailRes.json().person.records.length, 2);

    // Adding record to archived person is rejected
    const blockAdd = await app.inject({
      method: 'POST',
      url: `/api/v1/people/${rahul.id}/records`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: 'Coffee', amount: '150.00' },
    });
    assert.equal(blockAdd.statusCode, 409);
  });

  // 10. Cross-user isolation
  test('rejects cross-user access with 404', async () => {
    // Create person under User B
    const bRes = await app.inject({
      method: 'POST',
      url: '/api/v1/people',
      headers: { authorization: 'Bearer user-b-token' },
      payload: { name: 'Kavita', direction: 'they_owe_me' },
    });
    const kavita = bRes.json().person;

    // User A cannot view Kavita
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/people/${kavita.id}`,
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(getRes.statusCode, 404);

    // User A cannot rename Kavita
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/people/${kavita.id}`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: 'Hacked Kavita' },
    });
    assert.equal(patchRes.statusCode, 404);

    // User A cannot archive Kavita
    const arcRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/people/${kavita.id}/archive`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { archived: true },
    });
    assert.equal(arcRes.statusCode, 404);

    // User A cannot add records to Kavita
    const addRecRes = await app.inject({
      method: 'POST',
      url: `/api/v1/people/${kavita.id}/records`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: { name: 'Sneaky', amount: '500.00' },
    });
    assert.equal(addRecRes.statusCode, 404);
  });
});
