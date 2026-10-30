import type { TransactionDTO } from '@arth/contracts';

const SCALE = 1_000_000_000_000n;
const divideHalfUp = (numerator: bigint, denominator: bigint) => (numerator + denominator / 2n) / denominator;

export type ExpenseWeek = { weekStart: string; amountPaise: number };
export type ForecastResult = {
  weeklyPaise: number;
  source: 'personalized-ml' | 'historical-baseline' | 'unavailable';
  readiness: 'ready' | 'insufficient-history';
  historyWeeks: number;
  activeWeeks: number;
  modelVersion: string;
  trainingDate: string;
  dataCutoffDate: string | null;
  forecastWeeks: number;
  evaluation: { modelMaePaise: number | null; baselineMaePaise: number | null };
  explanation: string;
};

function mondayOf(date: Date): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  return result;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildEssentialWeeklySeries(transactions: TransactionDTO[]): ExpenseWeek[] {
  const eligible = transactions.filter(
    (item) => item.type === 'expense' && item.necessity === 'essential' && /^\d{4}-\d{2}-\d{2}$/.test(item.transaction_date)
  );
  if (!eligible.length) return [];
  const weekTotals = new Map<string, bigint>();
  for (const tx of eligible) {
    const start = mondayOf(new Date(`${tx.transaction_date}T00:00:00Z`));
    const key = dateKey(start);
    weekTotals.set(key, (weekTotals.get(key) ?? 0n) + BigInt(tx.amount_paise));
  }
  const first = new Date(`${[...weekTotals.keys()].sort()[0]}T00:00:00Z`);
  const last = new Date(`${[...weekTotals.keys()].sort().at(-1)}T00:00:00Z`);
  const weeks: ExpenseWeek[] = [];
  for (const cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 7)) {
    const key = dateKey(cursor);
    weeks.push({ weekStart: key, amountPaise: Number(weekTotals.get(key) ?? 0n) });
  }
  return weeks;
}

type Example = { features: number[]; target: number };
type Tree = { value: number; feature?: number; threshold?: number; left?: Tree; right?: Tree };

function featuresFor(history: number[], index: number): number[] {
  const at = (offset: number) => history[index - offset] ?? 0;
  const mean = (count: number) => {
    const values = Array.from({ length: count }, (_, i) => at(i + 1));
    return values.reduce((sum, value) => sum + value, 0) / count;
  };
  return [at(1), at(2), mean(4), mean(12)];
}

function trainTree(examples: Example[], depth = 0): Tree {
  const average = examples.reduce((sum, item) => sum + item.target, 0) / examples.length;
  if (depth >= 2 || examples.length < 8) return { value: average };
  let best: { score: number; feature: number; threshold: number; left: Example[]; right: Example[] } | null = null;
  for (let feature = 0; feature < 4; feature++) {
    const sorted = [...new Set(examples.map((item) => item.features[feature]))].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const threshold = (sorted[i] + sorted[i + 1]) / 2;
      const left = examples.filter((item) => item.features[feature] <= threshold);
      const right = examples.filter((item) => item.features[feature] > threshold);
      if (left.length < 4 || right.length < 4) continue;
      const variance = (items: Example[]) => {
        const mean = items.reduce((sum, item) => sum + item.target, 0) / items.length;
        return items.reduce((sum, item) => sum + (item.target - mean) ** 2, 0);
      };
      const score = variance(left) + variance(right);
      if (!best || score < best.score) best = { score, feature, threshold, left, right };
    }
  }
  if (!best) return { value: average };
  return { value: average, feature: best.feature, threshold: best.threshold, left: trainTree(best.left, depth + 1), right: trainTree(best.right, depth + 1) };
}

function predictTree(tree: Tree, features: number[]): number {
  if (tree.feature === undefined || !tree.left || !tree.right) return tree.value;
  return predictTree(features[tree.feature] <= (tree.threshold ?? 0) ? tree.left : tree.right, features);
}

function supervisedExamples(history: number[]): Example[] {
  const examples: Example[] = [];
  for (let i = 12; i < history.length; i++) examples.push({ features: featuresFor(history, i), target: history[i] });
  return examples;
}

function mae(actual: number[], predicted: number[]): number {
  return actual.reduce((sum, value, i) => sum + Math.abs(value - predicted[i]), 0) / Math.max(1, actual.length);
}

export function forecastEssentialSpend(weeks: ExpenseWeek[]): ForecastResult {
  const trainingWeeks = weeks.slice(-260);
  const amounts = trainingWeeks.map((week) => week.amountPaise);
  const activeWeeks = amounts.filter((amount) => amount > 0).length;
  const spanReady = amounts.length >= 52 && activeWeeks >= 40;
  const recent4 = amounts.slice(-4);
  const trailing12 = amounts.slice(-12);
  const shortMean = recent4.length ? recent4.reduce((a, b) => a + b, 0) / recent4.length : 0;
  const longMean = trailing12.length ? trailing12.reduce((a, b) => a + b, 0) / trailing12.length : shortMean;
  const activeValues = amounts.filter((amount) => amount > 0).sort((a, b) => a - b);
  const activeMedian = activeValues.length ? activeValues[Math.floor(activeValues.length / 2)] : 0;
  const fallback = Math.round(Math.max(shortMean, longMean, activeMedian));
  if (!spanReady || amounts.length < 28) {
    return { weeklyPaise: fallback, source: fallback > 0 ? 'historical-baseline' : 'unavailable', readiness: 'insufficient-history', historyWeeks: amounts.length, activeWeeks, modelVersion: 'arth-essential-tree-v1', trainingDate: new Date().toISOString(), dataCutoffDate: trainingWeeks.at(-1)?.weekStart ?? null, forecastWeeks: 4, evaluation: { modelMaePaise: null, baselineMaePaise: null }, explanation: fallback > 0 ? 'Preliminary estimate from the higher of your recent 4-week and 12-week average. Record more essential expenses for a personalized model.' : 'There is not enough recorded essential spending to estimate a future amount.' };
  }

  const actual: number[] = [];
  const modelPredictions: number[] = [];
  const baselinePredictions: number[] = [];
  const firstTest = Math.max(20, amounts.length - 8);
  for (let i = firstTest; i < amounts.length; i++) {
    const history = amounts.slice(0, i);
    const examples = supervisedExamples(history);
    if (examples.length < 8) continue;
    const tree = trainTree(examples);
    actual.push(amounts[i]);
    modelPredictions.push(Math.max(0, predictTree(tree, featuresFor(history, history.length))));
    const recent = history.slice(-4);
    baselinePredictions.push(recent.reduce((sum, value) => sum + value, 0) / recent.length);
  }
  const modelMae = mae(actual, modelPredictions);
  const baselineMae = mae(actual, baselinePredictions);
  const useModel = actual.length >= 6 && baselineMae > 0 && modelMae <= baselineMae * 0.9;
  let prediction = fallback;
  if (useModel) {
    const history = [...amounts];
    const examples = supervisedExamples(history);
    for (let i = 0; i < 4; i++) {
      const estimate = Math.max(0, Math.round(predictTree(trainTree(examples), featuresFor(history, history.length))));
      prediction = i === 0 ? estimate : prediction + estimate;
      history.push(estimate);
      examples.push({ features: featuresFor(history, history.length - 1), target: estimate });
    }
    prediction = Math.max(fallback, Math.ceil(prediction / 4));
  }
  return {
    weeklyPaise: prediction,
    source: useModel ? 'personalized-ml' : 'historical-baseline',
    readiness: 'ready',
    historyWeeks: amounts.length,
    activeWeeks,
    modelVersion: 'arth-essential-tree-v1',
    trainingDate: new Date().toISOString(),
    dataCutoffDate: trainingWeeks.at(-1)?.weekStart ?? null,
    forecastWeeks: 4,
    evaluation: { modelMaePaise: Math.round(modelMae), baselineMaePaise: Math.round(baselineMae) },
    explanation: useModel ? 'A personalized regression tree learned from your recorded weekly essential spending. It passed an 8-week chronological holdout check against the trailing 4-week average.' : 'The personalized model did not beat the trailing 4-week average by the required 10% on chronological holdout data, so the conservative historical baseline is used.'
  };
}

export type SafeToSpendInputs = {
  availablePaise: bigint;
  confirmedIncomePaise: bigint;
  commitmentsPaise: bigint;
  forecastEssentialPaise: bigint;
  plannedSavingsPaise: bigint;
  reservePaise: bigint;
  days: number;
};
export type SafeToSpendResult = { rawPaise: bigint; discretionaryPaise: bigint; shortfallPaise: bigint; dailyPacePaise: bigint };

export function calculateSafeToSpend(input: SafeToSpendInputs): SafeToSpendResult {
  const rawPaise = input.availablePaise + input.confirmedIncomePaise - input.commitmentsPaise - input.forecastEssentialPaise - input.plannedSavingsPaise - input.reservePaise;
  return { rawPaise, discretionaryPaise: rawPaise > 0n ? rawPaise : 0n, shortfallPaise: rawPaise < 0n ? -rawPaise : 0n, dailyPacePaise: rawPaise > 0n && input.days > 0 ? rawPaise / BigInt(input.days) : 0n };
}

export function calculateEmi(principalPaise: bigint, annualRateBps: number, months: number): { emiPaise: bigint; interestPaise: bigint; totalRepaymentPaise: bigint; schedule: { month: number; principalPaise: bigint; interestPaise: bigint; balancePaise: bigint }[] } {
  if (principalPaise <= 0n || !Number.isInteger(months) || months < 1 || months > 600 || !Number.isInteger(annualRateBps) || annualRateBps < 0 || annualRateBps > 100000) throw new Error('Enter a positive loan amount, a tenure from 1 to 600 months, and a non-negative annual rate.');
  let emiPaise: bigint;
  const rate = BigInt(annualRateBps) * SCALE / 1_200_000n;
  if (rate === 0n) emiPaise = divideHalfUp(principalPaise, BigInt(months));
  else {
    let power = SCALE;
    for (let i = 0; i < months; i++) power = power * (SCALE + rate) / SCALE;
    emiPaise = divideHalfUp(principalPaise * rate * power, SCALE * (power - SCALE));
  }
  let balance = principalPaise;
  const schedule = [];
  for (let month = 1; month <= months; month++) {
    const interest = divideHalfUp(balance * rate, SCALE);
    const payment = month === months ? balance + interest : emiPaise;
    const principal = payment > interest ? payment - interest : 0n;
    balance = balance > principal ? balance - principal : 0n;
    schedule.push({ month, principalPaise: principal, interestPaise: interest, balancePaise: balance });
  }
  const totalRepaymentPaise = schedule.reduce((sum, item) => sum + item.principalPaise + item.interestPaise, 0n);
  return { emiPaise, interestPaise: totalRepaymentPaise - principalPaise, totalRepaymentPaise, schedule };
}

export type StressInputs = { monthlyIncomePaise: bigint; essentialPaise: bigint; existingEmiPaise: bigint; proposedEmiPaise: bigint; reservePaise: bigint; incomeReductionPercent: number; expenseIncreasePercent: number; unexpectedExpensePaise: bigint; delayDays: number };
export function evaluateStress(inputs: StressInputs) {
  const safePercent = (value: number, fallback: number, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : fallback;
  const incomeReduction = safePercent(inputs.incomeReductionPercent, 20, 100);
  const expenseIncrease = safePercent(inputs.expenseIncreasePercent, 15, 500);
  const delayDays = safePercent(inputs.delayDays, 15, 365);
  const cases = [
    { label: 'Baseline', reduction: 0, increase: 0, shock: 0n },
    { label: 'Moderate stress', reduction: Math.max(10, incomeReduction), increase: Math.max(10, expenseIncrease), shock: inputs.unexpectedExpensePaise },
    { label: 'Severe stress', reduction: Math.max(20, incomeReduction), increase: Math.max(20, expenseIncrease), shock: inputs.unexpectedExpensePaise },
  ];
  return cases.map((scenario) => {
    const income = inputs.monthlyIncomePaise * BigInt(100 - scenario.reduction) / 100n;
    const essentials = inputs.essentialPaise * BigInt(100 + scenario.increase) / 100n;
    const surplus = income - essentials - inputs.existingEmiPaise - inputs.proposedEmiPaise;
    const availableReserve = inputs.reservePaise - scenario.shock;
    const delayGap = inputs.monthlyIncomePaise * BigInt(delayDays) / 30n;
    const runway = surplus < 0n ? (availableReserve > 0n ? Number(availableReserve / -surplus) : 0) : null;
    const classification = inputs.monthlyIncomePaise <= 0n || inputs.essentialPaise <= 0n ? 'Insufficient income or expense data' : surplus < 0n || availableReserve < 0n ? 'Not sustainable under selected scenario' : surplus < inputs.monthlyIncomePaise / 10n ? 'Tight cash flow' : scenario.reduction >= 20 || scenario.increase >= 20 ? 'Vulnerable to moderate stress' : 'Comfortable under current assumptions';
    return { ...scenario, incomePaise: income, essentialPaise: essentials, totalEmiPaise: inputs.existingEmiPaise + inputs.proposedEmiPaise, surplusPaise: surplus, reserveAfterShockPaise: availableReserve, delayCoveragePaise: inputs.reservePaise - delayGap, reserveRunwayMonths: runway, classification };
  });
}
