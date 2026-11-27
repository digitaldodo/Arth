import { createClient } from '@/lib/supabase/server';
import { formatAuthError } from '@/lib/auth-config';

export const dynamic = 'force-dynamic';

function parseIncomingCookies(request: Request): { name: string; value: string }[] {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return [];
  return cookieHeader.split(';').map((pair) => {
    const [name, ...rest] = pair.trim().split('=');
    return { name, value: rest.join('=') };
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  if (errorParam) {
    const friendly = formatAuthError(errorParam, errorDescription);
    const errorTarget = `arth://auth/callback?error=${encodeURIComponent(errorParam)}&error_description=${encodeURIComponent(friendly)}`;
    return new Response(renderRedirectHtml(errorTarget, false, friendly), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (!code) {
    const msg = 'No authorization code received from Google. Please try again.';
    const errorTarget = `arth://auth/callback?error=missing_authorization_code&error_description=${encodeURIComponent(msg)}`;
    return new Response(renderRedirectHtml(errorTarget, false, msg), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  try {
    const incomingCookies = parseIncomingCookies(request);
    const supabase = await createClient(undefined, incomingCookies);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      const friendly = formatAuthError('auth_exchange_failed', error?.message);
      const errorTarget = `arth://auth/callback?error=auth_exchange_failed&error_description=${encodeURIComponent(friendly)}`;
      return new Response(renderRedirectHtml(errorTarget, false, friendly), {
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
    const raw = err instanceof Error ? err.message : 'Authentication service error';
    const friendly = formatAuthError('auth_exchange_failed', raw);
    const errorTarget = `arth://auth/callback?error=auth_service_unavailable&error_description=${encodeURIComponent(friendly)}`;
    return new Response(renderRedirectHtml(errorTarget, false, friendly), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

function renderRedirectHtml(targetUrl: string, isSuccess: boolean, statusText: string): string {
  const safeTarget = targetUrl.replace(/"/g, '&quot;');
  const safeText = escapeHtml(statusText);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${isSuccess ? 'Authentication Successful — SpendSense' : 'Authentication Notice — SpendSense'}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=${safeTarget}">
  <style>
    body {
      background-color: #0C0A09;
      color: #F5F5F4;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
      border-top: 3px solid #193F37;
      border-radius: 6px;
      padding: 32px 24px;
      max-width: 420px;
      width: 100%;
    }
    .brand {
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #A8A29E;
      margin-bottom: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin: 0 0 8px;
      color: ${isSuccess ? '#86EFAC' : '#FCA5A5'};
    }
    p {
      color: #A8A29E;
      font-size: 14px;
      line-height: 1.5;
      margin: 0 0 24px;
    }
    .btn {
      display: inline-block;
      background: #F5F5F4;
      color: #0C0A09;
      font-weight: 600;
      font-size: 14px;
      padding: 12px 24px;
      border-radius: 4px;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">SpendSense · Personal Financial Ledger</div>
    <h1>${isSuccess ? 'Sign In Complete' : 'Sign In Notice'}</h1>
    <p>${isSuccess ? 'Returning you to your SpendSense financial ledger...' : safeText}</p>
    <a class="btn" href="${safeTarget}">Return to SpendSense</a>
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
