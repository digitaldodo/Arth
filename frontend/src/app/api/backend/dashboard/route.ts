import { NextResponse, type NextRequest } from 'next/server';
import {
  getBackendBaseUrl,
  safeBackendErrorResponse,
  getAuthenticatedSession,
} from '@/lib/server-config';
import { createClient } from '@/lib/supabase/server';
import { formatPaiseToINR } from '@arth/contracts';

/**
 * BFF proxy GET /api/backend/dashboard -> Fastify GET /api/v1/dashboard/summary
 */
export async function GET(req: NextRequest) {
  try {
    const { accessToken, userId, errorResponse } = await getAuthenticatedSession();
    if (errorResponse || !accessToken) {
      return errorResponse || NextResponse.json(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Active session required',
        },
        { status: 401 }
      );
    }

    // Safely forward permitted query parameters
    const searchParams = req.nextUrl.searchParams;
    const permittedParams = new URLSearchParams();
    const allowedKeys = ['start_date', 'end_date'];

    for (const key of allowedKeys) {
      const val = searchParams.get(key);
      if (val) permittedParams.set(key, val);
    }

    const queryString = permittedParams.toString();
    const backendBaseUrl = getBackendBaseUrl();
    const targetUrl = queryString
      ? `${backendBaseUrl}/api/v1/dashboard/summary?${queryString}`
      : `${backendBaseUrl}/api/v1/dashboard/summary`;

    const backendRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const data = await backendRes.json();

    // Resilient reconciliation: if backend returned 0 for necessity spending while expenses exist,
    // query Supabase transactions directly to calculate accurate necessity breakdown.
    if (backendRes.ok && data && Number(data.expenses_paise || 0) > 0) {
      const currentNecessityTotal = Array.isArray(data.spending_by_necessity)
        ? data.spending_by_necessity.reduce(
            (sum: number, item: { amount_paise?: number }) =>
              sum + Number(item.amount_paise || 0),
            0
          )
        : 0;

      if (currentNecessityTotal === 0 && userId) {
        try {
          const supabase = await createClient();
          let txQuery = supabase
            .from('transactions')
            .select('amount_paise, necessity')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .eq('type', 'expense');

          if (permittedParams.has('start_date')) {
            txQuery = txQuery.gte('transaction_date', permittedParams.get('start_date'));
          }
          if (permittedParams.has('end_date')) {
            txQuery = txQuery.lte('transaction_date', permittedParams.get('end_date'));
          }

          const { data: txRows } = await txQuery;

          if (Array.isArray(txRows) && txRows.length > 0) {
            let essentialPaise = 0;
            let optionalPaise = 0;
            let luxuryPaise = 0;

            for (const row of txRows) {
              const amt = Number(row.amount_paise || 0);
              const nec = String(row.necessity || '').toLowerCase().trim();
              if (nec === 'essential') essentialPaise += amt;
              else if (nec === 'optional') optionalPaise += amt;
              else if (nec === 'luxury') luxuryPaise += amt;
            }

            const totalExp = Number(data.expenses_paise);
            data.spending_by_necessity = [
              {
                necessity: 'essential',
                label: 'Essential',
                amount_paise: essentialPaise,
                formatted_inr: formatPaiseToINR(essentialPaise),
                share_percentage:
                  totalExp > 0
                    ? Math.round((essentialPaise / totalExp) * 1000) / 10
                    : 0,
              },
              {
                necessity: 'optional',
                label: 'Optional',
                amount_paise: optionalPaise,
                formatted_inr: formatPaiseToINR(optionalPaise),
                share_percentage:
                  totalExp > 0
                    ? Math.round((optionalPaise / totalExp) * 1000) / 10
                    : 0,
              },
              {
                necessity: 'luxury',
                label: 'Luxury',
                amount_paise: luxuryPaise,
                formatted_inr: formatPaiseToINR(luxuryPaise),
                share_percentage:
                  totalExp > 0
                    ? Math.round((luxuryPaise / totalExp) * 1000) / 10
                    : 0,
              },
            ];
          }
        } catch {
          // Gracefully continue with data from backendRes
        }
      }
    }

    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'GET /api/backend/dashboard');
  }
}
