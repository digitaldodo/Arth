'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchBalances, fetchBalanceMovements, fetchTransactions } from '@/lib/api-client';
import { formatPaiseToINR, paiseToDecimal, parseNonNegativeINRToPaise, type AccountBalancesDTO, type BalanceMovementDTO, type TransactionDTO } from '@arth/contracts';
import { buildEssentialWeeklySeries, calculateEmi, calculateSafeToSpend, evaluateStress, forecastEssentialSpend } from './financial-engine';

type Mode = 'safe' | 'emi';
type Assumptions = { income: string; commitments: string; savings: string; reserve: string; manualEssential: string; existingEmi: string; essentialEmiOverlap: string; monthlyIncome: string; monthlyFixed: string; liquidBalance: string; emergencyFund: string; interestIncrease: string; expenseIncrease: string; incomeReduction: string; unexpected: string; delay: string };
const emptyAssumptions: Assumptions = { income: '0', commitments: '0', savings: '0', reserve: '0', manualEssential: '0', existingEmi: '0', essentialEmiOverlap: '0', monthlyIncome: '0', monthlyFixed: '0', liquidBalance: '0', emergencyFund: '0', interestIncrease: '0', expenseIncrease: '15', incomeReduction: '20', unexpected: '0', delay: '15' };
const amount = (value: string) => parseNonNegativeINRToPaise(value || '0');

function istDateKey(date = new Date()): string {
  const values = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const parts = Object.fromEntries(values.map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return <label className="block space-y-1.5"><span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span><input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" />{hint && <span className="block text-[11px] text-[var(--text-muted)]">{hint}</span>}</label>;
}

export function FinancialToolsPage({ userId, initialMode = 'safe', initialBalances, onBack }: { userId: string; initialMode?: Mode; initialBalances?: AccountBalancesDTO | null; onBack: () => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [assumptions, setAssumptions] = useState<Assumptions>(emptyAssumptions);
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [movements, setMovements] = useState<BalanceMovementDTO[]>([]);
  const [balanceHistoryComplete, setBalanceHistoryComplete] = useState(true);
  const [balances, setBalances] = useState<AccountBalancesDTO | null>(initialBalances ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<'month' | '7' | '30' | 'custom'>('month');
  const [customEndDate, setCustomEndDate] = useState(() => { const date = new Date(`${istDateKey()}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 29); return date.toISOString().slice(0, 10); });
  const [loanAmount, setLoanAmount] = useState('');
  const [annualRate, setAnnualRate] = useState('');
  const [tenure, setTenure] = useState('');
  const [floating, setFloating] = useState(false);
  const [fees, setFees] = useState('0');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(`arth-financial-tools:${userId}`);
        if (stored) setAssumptions({ ...emptyAssumptions, ...JSON.parse(stored) });
      } catch { /* Ignore malformed local preferences; defaults are conservative. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userId]);

  const saveAssumption = (key: keyof Assumptions, value: string) => {
    const next = { ...assumptions, [key]: value };
    setAssumptions(next);
    try { localStorage.setItem(`arth-financial-tools:${userId}`, JSON.stringify(next)); } catch { /* Preferences remain editable for this session. */ }
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [balanceResult, firstPage, movementResult] = await Promise.all([fetchBalances(), fetchTransactions({ page: 1, page_size: 100 }), fetchBalanceMovements()]);
      const all = [...firstPage.items];
      let page = 2;
      while (page <= Math.ceil(firstPage.total_count / 100) && page <= 500) {
        const next = await fetchTransactions({ page, page_size: 100 });
        all.push(...next.items); page++;
      }
      setBalances(balanceResult); setTransactions(all); setMovements(movementResult.items);
      const unseenFutureMovement = movementResult.total_count > movementResult.items.length && (movementResult.items.at(-1)?.movement_date ?? istDateKey()) > istDateKey();
      setBalanceHistoryComplete(all.length >= firstPage.total_count && !unseenFutureMovement);
      const incomeRows = all.filter((tx) => tx.type === 'income' && tx.transaction_date <= istDateKey());
      const monthTotals = new Map<string, bigint>();
      for (const tx of incomeRows) {
        const key = tx.transaction_date.slice(0, 7);
        monthTotals.set(key, (monthTotals.get(key) ?? 0n) + BigInt(tx.amount_paise));
      }
      const recentMonths = [...monthTotals.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 6).map(([, total]) => total).filter((total) => total > 0n).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      const incomeEstimate = recentMonths.length >= 3 ? recentMonths[Math.floor(recentMonths.length / 2)] : 0n;
      setAssumptions((prev) => ({ ...prev, monthlyIncome: prev.monthlyIncome === '0' && incomeEstimate > 0n ? paiseToDecimal(incomeEstimate) : prev.monthlyIncome, liquidBalance: balanceResult.balances_configured ? paiseToDecimal(BigInt(balanceResult.total_available_paise)) : prev.liquidBalance }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load financial records.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const todayKey = istDateKey();
  const weekly = useMemo(() => forecastEssentialSpend(buildEssentialWeeklySeries(transactions.filter((tx) => tx.transaction_date <= todayKey))), [transactions, todayKey]);
  const monthlyEssential = useMemo(() => {
    const cutoff = new Date(`${todayKey}T00:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate() - 90);
    const relevant = transactions.filter((tx) => tx.type === 'expense' && tx.necessity === 'essential' && tx.transaction_date <= todayKey && new Date(`${tx.transaction_date}T00:00:00Z`) >= cutoff);
    const total = relevant.reduce((sum, tx) => sum + BigInt(tx.amount_paise), 0n);
    return total * 30n / 90n;
  }, [transactions, todayKey]);

  const horizonEndKey = useMemo(() => {
    const [year, month, day] = todayKey.split('-').map(Number);
    if (horizon === 'month') return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    if (horizon === 'custom') return /^\d{4}-\d{2}-\d{2}$/.test(customEndDate) && customEndDate >= todayKey ? customEndDate : todayKey;
    const end = new Date(Date.UTC(year, month - 1, day + Number(horizon) - 1));
    return end.toISOString().slice(0, 10);
  }, [horizon, todayKey, customEndDate]);
  const knownFuture = useMemo(() => transactions.filter((tx) => tx.transaction_date > todayKey), [transactions, todayKey]);
  const knownFutureMovements = useMemo(() => movements.filter((movement) => movement.movement_date > todayKey && movement.movement_type === 'adjustment'), [movements, todayKey]);
  const currentLiquidPaise = BigInt(balances?.total_available_paise ?? 0)
    - knownFuture.reduce((sum, tx) => sum + (tx.type === 'income' ? BigInt(tx.amount_paise) : -BigInt(tx.amount_paise)), 0n)
    - knownFutureMovements.reduce((sum, movement) => sum + BigInt(movement.adjustment_paise), 0n);
  const knownIncomeInHorizon = knownFuture.filter((tx) => tx.type === 'income' && tx.transaction_date <= horizonEndKey).reduce((sum, tx) => sum + BigInt(tx.amount_paise), 0n);
  const knownEssentialExpensesInHorizon = knownFuture.filter((tx) => tx.type === 'expense' && tx.necessity === 'essential' && tx.transaction_date <= horizonEndKey).reduce((sum, tx) => sum + BigInt(tx.amount_paise), 0n);
  const knownOtherExpensesInHorizon = knownFuture.filter((tx) => tx.type === 'expense' && tx.necessity !== 'essential' && tx.transaction_date <= horizonEndKey).reduce((sum, tx) => sum + BigInt(tx.amount_paise), 0n);
  let manualEssentialPaise = 0n;
  let manualEssentialInvalid = false;
  try { manualEssentialPaise = amount(assumptions.manualEssential); } catch { manualEssentialInvalid = true; }
  const horizonDays = useMemo(() => {
    if (horizon === '7' || horizon === '30') return Number(horizon);
    if (horizon === 'custom') return Math.max(1, Math.ceil((new Date(`${horizonEndKey}T00:00:00Z`).getTime() - new Date(`${todayKey}T00:00:00Z`).getTime()) / 86_400_000) + 1);
    const now = new Date();
    const day = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(now));
    const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', month: 'numeric' }).format(now));
    const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(now));
    return Math.max(1, new Date(Date.UTC(year, month, 0)).getUTCDate() - day + 1);
  }, [horizon, horizonEndKey, todayKey]);

  const forecastEssentialForHorizon = weekly.source === 'unavailable'
    ? [manualEssentialPaise, knownEssentialExpensesInHorizon].reduce((a, b) => a > b ? a : b)
    : [BigInt(Math.ceil(weekly.weeklyPaise * Math.max(0, horizonDays - 1) / 7)), knownEssentialExpensesInHorizon].reduce((a, b) => a > b ? a : b);

  let safe = null;
  let invalidAssumptions = false;
  try {
    const hasReliableForecast = balanceHistoryComplete && (weekly.source !== 'unavailable' || manualEssentialPaise > 0n || knownEssentialExpensesInHorizon > 0n);
    if (hasReliableForecast) safe = calculateSafeToSpend({ availablePaise: currentLiquidPaise, confirmedIncomePaise: knownIncomeInHorizon + amount(assumptions.income), commitmentsPaise: knownOtherExpensesInHorizon + amount(assumptions.commitments), forecastEssentialPaise: forecastEssentialForHorizon, plannedSavingsPaise: amount(assumptions.savings), reservePaise: amount(assumptions.reserve), days: horizonDays });
  } catch { invalidAssumptions = true; }
  invalidAssumptions ||= manualEssentialInvalid;

  let emi = null;
  let rateStress: { rate: number; emiPaise: bigint; samePaymentMonths: number | null } | null = null;
  let scenarios: ReturnType<typeof evaluateStress> = [];
  let emiError = '';
  try {
    if (loanAmount.trim() && annualRate.trim() && tenure.trim()) {
    const monthlyIncome = amount(assumptions.monthlyIncome);
    const currentEmi = amount(assumptions.existingEmi);
    const feePaise = amount(fees);
    const calc = calculateEmi(amount(loanAmount) + feePaise, Math.round(Number(annualRate) * 100), Number(tenure));
    emi = calc;
    if (floating && Number(assumptions.interestIncrease) > 0) {
      const stressedRate = Number(annualRate) + Number(assumptions.interestIncrease);
      const stressedBps = Math.round(stressedRate * 100);
      const principal = amount(loanAmount) + feePaise;
      const stressed = calculateEmi(principal, stressedBps, Number(tenure));
      let samePaymentMonths: number | null = null;
      if (calculateEmi(principal, stressedBps, 600).emiPaise <= calc.emiPaise) {
        let low = Number(tenure); let high = 600;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          if (calculateEmi(principal, stressedBps, middle).emiPaise <= calc.emiPaise) { samePaymentMonths = middle; high = middle - 1; }
          else low = middle + 1;
        }
      }
      rateStress = { rate: stressedRate, emiPaise: stressed.emiPaise, samePaymentMonths };
    }
    const recordedEmiOverlap = amount(assumptions.essentialEmiOverlap);
    const otherEssentialPaise = monthlyEssential > recordedEmiOverlap ? monthlyEssential - recordedEmiOverlap : 0n;
    scenarios = evaluateStress({ monthlyIncomePaise: monthlyIncome, essentialPaise: otherEssentialPaise + amount(assumptions.monthlyFixed), existingEmiPaise: currentEmi, proposedEmiPaise: calc.emiPaise, reservePaise: amount(assumptions.liquidBalance) + amount(assumptions.emergencyFund), incomeReductionPercent: Number(assumptions.incomeReduction), expenseIncreasePercent: Number(assumptions.expenseIncrease), unexpectedExpensePaise: amount(assumptions.unexpected), delayDays: Number(assumptions.delay) });
    }
  } catch (err) { emiError = err instanceof Error ? err.message : 'Enter valid loan assumptions.'; }
  let ratio: number | null = null;
  try {
    const netIncome = amount(assumptions.monthlyIncome);
    if (emi && netIncome > 0n) ratio = Number((amount(assumptions.existingEmi) + emi.emiPaise) * 10000n / netIncome) / 100;
  } catch { emiError = 'Enter valid non-negative INR assumptions with up to two decimal places.'; }

  const card = 'rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-5';
  const set = (key: keyof Assumptions) => (value: string) => saveAssumption(key, value);

  return <main className="mx-auto w-full max-w-6xl space-y-5 pb-24 text-[var(--text-primary)]">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><button type="button" onClick={onBack} className="mb-2 min-h-11 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">← Dashboard</button><h1 className="text-2xl font-semibold tracking-tight">Financial planning</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Transparent estimates from your recorded Arth history.</p></div><button onClick={() => void load()} className="min-h-11 rounded-[3px] border border-[var(--border-subtle)] px-3 text-sm hover:bg-[var(--bg-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Refresh data</button></header>
    <nav className="flex gap-2 border-b border-[var(--border-hairline)]" aria-label="Financial planning tools"><button onClick={() => setMode('safe')} className={`min-h-11 border-b-2 px-4 text-sm ${mode === 'safe' ? 'border-[var(--action-primary-bg)] font-semibold' : 'border-transparent text-[var(--text-secondary)]'}`}>Safe to Spend</button><button onClick={() => setMode('emi')} className={`min-h-11 border-b-2 px-4 text-sm ${mode === 'emi' ? 'border-[var(--action-primary-bg)] font-semibold' : 'border-transparent text-[var(--text-secondary)]'}`}>EMI stress test</button></nav>
    {error && <div role="alert" className={`${card} border-rose-300 text-sm`}>{error} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div>}
    {loading && <div className={card}>Loading your financial history…</div>}
    {!loading && mode === 'safe' && <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <div className={`${card} space-y-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Suggested discretionary capacity</p><div className="mt-2 font-mono text-3xl font-semibold">{balances?.balances_configured && safe ? formatPaiseToINR(safe.discretionaryPaise) : '—'}</div><p className="mt-1 text-xs text-[var(--text-secondary)]">Through the selected horizon · {safe ? `${formatPaiseToINR(safe.dailyPacePaise)} per day` : ''} suggested pace, not a spending limit</p></div><select value={horizon} onChange={(e) => setHorizon(e.target.value as typeof horizon)} className="h-11 rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-sm"><option value="month">Rest of this month</option><option value="7">Next 7 days</option><option value="30">Next 30 days</option><option value="custom">Custom date</option></select>{horizon === 'custom' && <input aria-label="Horizon end date" type="date" min={todayKey} value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} className="h-11 rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-sm"/>}</div>
        {balances?.balances_configured && !balanceHistoryComplete && <div className="border-l-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">Arth could not load all future-dated ledger and balance records, so it is withholding the estimate to avoid omitting a known commitment.</div>}{balances?.balances_configured && balanceHistoryComplete && !safe && <div className="border-l-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">Arth has too little recorded essential spending to estimate this horizon. Enter an essential spending estimate in the assumptions before using this figure.</div>}{!balances?.balances_configured && <div className="border-l-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">Starting cash and online balances are not configured. Arth cannot establish your liquid funds, so it will not calculate a Safe to Spend amount.</div>}
        {balances?.balances_configured && safe && <div className="grid gap-2 sm:grid-cols-2">{[['Available liquid funds (as of today)', currentLiquidPaise], ['Confirmed income in horizon', knownIncomeInHorizon + amount(assumptions.income)], ['Recorded future non-essential expenses', knownOtherExpensesInHorizon], ['Additional commitments entered', amount(assumptions.commitments)], ['Forecast essential spend (includes scheduled essentials)', forecastEssentialForHorizon], ['Planned savings', amount(assumptions.savings)], ['Minimum reserve', amount(assumptions.reserve)]].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-3 border-t border-[var(--border-hairline)] py-2 text-xs"><span className="text-[var(--text-secondary)]">{label}</span><span className="font-mono font-medium">{formatPaiseToINR(BigInt(value))}</span></div>)}</div>}
        {safe && safe.shortfallPaise > 0n && <p className="rounded-[3px] bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">Projected shortfall after the listed assumptions: {formatPaiseToINR(safe.shortfallPaise)}.</p>}
        {invalidAssumptions && <p className="text-sm text-rose-600">Enter non-negative INR amounts with up to two decimal places.</p>}
        <details className="border-t border-[var(--border-hairline)] pt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">How was this calculated?</summary><p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">Recorded liquid cash and online funds adjusted to remove future-dated ledger items + recorded income dated within this horizon and additional income you explicitly entered as confirmed − recorded future expenses dated within this horizon − additional commitments − forecast essential spending − planned savings − minimum reserve. Recorded future transactions are counted once. The model only estimates future essential expenses; it never supplies account balances or guaranteed income. Recorded transactions may not represent every bill or cash movement.</p></details>
      </div>
      <div className={`${card} space-y-4`}><div><h2 className="text-sm font-semibold">Assumptions for this period</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Saved privately in this browser for your signed-in account.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><Field label="Confirmed income before horizon (₹)" value={assumptions.income} onChange={set('income')} hint="Enter only income you know is due."/>{weekly.source === 'unavailable' && <Field label="Essential spending estimate for this period (₹)" value={assumptions.manualEssential} onChange={set('manualEssential')} hint="Needed because Arth has no recorded essential spending to forecast."/>}<Field label="Commitments due in horizon (₹)" value={assumptions.commitments} onChange={set('commitments')} hint="Enter only bills not already recorded with a future date."/><Field label="Planned savings in horizon (₹)" value={assumptions.savings} onChange={set('savings')}/><Field label="Minimum liquid reserve (₹)" value={assumptions.reserve} onChange={set('reserve')}/></div></div>
      <div className={`${card} space-y-2 lg:col-span-2`}><h2 className="text-sm font-semibold">Essential spending forecast</h2><p className="text-sm text-[var(--text-secondary)]">{loading ? 'Preparing forecast…' : weekly.explanation}</p><p className="font-mono text-lg">{weekly.weeklyPaise > 0 ? `${formatPaiseToINR(BigInt(weekly.weeklyPaise))} / week` : 'Not enough recorded data'}</p><p className="text-xs text-[var(--text-muted)]">{weekly.source === 'personalized-ml' ? `Personalized model · ${weekly.historyWeeks} weekly periods · chronological MAE ${formatPaiseToINR(BigInt(weekly.evaluation.modelMaePaise ?? 0))}` : `Historical baseline · ${weekly.historyWeeks} weekly periods · data completeness cannot be verified from manual entries`}</p><p className="text-[11px] text-[var(--text-muted)]">{weekly.modelVersion} · 4-week forecast · data cutoff {weekly.dataCutoffDate ?? 'not available'} · fit {new Date(weekly.trainingDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</p></div>
    </section>}
    {!loading && mode === 'emi' && <section className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><div className={`${card} space-y-4`}><div><h2 className="text-base font-semibold">Proposed loan</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">Reducing-balance EMI. This is a simulation; no loan or transaction is saved.</p></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Loan principal (₹)" value={loanAmount} onChange={setLoanAmount}/><Field label="Annual interest rate (%)" value={annualRate} onChange={setAnnualRate}/><Field label="Tenure (months)" value={tenure} onChange={setTenure}/><Field label="Fees added to principal (₹)" value={fees} onChange={setFees}/></div><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={floating} onChange={(e) => setFloating(e.target.checked)}/>Floating-rate loan</label>{emiError && <p className="text-sm text-rose-600">{emiError}</p>}</div>
        <div className={`${card} space-y-4`}><h2 className="text-base font-semibold">Repayment estimate</h2>{emi && <><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Monthly EMI', emi.emiPaise], ['Principal + fees', amount(loanAmount) + amount(fees)], ['Total interest', emi.interestPaise], ['Total repayment', emi.totalRepaymentPaise]].map(([label, value]) => <div key={String(label)} className="border-t border-[var(--border-hairline)] pt-2"><p className="text-[11px] text-[var(--text-muted)]">{label}</p><p className="mt-1 font-mono text-sm font-semibold">{formatPaiseToINR(BigInt(value))}</p></div>)}</div><p className="text-xs text-[var(--text-secondary)]">Total monthly EMI after proposal: {formatPaiseToINR(amount(assumptions.existingEmi) + emi.emiPaise)} · EMI to entered net income: {ratio === null ? 'unavailable (enter monthly income)' : `${ratio.toFixed(2)}%`} (indicator only, not a lending rule)</p>{rateStress && <p className="rounded-[3px] border border-[var(--border-hairline)] p-3 text-xs text-[var(--text-secondary)]">Floating-rate scenario at {rateStress.rate.toFixed(2)}%: EMI rises to {formatPaiseToINR(rateStress.emiPaise)} with the same {tenure}-month term. Keeping your current EMI would extend the term to {rateStress.samePaymentMonths === null ? 'more than 600 months' : `${rateStress.samePaymentMonths} months`}.</p>}<details><summary className="min-h-11 cursor-pointer py-2 text-sm">Amortization schedule</summary><div className="max-h-72 overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-[var(--bg-surface)]"><tr><th className="py-2 text-left">Month</th><th className="text-right">Principal</th><th className="text-right">Interest</th><th className="text-right">Balance</th></tr></thead><tbody>{emi.schedule.map((row) => <tr key={row.month} className="border-t border-[var(--border-hairline)]"><td className="py-2">{row.month}</td><td className="text-right font-mono">{formatPaiseToINR(row.principalPaise)}</td><td className="text-right font-mono">{formatPaiseToINR(row.interestPaise)}</td><td className="text-right font-mono">{formatPaiseToINR(row.balancePaise)}</td></tr>)}</tbody></table></div></details></>}</div></div>
      <div className={`${card} space-y-4`}><div><h2 className="text-base font-semibold">Your monthly position and stress scenarios</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">Income and essential-expense prefill are based on recorded history only; income is not guaranteed. If recorded essential expenses include existing EMIs, use the overlap field to avoid counting them twice.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Monthly net income (₹)" value={assumptions.monthlyIncome} onChange={set('monthlyIncome')}/><Field label="Other fixed essential commitments / month (₹)" value={assumptions.monthlyFixed} onChange={set('monthlyFixed')}/><Field label="Existing EMIs / month (₹)" value={assumptions.existingEmi} onChange={set('existingEmi')} hint="Enter EMIs not already included in recorded essential expenses."/><Field label="EMIs included in recent essential spending (₹ / month)" value={assumptions.essentialEmiOverlap} onChange={set('essentialEmiOverlap')} hint="Subtracts this from the historical essential estimate before adding the EMI above."/><Field label="Recorded liquid balance (₹)" value={assumptions.liquidBalance} onChange={set('liquidBalance')} hint="Prefilled from current Arth balances when configured."/><Field label="Emergency fund available in stress scenarios (₹)" value={assumptions.emergencyFund} onChange={set('emergencyFund')} hint="Optional scenario-only amount; not included in Safe to Spend."/><Field label="Income reduction (%)" value={assumptions.incomeReduction} onChange={set('incomeReduction')}/><Field label="Essential expense increase (%)" value={assumptions.expenseIncrease} onChange={set('expenseIncrease')}/><Field label="Unexpected one-time cost (₹)" value={assumptions.unexpected} onChange={set('unexpected')}/><Field label="Income delay (days)" value={assumptions.delay} onChange={set('delay')}/>{floating && <Field label="Rate increase (percentage points)" value={assumptions.interestIncrease} onChange={set('interestIncrease')} hint="Shows EMI at the same tenure and the longer term needed to keep today's EMI."/>}</div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-xs"><thead><tr className="border-b border-[var(--border-hairline)] text-[var(--text-muted)]"><th className="py-2 text-left">Scenario</th><th className="text-right">Monthly income</th><th className="text-right">Essentials</th><th className="text-right">Total EMIs</th><th className="text-right">Surplus / (deficit)</th><th className="text-right">Reserve</th><th className="text-right">Assessment</th></tr></thead><tbody>{scenarios.map((scenario) => <tr key={scenario.label} className="border-b border-[var(--border-hairline)]"><td className="py-3 font-medium">{scenario.label}</td><td className="text-right font-mono">{formatPaiseToINR(scenario.incomePaise)}</td><td className="text-right font-mono">{formatPaiseToINR(scenario.essentialPaise)}</td><td className="text-right font-mono">{formatPaiseToINR(scenario.totalEmiPaise)}</td><td className={`text-right font-mono ${scenario.surplusPaise < 0n ? 'text-rose-600' : ''}`}>{formatPaiseToINR(scenario.surplusPaise)}</td><td className="text-right font-mono">{formatPaiseToINR(scenario.reserveAfterShockPaise)}</td><td className="text-right">{scenario.classification}</td></tr>)}</tbody></table></div><p className="text-xs text-[var(--text-secondary)]">The income-delay input displays estimated coverage only through the delay-adjusted available reserve in the engine; changing delay is a hypothetical and does not alter the ledger. Emergency funds are included only in EMI stress scenarios when entered. They are never included in Safe to Spend.</p></div>
      {emi && <div className={`${card} space-y-2`}><h2 className="text-sm font-semibold">Stress assumptions</h2><p className="text-sm text-[var(--text-secondary)]">Baseline uses entered monthly income and observed essential spending. Moderate stress applies at least {Math.max(10, Number(assumptions.incomeReduction) || 0)}% lower income and {Math.max(10, Number(assumptions.expenseIncrease) || 0)}% higher essentials. Severe stress applies at least 20% to each. The one-time cost reduces scenario reserve once; it is not treated as recurring.</p>{scenarios.map((scenario) => <p key={`${scenario.label}-text`} className="text-xs text-[var(--text-secondary)]">{scenario.label}: {scenario.surplusPaise < 0n ? `monthly cash flow shortfall ${formatPaiseToINR(-scenario.surplusPaise)}${scenario.reserveRunwayMonths !== null ? `; entered reserve covers about ${scenario.reserveRunwayMonths} months` : ''}.` : `monthly surplus ${formatPaiseToINR(scenario.surplusPaise)}.`}</p>)}<p className="text-xs text-[var(--text-secondary)]">A {assumptions.delay}-day income delay would require approximately {formatPaiseToINR(amount(assumptions.monthlyIncome) * BigInt(Math.max(0, Number(assumptions.delay) || 0)) / 30n)} from current liquid balances at the entered monthly income. Current liquid balance plus scenario emergency fund after that estimate: {formatPaiseToINR(amount(assumptions.liquidBalance) + amount(assumptions.emergencyFund) - amount(assumptions.monthlyIncome) * BigInt(Math.max(0, Number(assumptions.delay) || 0)) / 30n)}.</p></div>}
    </section>}
  </main>;
}
