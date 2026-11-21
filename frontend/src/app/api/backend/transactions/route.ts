import { NextResponse, type NextRequest } from 'next/server';
import {
  getBackendBaseUrl,
  safeBackendErrorResponse,
  getAuthenticatedSession,
} from '@/lib/server-config';
import { drainUserOutbox } from '@/lib/server/sheets-worker';
import { createClient } from '@/lib/supabase/server';
import { paiseToDecimal, formatPaiseToINR, type TransactionDTO } from '@arth/contracts';

/**
 * BFF proxy POST /api/backend/transactions -> Fastify POST /api/v1/transactions
 */
export async function POST(req: NextRequest) {
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

    const backendBaseUrl = getBackendBaseUrl();
    const body = await req.json();

    let backendRes: Response | null = null;
    let data: unknown = null;

    try {
      backendRes = await fetch(`${backendBaseUrl}/api/v1/transactions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      data = await backendRes.json().catch(() => null);
    } catch {
      // Backend service unreachable, proceed to Supabase fallback
    }

    if (backendRes && backendRes.ok) {
      if (userId) {
        drainUserOutbox(userId).catch((syncErr) => {
          console.warn('[TransactionsRoute] Asynchronous outbox drain non-fatal error:', syncErr);
        });
      }
      return NextResponse.json(data, { status: backendRes.status });
    }

    // Client-side 4xx errors from backend should be returned directly
    if (backendRes && backendRes.status < 500) {
      return NextResponse.json(data, { status: backendRes.status });
    }

    // Direct Supabase Fallback when backend is unreachable or returns 5xx
    try {
      const supabase = await createClient();

      // 1. Idempotency: Does a transaction with this ID already exist?
      const { data: existing } = await supabase
        .from('transactions')
        .select('id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, categories(name)')
        .eq('id', body.id)
        .maybeSingle();

      if (existing) {
        const paise = Number(existing.amount_paise);
        const catObj = existing.categories as { name?: string } | Array<{ name?: string }> | null;
        const catName = Array.isArray(catObj) ? catObj[0]?.name : catObj?.name;
        return NextResponse.json({
          transaction: {
            id: existing.id,
            amount_paise: paise,
            amount_decimal: paiseToDecimal(paise),
            formatted_inr: formatPaiseToINR(paise),
            type: existing.type,
            category_id: existing.category_id,
            category_name: catName,
            transaction_date: existing.transaction_date,
            payment_method: existing.payment_method,
            necessity: existing.necessity,
            description: existing.description,
            notes: existing.notes,
          },
          isReplay: true,
        }, { status: 200 });
      }

      // 2. Duplicate detection for statement imports
      if (body.statement_reference && userId) {
        const { data: dupRef } = await supabase
          .from('transactions')
          .select('id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, categories(name)')
          .eq('user_id', userId)
          .eq('statement_reference', body.statement_reference)
          .eq('amount_paise', body.amount_paise)
          .eq('type', body.type)
          .is('deleted_at', null)
          .maybeSingle();

        if (dupRef) {
          const paise = Number(dupRef.amount_paise);
          const catObj = dupRef.categories as { name?: string } | Array<{ name?: string }> | null;
          const catName = Array.isArray(catObj) ? catObj[0]?.name : catObj?.name;
          return NextResponse.json({
            transaction: {
              id: dupRef.id,
              amount_paise: paise,
              amount_decimal: paiseToDecimal(paise),
              formatted_inr: formatPaiseToINR(paise),
              type: dupRef.type,
              category_id: dupRef.category_id,
              category_name: catName,
              transaction_date: dupRef.transaction_date,
              payment_method: dupRef.payment_method,
              necessity: dupRef.necessity,
              description: dupRef.description,
              notes: dupRef.notes,
            },
            isReplay: true,
          }, { status: 200 });
        }
      }

      // 3. Ensure statement_import_batches entry exists if import_batch_id is specified
      if (body.import_batch_id && userId) {
        const { data: batchExists } = await supabase
          .from('statement_import_batches')
          .select('id')
          .eq('id', body.import_batch_id)
          .maybeSingle();

        if (!batchExists) {
          await supabase
            .from('statement_import_batches')
            .insert({
              id: body.import_batch_id,
              user_id: userId,
              source_name: 'Statement Import',
              source_format: 'pdf',
              parser_id: body.parser_version ? body.parser_version.split(':')[0] : 'generic',
              parser_version: '1',
              status: 'processing',
              detected_count: 1,
              imported_count: 0,
              skipped_count: 0,
            });
        }
      }

      // 4. Insert transaction directly into Supabase
      const insertPayload: Record<string, unknown> = {
        id: body.id,
        user_id: userId,
        amount_paise: body.amount_paise,
        type: body.type,
        category_id: body.category_id || null,
        transaction_date: body.transaction_date,
        payment_method: body.payment_method,
        necessity: body.type === 'expense' ? (body.necessity || null) : null,
        description: body.description || null,
        notes: body.notes || null,
        account_id: body.account_id || null,
        import_batch_id: body.import_batch_id || null,
        statement_reference: body.statement_reference || null,
        ingestion_source: body.ingestion_source || 'manual',
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('transactions')
        .insert(insertPayload)
        .select('id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, categories(name)')
        .single();

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }

      if (userId) {
        drainUserOutbox(userId).catch((syncErr) => {
          console.warn('[TransactionsRoute] Asynchronous outbox drain non-fatal error:', syncErr);
        });
      }

      const paise = Number(inserted.amount_paise);
      const catObj = inserted.categories as { name?: string } | Array<{ name?: string }> | null;
      const catName = Array.isArray(catObj) ? catObj[0]?.name : catObj?.name;

      return NextResponse.json({
        transaction: {
          id: inserted.id,
          amount_paise: paise,
          amount_decimal: paiseToDecimal(paise),
          formatted_inr: formatPaiseToINR(paise),
          type: inserted.type,
          category_id: inserted.category_id,
          category_name: catName,
          transaction_date: inserted.transaction_date,
          payment_method: inserted.payment_method,
          necessity: inserted.necessity,
          description: inserted.description,
          notes: inserted.notes,
        },
        isReplay: false,
      }, { status: 201 });
    } catch (fallbackErr) {
      console.error('[TransactionsRoute] Direct Supabase POST fallback error:', fallbackErr);
    }

    if (backendRes) {
      return NextResponse.json(data, { status: backendRes.status });
    }
    return safeBackendErrorResponse(new Error('Backend service unreachable and database fallback failed'), 'POST /api/backend/transactions');
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'POST /api/backend/transactions');
  }
}

/**
 * BFF proxy GET /api/backend/transactions -> Fastify GET /api/v1/transactions
 * With direct database fallback when Fastify backend is unreachable or returns 5xx.
 */
export async function GET(req: NextRequest) {
  try {
    const { accessToken, errorResponse } = await getAuthenticatedSession();
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

    // Safely forward only permitted query parameters
    const searchParams = req.nextUrl.searchParams;
    const permittedParams = new URLSearchParams();
    const allowedKeys = ['page', 'page_size', 'type', 'category_id', 'necessity', 'start_date', 'end_date', 'sort_by'];

    for (const key of allowedKeys) {
      const val = searchParams.get(key);
      if (val) permittedParams.set(key, val);
    }

    const backendBaseUrl = getBackendBaseUrl();
    const queryString = permittedParams.toString();
    const targetUrl = queryString
      ? `${backendBaseUrl}/api/v1/transactions?${queryString}`
      : `${backendBaseUrl}/api/v1/transactions`;

    let backendRes: Response | null = null;
    try {
      backendRes = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (backendRes.ok) {
        const data = await backendRes.json();
        return NextResponse.json(data, { status: backendRes.status });
      }
    } catch (fetchErr) {
      console.warn('[TransactionsRoute] Fastify backend fetch failed, trying direct database fallback:', fetchErr);
    }

    // Authoritative PostgreSQL fallback if backend service is unavailable or returns 5xx
    if (!backendRes || backendRes.status >= 500) {
      try {
        const supabase = await createClient();
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('page_size') || '50', 10)));
        const sortBy = searchParams.get('sort_by') || 'date_desc';

        let qb = supabase
          .from('transactions')
          .select(
            'id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, recorded_at, created_at, updated_at, deleted_at, categories(name)',
            { count: 'exact' }
          )
          .is('deleted_at', null);

        if (sortBy === 'date_asc') {
          qb = qb
            .order('transaction_date', { ascending: true })
            .order('recorded_at', { ascending: true })
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });
        } else if (sortBy === 'amount_desc') {
          qb = qb
            .order('amount_paise', { ascending: false })
            .order('transaction_date', { ascending: false })
            .order('recorded_at', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id', { ascending: false });
        } else if (sortBy === 'amount_asc') {
          qb = qb
            .order('amount_paise', { ascending: true })
            .order('transaction_date', { ascending: false })
            .order('recorded_at', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id', { ascending: false });
        } else {
          qb = qb
            .order('transaction_date', { ascending: false })
            .order('recorded_at', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id', { ascending: false });
        }

        const typeFilter = searchParams.get('type');
        if (typeFilter) qb = qb.eq('type', typeFilter);

        const categoryFilter = searchParams.get('category_id');
        if (categoryFilter) qb = qb.eq('category_id', categoryFilter);

        const necessityFilter = searchParams.get('necessity');
        if (necessityFilter) qb = qb.eq('necessity', necessityFilter);

        const startDate = searchParams.get('start_date');
        if (startDate) qb = qb.gte('transaction_date', startDate);

        const endDate = searchParams.get('end_date');
        if (endDate) qb = qb.lte('transaction_date', endDate);

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const { data: rows, count, error: dbErr } = await qb.range(from, to);

        if (!dbErr && rows) {
          const items: TransactionDTO[] = rows.map((r: Record<string, unknown>) => {
            const paise = Number(r.amount_paise);
            const catObj = r.categories as { name?: string } | Array<{ name?: string }> | null;
            const catName = Array.isArray(catObj)
              ? catObj[0]?.name
              : catObj?.name;
            return {
              id: String(r.id),
              amount_paise: paise,
              amount_decimal: paiseToDecimal(paise),
              formatted_inr: formatPaiseToINR(paise),
              type: r.type as 'income' | 'expense',
              category_id: String(r.category_id),
              category_name: catName || undefined,
              transaction_date: String(r.transaction_date),
              payment_method: r.payment_method as 'online' | 'cash',
              necessity: (r.necessity as 'essential' | 'optional' | 'luxury') || null,
              description: (r.description as string) || null,
              notes: (r.notes as string) || null,
              recorded_at: (r.recorded_at as string) || (r.created_at as string),
              created_at: String(r.created_at),
              updated_at: String(r.updated_at),
            };
          });

          const totalCount = count ?? items.length;
          return NextResponse.json({
            items,
            page,
            page_size: pageSize,
            total_count: totalCount,
            has_more: from + items.length < totalCount,
          });
        }
      } catch (fallbackErr) {
        console.warn('[TransactionsRoute] Fallback direct database query failed:', fallbackErr);
      }
    }

    if (backendRes) {
      const errData = await backendRes.json().catch(() => ({}));
      return NextResponse.json(errData, { status: backendRes.status });
    }

    return safeBackendErrorResponse(new Error('Backend service unavailable'), 'GET /api/backend/transactions');
  } catch (err: unknown) {
    return safeBackendErrorResponse(err, 'GET /api/backend/transactions');
  }
}
