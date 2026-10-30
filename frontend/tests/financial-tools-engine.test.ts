import assert from 'node:assert/strict';
import test from 'node:test';
import type { TransactionDTO } from '@arth/contracts';
import {
  calculateEmi,
  calculateSafeToSpend,
  buildEssentialWeeklySeries,
  evaluateStress,
  forecastEssentialSpend,
  type ExpenseWeek,
} from '../src/features/financial-tools/financial-engine';

test('Safe to Spend uses exact paise arithmetic and separates a shortfall from discretionary capacity', () => {
  const result = calculateSafeToSpend({ availablePaise: 1_000_00n, confirmedIncomePaise: 20_000n, commitmentsPaise: 30_000n, forecastEssentialPaise: 25_000n, plannedSavingsPaise: 5_000n, reservePaise: 10_000n, days: 10 });
  assert.equal(result.discretionaryPaise, 50_000n);
  assert.equal(result.dailyPacePaise, 5_000n);
  const shortfall = calculateSafeToSpend({ availablePaise: 0n, confirmedIncomePaise: 0n, commitmentsPaise: 1n, forecastEssentialPaise: 0n, plannedSavingsPaise: 0n, reservePaise: 0n, days: 3 });
  assert.equal(shortfall.discretionaryPaise, 0n);
  assert.equal(shortfall.shortfallPaise, 1n);
});

test('EMI handles zero interest and produces a fully amortized reducing-balance schedule', () => {
  const noInterest = calculateEmi(1_000_000n, 0, 10);
  assert.equal(noInterest.emiPaise, 100_000n);
  assert.equal(noInterest.interestPaise, 0n);
  const standard = calculateEmi(10_000_000n, 1200, 12);
  assert.ok(standard.emiPaise > 0n);
  assert.equal(standard.schedule.length, 12);
  assert.equal(standard.schedule.at(-1)?.balancePaise, 0n);
  assert.equal(standard.schedule.reduce((sum, row) => sum + row.principalPaise, 0n), 10_000_000n);
  assert.throws(() => calculateEmi(0n, 1000, 12));
});

test('personalized tree requires sufficient history and evaluates chronologically against a simple baseline', () => {
  assert.equal(forecastEssentialSpend([]).source, 'unavailable');
  const short: ExpenseWeek[] = Array.from({ length: 12 }, (_, i) => ({ weekStart: `2026-01-${String(i * 7 + 1).padStart(2, '0')}`, amountPaise: 100_000 }));
  assert.equal(forecastEssentialSpend(short).source, 'historical-baseline');
  const long: ExpenseWeek[] = Array.from({ length: 72 }, (_, i) => ({ weekStart: new Date(Date.UTC(2025, 0, 6 + i * 7)).toISOString().slice(0, 10), amountPaise: 100_000 + i * 1000 + (i % 4) * 1000 }));
  const result = forecastEssentialSpend(long);
  assert.equal(result.readiness, 'ready');
  assert.ok(result.evaluation.modelMaePaise !== null);
  assert.ok(result.evaluation.baselineMaePaise !== null);
  assert.ok(result.weeklyPaise >= 0);
  const learnablePattern: ExpenseWeek[] = Array.from({ length: 80 }, (_, index) => ({ weekStart: new Date(Date.UTC(2024, 0, 1 + index * 7)).toISOString().slice(0, 10), amountPaise: index % 16 < 8 ? 100_000 : 500_000 }));
  const trained = forecastEssentialSpend(learnablePattern);
  assert.equal(trained.source, 'personalized-ml');
  assert.ok((trained.evaluation.modelMaePaise ?? Infinity) < (trained.evaluation.baselineMaePaise ?? 0));
});

test('weekly training data contains only expense transactions marked essential', () => {
  const weeks = buildEssentialWeeklySeries([
    { transaction_date: '2026-10-26', type: 'expense', necessity: 'essential', amount_paise: 12500 },
    { transaction_date: '2026-10-28', type: 'expense', necessity: 'optional', amount_paise: 50000 },
    { transaction_date: '2026-10-29', type: 'income', necessity: null, amount_paise: 90000 },
  ] as unknown as TransactionDTO[]);
  assert.deepEqual(weeks, [{ weekStart: '2026-10-26', amountPaise: 12500 }]);
});

test('stress scenarios preserve hypothetical one-off costs as reserve reductions', () => {
  const scenarios = evaluateStress({ monthlyIncomePaise: 500_000n, essentialPaise: 200_000n, existingEmiPaise: 50_000n, proposedEmiPaise: 100_000n, reservePaise: 100_000n, incomeReductionPercent: 10, expenseIncreasePercent: 10, unexpectedExpensePaise: 20_000n, delayDays: 15 });
  assert.equal(scenarios[0].surplusPaise, 150_000n);
  assert.equal(scenarios[0].reserveAfterShockPaise, 100_000n);
  assert.equal(scenarios[2].reserveAfterShockPaise, 80_000n);
  assert.ok(scenarios[2].surplusPaise < scenarios[0].surplusPaise);
});
