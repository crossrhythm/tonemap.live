/**
 * Tonemap Pro — Cloudflare Worker
 *
 * Routes:
 *   POST /activate  — validate a Lemon Squeezy license key, set HMAC-signed cookie
 *   GET  /pro       — serve Pro HTML from KV if cookie is valid, else redirect
 */

const COOKIE_NAME    = 'tm_pro';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const LS_VALIDATE    = 'https://api.lemonsqueezy.com/v1/licenses/validate';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/activate') {
      if (request.method === 'POST') return handleActivate(request, env);
      if (request.method === 'GET')  return handleActivatePage(request, env);
    }

    if (url.pathname === '/pro' && request.method === 'GET') {
      return handlePro(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};

async function handleActivate(request, env) {
  let licenseKey;
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    licenseKey = body.license_key;
  } else {
    const body = await request.formData().catch(() => new FormData());
    licenseKey = body.get('license_key');
  }

  if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.trim() === '') {
    return jsonError('License key is required', 400);
  }
  licenseKey = licenseKey.trim();

  let lsData;
  try {
    const lsRes = await fetch(LS_VALIDATE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        license_key: licenseKey,
        instance_name: 'tonemap.live',
      }),
    });
    lsData = await lsRes.json();
  } catch (err) {
    return jsonError('Could not reach license server — try again', 502);
  }

  if (!lsData.valid) {
    return jsonError(lsData.error || 'Invalid license key', 401);
  }

  const token = await createToken(licenseKey, env.HMAC_SECRET);
  const cookie = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');

  return new Response(null, {
    status: 302,
    headers: { Location: '/pro', 'Set-Cookie': cookie },
  });
}

async function handleActivatePage(request, env) {
  const url = new URL(request.url);
  const keyFromUrl = url.searchParams.get('key') || '';
  const autoSubmit = keyFromUrl ? 'true' : 'false';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Activate Tonemap Pro</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #475569; border-radius: 12px;
            padding: 40px; max-width: 420px; width: 90%; text-align: center; }
    h1 { font-size: 1.4rem; margin: 0 0 8px; }
    p  { color: #94a3b8; margin: 0 0 24px; font-size: .9rem; }
    input { width: 100%; padding: 12px; border: 1px solid #475569; border-radius: 8px;
            background: #0f172a; color: #f8fafc; font-size: 1rem; box-sizing: border-box; margin-bottom: 12px; }
    button { width: 100%; padding: 13px; background: rgb(34,197,94); color: #0f172a;
             font-weight: 600; font-size: 1rem; border: none; border-radius: 8px; cursor: pointer; }
    button:hover { opacity: .88; }
    #msg { margin-top: 14px; font-size: .88rem; color: #f87171; min-height: 1.2em; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Activate Tonemap Pro</h1>
    <p>Enter the license key from your purchase receipt.</p>
    <form id="form" method="POST" action="/activate">
      <input id="key" name="license_key" type="text"
             placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
             value="${escapeHtml(keyFromUrl)}" autocomplete="off" spellcheck="false" required>
      <button type="submit">Activate</button>
      <div id="msg"></div>
    </form>
  </div>
  <script>
    const form = document.getElementById('form');
    const msg  = document.getElementById('msg');
    if (${autoSubmit} && document.getElementById('key').value) form.requestSubmit();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = 'Checking\u2026';
      msg.style.color = '#94a3b8';
      const res = await fetch('/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: document.getElementById('key').value.trim() }),
      });
      if (res.redirected) { window.location.href = res.url; return; }
      if (res.ok) { window.location.href = '/pro'; return; }
      const data = await res.json().catch(() => ({}));
      msg.textContent = data.error || 'Activation failed. Check your key and try again.';
      msg.style.color = '#f87171';
    });
  </script>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handlePro(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token || !(await verifyToken(token, env.HMAC_SECRET))) {
    return new Response(null, { status: 302, headers: { Location: '/activate' } });
  }

  const proHtml = await env.PRO_CONTENT.get('pro-app.html');
  if (!proHtml) {
    return new Response('Pro content not available — contact support.', { status: 503 });
  }

  return new Response(proHtml, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function createToken(licenseKey, secret) {
  const key  = await importKey(secret);
  const sig  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(licenseKey));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  const keyB64 = btoa(licenseKey);
  return `${keyB64}.${sigB64}`;
}

async function verifyToken(token, secret) {
  try {
    const [keyB64] = token.split('.');
    const licenseKey = atob(keyB64);
    const expected   = await createToken(licenseKey, secret);
    if (expected.length !== token.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [n, ...v] = part.trim().split('=');
    if (n.trim() === name) return v.join('=');
  }
  return null;
}

function jsonError(message, status) {
  return Response.json({ error: message }, { status });
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
