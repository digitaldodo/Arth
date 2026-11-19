'use client';

import { useMemo, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { formatPaiseToINR } from '@arth/contracts';
import { fetchTransactions } from '@/lib/api-client';
import { findReconciliationCandidates, type ReconciliationAccount, type ReconciliationTransaction } from './reconciliation';

type Link = { id: string; source_transaction_id: string; target_transaction_id: string; relationship: 'transfer_pair' | 'card_settlement'; status: 'confirmed' | 'rejected' | 'suggested'; explanation: string };
type Props = { accounts: ReconciliationAccount[]; onReconciled: () => void };

export function CrossAccountReconciliation({ accounts, onReconciled }: Props) {
  const [rows, setRows] = useState<ReconciliationTransaction[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');
  const handledIds = useMemo(() => new Set(links.flatMap((link) => [link.source_transaction_id, link.target_transaction_id])), [links]);
  const candidates = useMemo(() => findReconciliationCandidates(rows, accounts, handledIds), [rows, accounts, handledIds]);
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  async function refresh() {
    setLoading(true); setError(''); setWarning('');
    try {
      const transactions: ReconciliationTransaction[] = [];
      let more = false;
      for (let page = 1; page <= 100; page++) {
        const response = await fetchTransactions({ page, page_size: 100, sort_by: 'date_desc' });
        transactions.push(...response.items.filter((item) => item.account_id).map((item) => ({
          id: item.id, transaction_date: item.transaction_date, amount_paise: item.amount_paise,
          type: item.type, description: item.description, account_id: item.account_id || null,
          statement_reference: item.statement_reference || null,
        })));
        more = response.has_more;
        if (!more) break;
      }
      const linkResponse = await fetch('/api/backend/financial/transaction-links', { cache: 'no-store' });
      const linkData = await linkResponse.json() as { links?: Link[]; truncated?: boolean; error?: string };
      if (!linkResponse.ok) throw new Error(linkData.error || 'Could not load saved transfer matches.');
      setRows(transactions); setLinks(linkData.links || []); setLoaded(true);
      if (more) setWarning('Only the latest 10,000 account transactions were checked. Older activity may contain additional matches.');
      if (linkData.truncated) setWarning((current) => [current, 'Only the latest 10,000 reconciliation links were loaded.'].filter(Boolean).join(' '));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not check account transactions.'); }
    finally { setLoading(false); }
  }

  async function confirm(candidate: (typeof candidates)[number]) {
    setSavingId(candidate.source.id); setError('');
    try {
      const response = await fetch('/api/backend/financial/transaction-links', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: uuidv7(), movement_id: uuidv7(), source_transaction_id: candidate.source.id,
          target_transaction_id: candidate.target.id, relationship: candidate.relationship }),
      });
      const data = await response.json() as { link?: Link; error?: string };
      if (!response.ok || !data.link) throw new Error(data.error || 'Could not confirm this match. Refresh and review both entries.');
      setLinks((current) => [data.link!, ...current.filter((link) => link.id !== data.link!.id)]);
      onReconciled();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not confirm this match.'); }
    finally { setSavingId(''); }
  }

  async function undo(link: Link) {
    setSavingId(link.id); setError('');
    try {
      const response = await fetch(`/api/backend/financial/transaction-links/${link.id}/reject`, { method: 'POST' });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not remove the confirmed match.');
      setLinks((current) => current.map((item) => item.id === link.id ? { ...item, status: 'rejected' } : item));
      onReconciled();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove the confirmed match.'); }
    finally { setSavingId(''); }
  }

  const accountName = (id: string | null) => accounts.find((account) => account.id === id)?.name || 'Account unavailable';
  const entry = (transactionId: string) => {
    const row = rowById.get(transactionId);
    const description = (row?.description || '').replace(/[A-Z]{5}\d{4}[A-Z]/gi, '[PAN]').replace(/\b\d{10,18}\b/g, '[account/reference]').slice(0, 140);
    return row ? `${row.transaction_date} · ${accountName(row.account_id)} · ${description || (row.type === 'income' ? 'Credit' : 'Debit')}` : 'Transaction unavailable';
  };
  const inputClass = 'mt-1 text-xs text-[var(--text-secondary)]';

  return <section className="space-y-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Cross-account reconciliation</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">Find likely transfer and card-payment pairs across your accounts. Suggestions never change your ledger until you confirm both entries.</p></div><button type="button" onClick={() => void refresh()} disabled={loading || !accounts.length} className="rounded-md border px-3 py-2 text-xs disabled:opacity-50">{loading ? 'Checking…' : loaded ? 'Refresh matches' : 'Find matches'}</button></div>
    {!accounts.length && <p className="text-xs text-[var(--text-muted)]">Add at least two accounts and associate transactions with them to reconcile transfers.</p>}
    {warning && <p className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>}{error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>}
    {loaded && <>
      {candidates.length === 0 && <p className="text-xs text-[var(--text-muted)]">No likely unmatched pairs found. Similar amounts alone are never enough to suggest a match.</p>}
      {candidates.slice(0, 30).map((candidate) => <article key={`${candidate.source.id}:${candidate.target.id}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-3 text-xs">
        <div><p className="font-medium">{candidate.relationship === 'card_settlement' ? 'Possible card settlement' : 'Possible internal transfer'} · {formatPaiseToINR(candidate.source.amount_paise)}</p><p className={inputClass}>{entry(candidate.source.id)}</p><p className={inputClass}>{entry(candidate.target.id)}</p><p className="mt-1 text-[var(--text-muted)]">{candidate.reason}</p></div>
        <button type="button" disabled={savingId !== ''} onClick={() => void confirm(candidate)} className="rounded-md border px-3 py-2 disabled:opacity-50">{savingId === candidate.source.id ? 'Saving…' : 'Confirm match'}</button>
      </article>)}
      {links.filter((link) => link.status === 'confirmed').map((link) => <article key={link.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-3 text-xs"><div><p className="font-medium">Confirmed {link.relationship === 'card_settlement' ? 'card settlement' : 'transfer'}</p><p className={inputClass}>{entry(link.source_transaction_id)}</p><p className={inputClass}>{entry(link.target_transaction_id)}</p><p className="mt-1 text-[var(--text-muted)]">This pair is excluded from income and spending summaries.</p></div><button type="button" disabled={savingId !== ''} onClick={() => void undo(link)} className="rounded-md border px-3 py-2 disabled:opacity-50">{savingId === link.id ? 'Removing…' : 'Remove match'}</button></article>)}
    </>}
  </section>;
}
