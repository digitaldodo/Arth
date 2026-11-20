import { parseINRToPaise } from '@arth/contracts';

export type FinancialMessageStatus = 'ready' | 'uncertain' | 'failed' | 'pending' | 'reversal' | 'not_transaction';

export interface ParsedFinancialMessage {
  status: FinancialMessageStatus;
  amount: string | null;
  amountPaise: number | null;
  type: 'income' | 'expense' | null;
  merchant: string | null;
  date: string | null;
  reference: string | null;
  paymentMethod: 'online' | 'cash';
  normalizedNarration: string;
}

/** Parse only the message explicitly selected by the user. Never persists source text. */
export function parseFinancialMessage(raw: string, todayIst: string): ParsedFinancialMessage {
  const text = raw.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 10_000);
  const noResult = (status: FinancialMessageStatus): ParsedFinancialMessage => ({ status, amount: null, amountPaise: null, type: null, merchant: null, date: null, reference: null, paymentMethod: 'online', normalizedNarration: text });
  if (!text) return noResult('not_transaction');
  if (/\b(?:otp|one.time password|verification code|promo code|offer)\b/i.test(text) && !/\b(?:debited|credited|paid|received|successful)\b/i.test(text)) return noResult('not_transaction');
  if (/\b(?:failed|declined|unsuccessful|not completed)\b/i.test(text)) return noResult('failed');
  if (/\b(?:pending|processing|awaiting confirmation|in progress)\b/i.test(text)) return noResult('pending');
  if (/\b(?:reversed|reversal|refund(?:ed)?|credited back)\b/i.test(text)) return noResult('reversal');

  const direction = /\b(?:credited|received|deposited|salary|refund)\b/i.test(text) ? 'income'
    : /\b(?:debited|paid|sent|purchase|spent|payment successful|transaction successful)\b/i.test(text) ? 'expense' : null;
  const amounts = [...text.matchAll(/(?:₹|\bINR\b|\bRs\.?\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi)];
  const selected = amounts.find((match) => {
    const start = Math.max(0, (match.index || 0) - 32);
    const context = text.slice(start, match.index || 0);
    return !/\b(?:available|avl|closing|current|ledger|account)\s*(?:a\/c\s*)?(?:balance|bal)\s*[:=\-]*\s*$/i.test(context);
  }) || amounts[0];
  let amount: string | null = null;
  let amountPaise: number | null = null;
  if (selected?.[1]) {
    amount = selected[1].replaceAll(',', '');
    try { amountPaise = Number(parseINRToPaise(amount)); } catch { amount = null; amountPaise = null; }
  }
  const ref = text.match(/\b(?:UTR|RRN|reference|ref(?:erence)?\s*(?:no|id)?|txn(?:\s*id)?|transaction\s*id)\s*[:#-]?\s*([A-Z0-9-]{6,30})\b/i)?.[1] || null;
  const dateToken = text.match(/\b(?:20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})\b/)?.[0] || null;
  const date = dateToken ? parseMessageDate(dateToken) : todayIst;
  const merchant = text.match(/\b(?:to|at|from|by|towards)\s+([A-Z0-9][A-Z0-9 .&'_-]{1,48}?)(?=\s+(?:on|at|from|via|using|ref|utr|upi|imps|neft|for|avl|available|bal|txn)\b|[.,;|]|$)/i)?.[1]?.trim() ||
    text.match(/\b([\w.-]+@[\w.-]+)\b/)?.[1] || null;
  const status: FinancialMessageStatus = direction && amountPaise !== null ? 'ready' : 'uncertain';
  return {
    status, amount, amountPaise, type: direction, merchant, date, reference: ref,
    paymentMethod: 'online', normalizedNarration: text.replace(/\b(?:UTR|RRN|reference|ref(?:erence)?\s*(?:no|id)?|txn(?:\s*id)?|transaction\s*id)\s*[:#-]?\s*[A-Z0-9-]{6,30}\b/gi, ' ').replace(/\s+/g, ' ').trim(),
  };
}

function parseMessageDate(token: string): string | null {
  const iso = token.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  const parts = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : (() => {
    const match = token.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
    if (!match) return null;
    return [Number(match[3].length === 2 ? `20${match[3]}` : match[3]), Number(match[2]), Number(match[1])];
  })();
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}
