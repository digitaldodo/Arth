import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  if (errorParam) {
    const errorTarget = `arth://auth/callback?error=${encodeURIComponent(errorParam)}&error_description=${encodeURIComponent(errorDescription || '')}`;
    return new Response(renderRedirectHtml(errorTarget, false, errorDescription || errorParam), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (!code) {
    const errorTarget = `arth://auth/callback?error=missing_code&error_description=${encodeURIComponent('No authorization code received')}`;
    return new Response(renderRedirectHtml(errorTarget, false, 'No authorization code received from Google'), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      const errorMsg = error?.message || 'Code exchange failed';
      const errorTarget = `arth://auth/callback?error=exchange_failed&error_description=${encodeURIComponent(errorMsg)}`;
      return new Response(renderRedirectHtml(errorTarget, false, errorMsg), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    const session = data.session;
    const targetUrl = `arth://auth/callback?access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}&user_id=${encodeURIComponent(session.user.id)}&email=${encodeURIComponent(session.user.email || '')}`;

    return new Response(renderRedirectHtml(targetUrl, true, 'Authenticated successfully'), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Authentication service error';
    const errorTarget = `arth://auth/callback?error=unexpected_error&error_description=${encodeURIComponent(errorMsg)}`;
    return new Response(renderRedirectHtml(errorTarget, false, errorMsg), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

function renderRedirectHtml(targetUrl: string, isSuccess: boolean, statusText: string): string {
  const safeTarget = targetUrl.replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${isSuccess ? 'Authentication Successful — Arth' : 'Authentication Notice — Arth'}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=${safeTarget}">
  <style>
    body {
      background-color: #0C0A09;
      color: #F5F5F4;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: #171513;
      border: 1px solid #292524;
      border-radius: 16px;
      padding: 36px 24px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 8px;
      color: ${isSuccess ? '#86EFAC' : '#FCA5A5'};
    }
    p {
      color: #A8A29E;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .btn {
      display: inline-block;
      background: #F5F5F4;
      color: #0C0A09;
      font-weight: 600;
      font-size: 15px;
      padding: 12px 28px;
      border-radius: 8px;
      text-decoration: none;
      transition: background 0.2s;
    }
    .btn:active {
      background: #E7E5E4;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${isSuccess ? 'Sign In Complete' : 'Sign In Notice'}</h1>
    <p>${isSuccess ? 'Returning you to your Arth financial ledger...' : statusText}</p>
    <a class="btn" href="${safeTarget}">Open Arth App</a>
  </div>
  <script>
    try {
      window.location.replace("${safeTarget}");
    } catch (e) {
      window.location.href = "${safeTarget}";
    }
  </script>
</body>
</html>`;
}
