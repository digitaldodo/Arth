'use client';

import { useMemo, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { parseINRToPaise, type CategoryDTO, type TransactionType } from '@arth/contracts';
import { fetchCategories } from '@/lib/api-client';
import { getTodayIST } from '@/lib/format';
import { syncEngine } from '@/features/sync/sync-engine';
import { getCachedTransactions } from '@/lib/offline-db';
import { merchantFingerprint, recordCategoryCorrection, suggestCategory } from '@/features/categorization';
import { parseFinancialMessage } from '@/features/categorization/message-parser';
import { assessPossibleDuplicate } from '@/features/categorization/duplicates';

type Props = { userId: string; onImported: (count: number) => void; onManualEntry: () => void };
type Account = { id: string; name: string; account_type: string };

export function FinancialMessageCapture({ userId, onImported, onManualEntry }: Props) {
  const [raw, setRaw] = useState('');
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [classificationNarration, setClassificationNarration] = useState('');
  const [date, setDate] = useState(getTodayIST());
  const [accountId, setAccountId] = useState('');
  const [necessity, setNecessity] = useState<'essential' | 'optional' | 'luxury'>('essential');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseFinancialMessage(raw, getTodayIST()), [raw]);
  const narrationForClassification = `${classificationNarration} ${description}`.trim();
  const suggestion = useMemo(() => suggestCategory(narrationForClassification, categories, type), [narrationForClassification, categories, type]);

  async function prepareReview() {
    setError('');
    try {
      const [categoryResponse, accountResponse] = await Promise.all([
        fetchCategories({}), fetch('/api/backend/financial/accounts', { cache: 'no-store' }),
      ]);
      const nextCategories = categoryResponse.categories || [];
      setCategories(nextCategories);
      let availableAccounts: Account[] = [];
      if (accountResponse.ok) {
        const data = await accountResponse.json() as { accounts?: Account[] };
        availableAccounts = data.accounts || [];
      }
      setAccounts(availableAccounts);
      if ((parsed.status === 'ready' || parsed.status === 'uncertain') && parsed.amount && parsed.amountPaise !== null) {
        setType(parsed.type || 'expense');
        setAmount(parsed.amount);
        setDescription(parsed.merchant || '');
        setClassificationNarration(parsed.normalizedNarration);
        setDate(parsed.date || getTodayIST());
        const matched = suggestCategory(parsed.normalizedNarration, nextCategories, parsed.type || 'expense');
        setCategoryId(matched?.category.id || '');
        if (availableAccounts.length === 1) setAccountId(availableAccounts[0].id);
        setStatus(parsed.status === 'ready' ? 'Transaction detected. Review each field before adding it to the ledger.' : 'Possible transaction found. Verify its direction and details before saving.');
      } else {
        setStatus(parsed.status === 'failed' ? 'Failed payment: nothing will be added.'
          : parsed.status === 'pending' ? 'Payment is pending: nothing will be added.'
            : parsed.status === 'reversal' ? 'Refund or reversal candidate: review it manually before recording.'
              : parsed.status === 'not_transaction' ? 'No transaction detected in the selected message.'
                : 'Payment status or amount is uncertain. Nothing will be added automatically.');
      }
    } catch { setError('Could not load categories for review. Try again while online.'); }
  }

  async function confirm() {
    setError('');
    const selectedCategory = categories.find((item) => item.id === categoryId && item.type === type);
    if (!selectedCategory) { setError('Choose a category before confirming.'); return; }
    if (!amount || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Check the amount and transaction date.'); return; }
    setSaving(true);
    try {
      const cached = await getCachedTransactions(userId).catch(() => []);
      const duplicate = assessPossibleDuplicate({ date, amountPaise: Number(parseINRToPaise(amount)), type, description, accountId: accountId || null, reference: parsed.reference }, cached);
      if (duplicate.possibleDuplicate && !window.confirm(`Possible duplicate (${duplicate.confidence} evidence: ${duplicate.evidence.join(', ')}). Add it anyway?`)) return;
      if (suggestion && suggestion.category.id !== selectedCategory.id) {
        await recordCategoryCorrection(userId, merchantFingerprint(description || classificationNarration), selectedCategory.id);
      }
      await syncEngine.createTransactionLocalFirst({
        id: uuidv7(), amount, type, category_id: selectedCategory.id, transaction_date: date,
        payment_method: 'online', necessity: type === 'expense' ? necessity : null,
        description: description.trim() || null,
        notes: parsed.reference ? `Message reference ${parsed.reference}` : null,
        ...(accountId ? { account_id: accountId } : {}),
        ...(parsed.reference ? { statement_reference: parsed.reference } : {}),
        ingestion_source: 'message', parser_version: 'selected-message-parser-v1',
        categorization_model_version: suggestion?.method === 'weak_supervision' ? 'weak-label-rules-v1' : null,
        categorization_method: suggestion
          ? suggestion.category.id === selectedCategory.id ? suggestion.method : 'user_correction'
          : 'manual',
        category_suggestion_confidence: suggestion?.confidence ?? null,
        category_evidence: suggestion ? [...suggestion.evidence] : [],
        category_was_corrected: Boolean(suggestion && suggestion.category.id !== selectedCategory.id),
        category_verified: true,
      }, categories, userId);
      await syncEngine.processQueue(userId);
      onImported(1);
      setRaw(''); setAmount(''); setDescription(''); setClassificationNarration(''); setCategoryId(''); setStatus('Message transaction was added to your ledger.');
    } catch { setError('Could not save the transaction. It remains available for retry after checking your ledger.'); }
    finally { setSaving(false); }
  }

  return <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4">
    <header><p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Selected message capture</p><h2 className="mt-1 text-xl font-semibold">Paste a bank or UPI message</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">Only the text you paste is parsed here. The raw message is not saved or sent to an AI provider. Shared Android messages use the same local review flow in the app.</p></header>
    <label className="block text-sm font-medium">Financial message<textarea value={raw} onChange={(event) => { setRaw(event.target.value.slice(0, 10_000)); setStatus(''); }} maxLength={10_000} rows={4} placeholder="Paste one bank or UPI notification" className="mt-2 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-sm" /></label>
    <div className="flex flex-wrap gap-2"><button type="button" disabled={!raw.trim()} onClick={() => void prepareReview()} className="min-h-11 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-canvas)] disabled:opacity-50">Parse and review</button><button type="button" onClick={onManualEntry} className="min-h-11 rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm">Enter manually</button></div>
    {status && <p role="status" className="rounded-lg border border-[var(--border-subtle)] p-3 text-sm">{status}</p>}
    {error && <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700">{error}</p>}
    {(parsed.status === 'ready' || parsed.status === 'uncertain') && parsed.amountPaise !== null && categories.length > 0 && (status.includes('Review each field') || status.includes('Verify its direction')) && <div className="grid gap-3 rounded-lg border border-[var(--border-subtle)] p-3 sm:grid-cols-2">
      <label className="text-xs">Amount (INR)<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded border bg-[var(--bg-canvas)] p-2 text-sm" /></label>
      <label className="text-xs">Transaction date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded border bg-[var(--bg-canvas)] p-2 text-sm" /></label>
      <label className="text-xs">Income or expense<select value={type} onChange={(event) => { setType(event.target.value as TransactionType); setCategoryId(''); }} className="mt-1 w-full rounded border bg-[var(--bg-canvas)] p-2 text-sm"><option value="expense">Expense</option><option value="income">Income</option></select></label>
      <label className="text-xs">Merchant or description<input value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded border bg-[var(--bg-canvas)] p-2 text-sm" /></label>
      <label className="text-xs">Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 w-full rounded border bg-[var(--bg-canvas)] p-2 text-sm"><option value="">Choose category</option>{categories.filter((item) => item.type === type && !item.archived_at).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>{suggestion && <span className="mt-1 block text-[10px]">Suggested {suggestion.category.name} · {Math.round(suggestion.confidence * 100)}% rule agreement · confirm or change</span>}</label>
      <label className="text-xs">Linked account<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 w-full rounded border bg-[var(--bg-canvas)] p-2 text-sm"><option value="">No account selected</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name} · {account.account_type}</option>)}</select></label>
      {type === 'expense' && <label className="text-xs">Necessity<select value={necessity} onChange={(event) => setNecessity(event.target.value as typeof necessity)} className="mt-1 w-full rounded border bg-[var(--bg-canvas)] p-2 text-sm"><option value="essential">Must-have</option><option value="optional">Optional</option><option value="luxury">Luxury</option></select></label>}
      {parsed.reference && <p className="sm:col-span-2 text-xs text-[var(--text-muted)]">Reference: {parsed.reference}</p>}
      <button type="button" disabled={saving || !categoryId} onClick={() => void confirm()} className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{saving ? 'Saving…' : 'Confirm and add to ledger'}</button>
    </div>}
  </section>;
}
