import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { v7 as uuidv7 } from 'uuid';
import {
  InMemoryPeopleService,
} from '../src/modules/people/people.service.js';
import {
  InMemoryTransactionService,
} from '../src/modules/transactions/transaction.service.js';
import {
  InMemoryCategoryService,
} from '../src/modules/categories/category.service.js';
import { ConflictError, ValidationError, NotFoundError } from '../src/modules/people/people.validation.js';

describe('Database ACID Guarantees, Reliability & Concurrency Hardening', () => {
  const userA = '0192e456-789a-7bc1-8def-111111111111';
  const userB = '0192e456-789a-7bc1-8def-222222222222';

  let peopleService: InMemoryPeopleService;
  let txService: InMemoryTransactionService;
  let catService: InMemoryCategoryService;

  beforeEach(() => {
    peopleService = new InMemoryPeopleService();
    txService = new InMemoryTransactionService();
    catService = new InMemoryCategoryService();
    txService.seedDefaultCategories(userA);
    txService.seedDefaultCategories(userB);
    catService.seedDefaults(userA);
    catService.seedDefaults(userB);
  });

  // ===========================================================================
  // 1. ATOMICITY TESTS
  // ===========================================================================
  describe('Atomicity', () => {
    test('Transaction creation and outbox event write are atomic', async () => {
      const txId = uuidv7();
      const categories = await txService.listCategories(userA, {});
      const cat = categories.categories[0];

      const initialTxCount = txService.transactions.length;
      const initialOutboxCount = txService.outboxEvents.length;

      const res = await txService.createTransaction(userA, {
        id: txId,
        amount_paise: 250000n, // ₹2,500.00
        type: 'expense',
        category_id: cat.id,
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential',
        description: 'Monthly groceries',
        notes: null,
      });

      assert.equal(res.isReplay, false);
      assert.equal(txService.transactions.length, initialTxCount + 1);
      assert.equal(txService.outboxEvents.length, initialOutboxCount + 1);

      const savedTx = txService.transactions.find((t) => t.id === txId);
      const savedOutbox = txService.outboxEvents.find((e) => e.entity_id === txId);

      assert.ok(savedTx, 'Transaction row must be present');
      assert.ok(savedOutbox, 'Outbox event row must be present');
      assert.equal(savedOutbox.event_type, 'transaction.created');
      assert.equal(savedOutbox.user_id, userA);
    });

    test('Settlement write atomically increments settled balance and updates parent timestamps', async () => {
      const person = await peopleService.createPerson(userA, {
        name: 'Aarav Sharma',
        direction: 'they_owe_me',
      });

      const recordRes = await peopleService.createRecord(userA, person.id, {
        name: 'Conference ticket',
        amount_paise: 500000n, // ₹5,000.00
        record_date: '2026-10-25',
        notes: 'Pre-paid ticket',
      });

      const initialRecord = peopleService.records.find((r) => r.id === recordRes.record.id)!;
      const initialPerson = peopleService.people.find((p) => p.id === person.id)!;
      const prevRecordUpdate = initialRecord.updated_at;
      const prevPersonUpdate = initialPerson.updated_at;

      // Small delay to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 10));

      const settleRes = await peopleService.recordSettlement(userA, recordRes.record.id, {
        amount_paise: 200000n, // ₹2,000.00
        settlement_date: '2026-10-25',
      });

      assert.equal(settleRes.settlement.amount_paise, 200000);
      assert.equal(settleRes.record.settled_paise, 200000);
      assert.equal(settleRes.record.remaining_paise, 300000);
      assert.equal(settleRes.record.status, 'partially_settled');

      // Both record and person updated_at must advance
      const updatedRecord = peopleService.records.find((r) => r.id === recordRes.record.id)!;
      const updatedPerson = peopleService.people.find((p) => p.id === person.id)!;
      assert.ok(new Date(updatedRecord.updated_at).getTime() >= new Date(prevRecordUpdate).getTime());
      assert.ok(new Date(updatedPerson.updated_at).getTime() >= new Date(prevPersonUpdate).getTime());
    });
  });

  // ===========================================================================
  // 2. CONSISTENCY & IDEMPOTENCY TESTS
  // ===========================================================================
  describe('Consistency & Idempotency', () => {
    test('Settlement limit cannot be exceeded (no negative balances)', async () => {
      const person = await peopleService.createPerson(userA, {
        name: 'Priya Verma',
        direction: 'they_owe_me',
      });

      const recordRes = await peopleService.createRecord(userA, person.id, {
        name: 'Dinner',
        amount_paise: 150000n, // ₹1,500.00
        record_date: '2026-10-25',
      });

      // Attempt settlement exceeding total
      await assert.rejects(
        () =>
          peopleService.recordSettlement(userA, recordRes.record.id, {
            amount_paise: 200000n, // ₹2,000.00 > ₹1,500.00
            settlement_date: '2026-10-25',
          }),
        (err: Error) => {
          assert.ok(err instanceof ConflictError);
          assert.match(err.message, /exceeds remaining outstanding balance/);
          return true;
        }
      );

      // Verify settled amount remains 0
      const detail = await peopleService.getPerson(userA, person.id);
      assert.equal(detail.person.records[0].settled_paise, 0);
      assert.equal(detail.person.records[0].remaining_paise, 150000);
    });

    test('Settlement idempotency: repeated request with same ID returns existing settlement without duplicate counting', async () => {
      const person = await peopleService.createPerson(userA, {
        name: 'Rohan Gupta',
        direction: 'they_owe_me',
      });

      const recordRes = await peopleService.createRecord(userA, person.id, {
        name: 'Project advance',
        amount_paise: 1000000n, // ₹10,000.00
        record_date: '2026-10-25',
      });

      const settlementId = uuidv7();

      // First call
      const res1 = await peopleService.recordSettlement(userA, recordRes.record.id, {
        id: settlementId,
        amount_paise: 400000n, // ₹4,000.00
        settlement_date: '2026-10-25',
        notes: 'First tranche',
      });

      assert.equal(res1.settlement.id, settlementId);
      assert.equal(peopleService.settlements.length, 1);
      assert.equal(res1.record.settled_paise, 400000);
      assert.equal(res1.record.remaining_paise, 600000);

      // Second call (exact same settlement ID and payload)
      const res2 = await peopleService.recordSettlement(userA, recordRes.record.id, {
        id: settlementId,
        amount_paise: 400000n,
        settlement_date: '2026-10-25',
        notes: 'First tranche',
      });

      assert.equal(res2.settlement.id, settlementId);
      // Crucial: no duplicate settlement inserted!
      assert.equal(peopleService.settlements.length, 1);
      assert.equal(res2.record.settled_paise, 400000, 'Settled paise must NOT be double-counted');
      assert.equal(res2.record.remaining_paise, 600000, 'Remaining paise must remain 600000');
    });

    test('Settlement idempotency: reusing same ID with conflicting attributes throws ConflictError', async () => {
      const person = await peopleService.createPerson(userA, {
        name: 'Vikram Mehta',
        direction: 'i_owe_them',
      });

      const recordRes = await peopleService.createRecord(userA, person.id, {
        name: 'Shared Cab',
        amount_paise: 50000n, // ₹500.00
        record_date: '2026-10-25',
      });

      const settlementId = uuidv7();

      // First settlement: ₹200
      await peopleService.recordSettlement(userA, recordRes.record.id, {
        id: settlementId,
        amount_paise: 20000n,
        settlement_date: '2026-10-25',
      });

      // Second call with same ID but different amount: ₹300
      await assert.rejects(
        () =>
          peopleService.recordSettlement(userA, recordRes.record.id, {
            id: settlementId,
            amount_paise: 30000n, // Conflict!
            settlement_date: '2026-10-25',
          }),
        (err: Error) => {
          assert.ok(err instanceof ConflictError);
          assert.match(err.message, /already exists with different attributes/);
          return true;
        }
      );
    });

    test('Transaction idempotency: duplicate ID replay returns isReplay without duplicating outbox events', async () => {
      const txId = uuidv7();
      const cat = (await txService.listCategories(userA, {})).categories[0];

      const payload = {
        id: txId,
        amount_paise: 75000n,
        type: 'expense' as const,
        category_id: cat.id,
        transaction_date: '2026-10-25',
        payment_method: 'cash' as const,
        necessity: 'optional' as const,
        description: 'Book purchase',
        notes: null,
      };

      const res1 = await txService.createTransaction(userA, payload);
      assert.equal(res1.isReplay, false);
      const outboxCount1 = txService.outboxEvents.length;

      // Replay
      const res2 = await txService.createTransaction(userA, payload);
      assert.equal(res2.isReplay, true);
      assert.equal(res2.transaction.id, txId);
      assert.equal(txService.outboxEvents.length, outboxCount1, 'Outbox must NOT receive duplicate event on replay');

      // Replay with conflicting amount
      await assert.rejects(
        () =>
          txService.createTransaction(userA, {
            ...payload,
            amount_paise: 99000n, // Different
          }),
        (err: Error) => {
          assert.equal(err.name, 'ConflictError');
          assert.match(err.message, /different payload attributes/);
          return true;
        }
      );
    });
  });

  // ===========================================================================
  // 3. ISOLATION & CONCURRENCY TESTS
  // ===========================================================================
  describe('Isolation & Concurrency', () => {
    test('Cross-user tenant boundary strictly blocks access to foreign records and settlements', async () => {
      const personB = await peopleService.createPerson(userB, {
        name: 'Private Contact User B',
        direction: 'they_owe_me',
      });

      const recordB = await peopleService.createRecord(userB, personB.id, {
        name: 'User B Loan',
        amount_paise: 100000n,
        record_date: '2026-10-25',
      });

      // User A attempts to view User B's person
      await assert.rejects(
        () => peopleService.getPerson(userA, personB.id),
        NotFoundError
      );

      // User A attempts to record settlement on User B's record
      await assert.rejects(
        () =>
          peopleService.recordSettlement(userA, recordB.record.id, {
            amount_paise: 50000n,
            settlement_date: '2026-10-25',
          }),
        NotFoundError
      );
    });

    test('Concurrent settlement race condition simulation: prevents over-settlement under concurrent requests', async () => {
      const person = await peopleService.createPerson(userA, {
        name: 'Concurrent Test Subject',
        direction: 'they_owe_me',
      });

      // Record: ₹1,000.00 total
      const recordRes = await peopleService.createRecord(userA, person.id, {
        name: 'Shared Gadget',
        amount_paise: 100000n, // ₹1,000.00
        record_date: '2026-10-25',
      });

      // 5 concurrent settlement requests of ₹400 each (Total attempted = ₹2,000 > ₹1,000)
      const settlementAttempts = Array.from({ length: 5 }, (_, i) => ({
        id: uuidv7(),
        amount_paise: 40000n, // ₹400.00 each
        settlement_date: '2026-10-25',
        notes: `Concurrent attempt ${i + 1}`,
      }));

      const results = await Promise.allSettled(
        settlementAttempts.map((attempt) =>
          peopleService.recordSettlement(userA, recordRes.record.id, attempt)
        )
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly 2 attempts (2 * 400 = 800 <= 1000) must succeed; 3 must be rejected because 800 + 400 = 1200 > 1000!
      assert.equal(fulfilled.length, 2, 'Exactly 2 settlements must succeed before balance is exhausted');
      assert.equal(rejected.length, 3, 'Exactly 3 settlements must be rejected due to balance limit');

      // Verify the final remaining balance
      const detail = await peopleService.getPerson(userA, person.id);
      const targetRecord = detail.person.records[0];
      assert.equal(targetRecord.settled_paise, 80000, 'Total settled must be exactly ₹800.00');
      assert.equal(targetRecord.remaining_paise, 20000, 'Remaining must be exactly ₹200.00');
      assert.equal(targetRecord.status, 'partially_settled');
    });

    test('Category reordering permutation check rejects invalid, duplicate, or incomplete IDs atomically', async () => {
      const categoriesRes = await catService.listCategories(userA, { type: 'expense' });
      const activeIds = categoriesRes.categories.map((c) => c.id);

      assert.ok(activeIds.length >= 11, 'Should have at least 11 active expense categories');

      // Incomplete list: omit last ID
      const incomplete = activeIds.slice(0, activeIds.length - 1);
      await assert.rejects(
        () => catService.reorderCategories(userA, { type: 'expense', category_ids: incomplete }),
        (err: Error) => {
          assert.equal(err.name, 'ValidationError');
          return true;
        }
      );

      // Duplicate list: duplicate first ID instead of last ID
      const duplicateList = [...incomplete, activeIds[0]];
      await assert.rejects(
        () => catService.reorderCategories(userA, { type: 'expense', category_ids: duplicateList }),
        (err: Error) => {
          assert.equal(err.name, 'ValidationError');
          return true;
        }
      );

      // Foreign ID list: include an ID belonging to user B
      const catB = (await catService.listCategories(userB, { type: 'expense' })).categories[0];
      const foreignList = [...incomplete, catB.id];
      await assert.rejects(
        () => catService.reorderCategories(userA, { type: 'expense', category_ids: foreignList }),
        (err: Error) => {
          assert.equal(err.name, 'ValidationError');
          return true;
        }
      );

      // Valid full reverse permutation
      const reversed = [...activeIds].reverse();
      const reorderRes = await catService.reorderCategories(userA, {
        type: 'expense',
        category_ids: reversed,
      });

      assert.equal(reorderRes.categories.length, activeIds.length);
      assert.equal(reorderRes.categories[0].id, reversed[0]);
      assert.equal(reorderRes.categories[reorderRes.categories.length - 1].id, reversed[reversed.length - 1]);
    });
  });

  // ===========================================================================
  // 4. HISTORY PROTECTION & ARCHIVAL TESTS
  // ===========================================================================
  describe('History Protection & Retention', () => {
    test('Archiving a person preserves all records, settlements, and balances intact', async () => {
      const person = await peopleService.createPerson(userA, {
        name: 'Archived Friend',
        direction: 'they_owe_me',
      });

      const rec = await peopleService.createRecord(userA, person.id, {
        name: 'Old Trip Expense',
        amount_paise: 300000n, // ₹3,000
        record_date: '2026-10-01',
      });

      await peopleService.recordSettlement(userA, rec.record.id, {
        amount_paise: 100000n, // ₹1,000 settled
        settlement_date: '2026-10-02',
      });

      // Archive person
      await peopleService.archivePerson(userA, person.id, { archived: true });

      // Excluded from default active listing
      const activeList = await peopleService.listPeople(userA, { include_archived: false });
      assert.ok(!activeList.people.some((p) => p.id === person.id));

      // Included in archived listing
      const fullList = await peopleService.listPeople(userA, { include_archived: true });
      const found = fullList.people.find((p) => p.id === person.id);
      assert.ok(found);
      assert.equal(found.is_archived, true);
      assert.equal(found.outstanding_paise, 200000, 'Outstanding balance preserved');

      // Detail view still accessible and intact
      const detail = await peopleService.getPerson(userA, person.id);
      assert.equal(detail.person.records.length, 1);
      assert.equal(detail.person.records[0].settled_paise, 100000);
      assert.equal(detail.person.records[0].settlements.length, 1);
    });

    test('Creating records on an archived person is strictly rejected', async () => {
      const person = await peopleService.createPerson(userA, {
        name: 'Former Colleague',
        direction: 'i_owe_them',
      });

      await peopleService.archivePerson(userA, person.id, { archived: true });

      await assert.rejects(
        () =>
          peopleService.createRecord(userA, person.id, {
            name: 'New bill',
            amount_paise: 50000n,
            record_date: '2026-10-25',
          }),
        ConflictError
      );
    });
  });
});
