/**
 * Tonemap Pro — Cloudflare Worker
 *
 * Routes:
 *   POST /activate  — validate a Polar license key, set HMAC-signed cookie
 *   GET  /pro       — serve Pro HTML from KV if cookie is valid, else redirect
 */

const COOKIE_NAME      = 'tm_pro';
const FLAG_COOKIE_NAME = 'tm_pro_flag';
const COOKIE_MAX_AGE   = 365 * 24 * 60 * 60;
const POLAR_VALIDATE   = 'https://api.polar.sh/v1/license-keys/validate';
const POLAR_ACTIVATE   = 'https://api.polar.sh/v1/license-keys/activate';
const POLAR_DEACTIVATE = 'https://api.polar.sh/v1/license-keys/deactivate';
const REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REVALIDATE_GRACE_MS    = 6 * 60 * 60 * 1000;

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

    if (url.pathname === '/deactivate' && request.method === 'POST') {
      return handleDeactivate(request, env);
    }

    if (url.pathname === '/license-info' && request.method === 'GET') {
      return handleLicenseInfo(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};

async function handleActivate(request, env) {
  if (!env.HMAC_SECRET) {
    return jsonError('Server misconfigured — missing HMAC secret', 500);
  }

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

  const check = await activateLicenseKey(licenseKey, env);
  if (check.networkError) {
    return jsonError('Could not reach license server — try again', 502);
  }
  if (!check.valid) {
    return jsonError(check.error || 'Invalid or already fully activated license key', 401);
  }

  const token = await createToken(licenseKey, Date.now(), check.activationId, env.HMAC_SECRET);

  return new Response(null, {
    status: 302,
    headers: authSetHeaders({ Location: '/pro' }, buildAuthCookie(token)),
  });
}

async function handleActivatePage(request, env) {
  const url = new URL(request.url);
  const customerSessionToken = url.searchParams.get('customer_session_token');

  // Auto-activate when Polar redirects here after purchase.
  // Require the request to come from a Polar origin — crafted links from
  // anywhere else fall through to the manual paste form, which is the same
  // UX as visiting /activate directly. Pragmatic, not Fort Knox: if Polar
  // ever changes their referrer policy and breaks legit redirects, users
  // see the manual form and we'll learn from support email.
  const referer = request.headers.get('Referer') || '';
  const fromPolar =
    referer.startsWith('https://buy.polar.sh/') ||
    referer.startsWith('https://polar.sh/') ||
    referer.startsWith('https://api.polar.sh/');

  if (customerSessionToken && fromPolar && env.HMAC_SECRET) {
    try {
      const keysRes = await fetch('https://api.polar.sh/v1/customer-portal/license-keys/', {
        headers: { 'Authorization': `Bearer ${customerSessionToken}` },
      });
      const keysData = await keysRes.json().catch(() => ({}));
      const grantedKey = keysData?.items?.find(k => k.status === 'granted');
      if (grantedKey?.key) {
        const check = await activateLicenseKey(grantedKey.key, env);
        if (check.valid) {
          const token = await createToken(grantedKey.key, Date.now(), check.activationId, env.HMAC_SECRET);
          return new Response(null, {
            status: 302,
            headers: authSetHeaders({ Location: '/pro' }, buildAuthCookie(token)),
          });
        }
      }
    } catch {
      // fall through to manual form
    }
  }

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
    .card-links { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
    .card-links a { color: #94a3b8; font-size: .85rem; text-decoration: none; }
    .card-links a:hover { color: #f8fafc; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Activate Tonemap Pro</h1>
    <p>Enter the license key from your Polar confirmation email.</p>
    <form id="form" method="POST" action="/activate">
      <input id="key" name="license_key" type="text"
             placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
             value="" autocomplete="off" spellcheck="false" required>
      <button type="submit">Activate</button>
      <div id="msg"></div>
    </form>
    <div class="card-links">
      <a href="https://polar.sh/eevs/portal/request">Find your license key on Polar →</a>
      <a href="/">← Back to Tonemap</a>
    </div>
  </div>
  <script>
    const form = document.getElementById('form');
    const msg  = document.getElementById('msg');
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

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function handlePro(request, env) {
  if (!env.HMAC_SECRET) {
    return new Response('Pro content not available — contact support.', { status: 503 });
  }

  const token = getCookie(request, COOKIE_NAME);
  const auth = token ? await verifyToken(token, env.HMAC_SECRET) : null;
  if (!auth) {
    return new Response(null, { status: 302, headers: { Location: '/activate' } });
  }

  const ageMs = Date.now() - auth.lastValidatedAt;
  const activationCheck = await validateLicenseKey(auth.licenseKey, env);
  if (activationCheck.networkError) {
    if (ageMs > (REVALIDATE_INTERVAL_MS + REVALIDATE_GRACE_MS)) {
      return new Response(null, {
        status: 302,
        headers: authClearHeaders({ Location: '/activate' }),
      });
    }
  }
  if (!activationCheck.networkError && !activationCheck.valid) {
    return new Response(null, {
      status: 302,
      headers: authClearHeaders({ Location: '/activate' }),
    });
  }

  let activationStillPresent = null;
  if (!activationCheck.networkError && activationCheck.valid) {
    activationStillPresent = await isActivationActive(
      activationCheck.licenseKeyId,
      auth.activationId,
      env,
    );
    if (activationStillPresent === false) {
      return new Response(null, {
        status: 302,
        headers: authClearHeaders({ Location: '/activate' }),
      });
    }
    if (activationStillPresent === null && ageMs > (REVALIDATE_INTERVAL_MS + REVALIDATE_GRACE_MS)) {
      return new Response(null, {
        status: 302,
        headers: authClearHeaders({ Location: '/activate' }),
      });
    }
  }

  let refreshedCookie = null;
  if (ageMs >= REVALIDATE_INTERVAL_MS) {
    const recheck = activationCheck;

    if (!recheck.networkError && !recheck.valid) {
      return new Response(null, {
        status: 302,
        headers: authClearHeaders({ Location: '/activate' }),
      });
    }

    if (!recheck.networkError && recheck.valid && activationStillPresent === true) {
      const nextToken = await createToken(auth.licenseKey, Date.now(), auth.activationId, env.HMAC_SECRET);
      refreshedCookie = buildAuthCookie(nextToken);
    }

    if (recheck.networkError && ageMs > (REVALIDATE_INTERVAL_MS + REVALIDATE_GRACE_MS)) {
      return new Response(null, {
        status: 302,
        headers: authClearHeaders({ Location: '/activate' }),
      });
    }
  }

  const proHtml = await env.PRO_CONTENT.get('pro-app.html');
  if (!proHtml) {
    return new Response('Pro content not available — contact support.', { status: 503 });
  }

  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
  });
  if (refreshedCookie) {
    headers.append('Set-Cookie', refreshedCookie);
  }
  // Always (re)assert the flag cookie so existing Pro users are backfilled
  // on their next /pro visit. Idempotent; not a security boundary.
  headers.append('Set-Cookie', buildFlagCookie());

  return new Response(proHtml, {
    headers,
  });
}

async function handleLicenseInfo(request, env) {
  if (!env.HMAC_SECRET) return jsonError('Server misconfigured', 500);
  const token = getCookie(request, COOKIE_NAME);
  const auth = token ? await verifyToken(token, env.HMAC_SECRET) : null;
  if (!auth) return jsonError('Unauthorized', 401);

  const result = await validateLicenseKey(auth.licenseKey, env);
  if (result.networkError) return jsonError('Could not reach license server', 502);
  if (!result.valid) return jsonError('License not valid', 401);

  // Fetch activation count from the license key's activations array
  let activationsCount = null;
  if (result.licenseKeyId) {
    const licenseKeyRecord = await fetchLicenseKeyRecord(result.licenseKeyId, env);
    if (Array.isArray(licenseKeyRecord?.activations)) {
      activationsCount = licenseKeyRecord.activations.length;
    }
  }

  return Response.json({
    activations_count: activationsCount,
    activation_limit:  result.activationLimit,
  });
}

async function handleDeactivate(request, env) {
  if (!env.HMAC_SECRET) {
    return jsonError('Server misconfigured — missing HMAC secret', 500);
  }
  const token = getCookie(request, COOKIE_NAME);
  const auth = token ? await verifyToken(token, env.HMAC_SECRET) : null;

  // No valid cookie — nothing to deactivate at Polar. Clear any stale cookies and return ok.
  if (!auth?.licenseKey || !auth?.activationId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: authClearHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  // Free the Polar activation slot first. If that fails, keep the cookie
  // intact — otherwise the user is logged out locally while their slot is
  // still consumed, and re-activating would burn a second slot.
  let polarOk = false;
  try {
    const res = await fetch(POLAR_DEACTIVATE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${env.POLAR_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        key: auth.licenseKey,
        organization_id: env.POLAR_ORGANIZATION_ID,
        activation_id: auth.activationId,
      }),
    });
    polarOk = res.ok;
  } catch {
    polarOk = false;
  }

  if (!polarOk) {
    return jsonError(
      'Could not free your activation slot — try again in a moment',
      502,
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: authClearHeaders({ 'Content-Type': 'application/json' }),
  });
}

async function validateLicenseKey(licenseKey, env) {
  try {
    const res = await fetch(POLAR_VALIDATE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${env.POLAR_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        key: licenseKey,
        organization_id: env.POLAR_ORGANIZATION_ID,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      valid: data?.status === 'granted',
      error: data?.detail || null,
      networkError: false,
      licenseKeyId:    data?.id             ?? null,
      activationLimit: data?.limit_activations ?? null,
    };
  } catch {
    return {
      valid: false,
      error: 'Could not reach license server — try again',
      networkError: true,
      licenseKeyId: null,
      activationLimit: null,
    };
  }
}

async function fetchLicenseKeyRecord(licenseKeyId, env) {
  if (!licenseKeyId) return null;
  try {
    const lkRes = await fetch(`https://api.polar.sh/v1/license-keys/${licenseKeyId}`, {
      headers: { 'Authorization': `Bearer ${env.POLAR_ACCESS_TOKEN}` },
    });
    if (!lkRes.ok) return null;
    return await lkRes.json().catch(() => null);
  } catch {
    return null;
  }
}

async function isActivationActive(licenseKeyId, activationId, env) {
  if (!licenseKeyId || !activationId) return false;
  const licenseKeyRecord = await fetchLicenseKeyRecord(licenseKeyId, env);
  if (!Array.isArray(licenseKeyRecord?.activations)) return null;
  return licenseKeyRecord.activations.some((activation) => activation?.id === activationId);
}

async function activateLicenseKey(licenseKey, env) {
  try {
    const res = await fetch(POLAR_ACTIVATE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${env.POLAR_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        key: licenseKey,
        organization_id: env.POLAR_ORGANIZATION_ID,
        label: 'tonemap.live',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.license_key?.status === 'granted' && data?.id) {
      return { valid: true, activationId: data.id, error: null, networkError: false };
    }
    return {
      valid: false,
      activationId: null,
      error: data?.detail || 'License key could not be activated',
      networkError: false,
    };
  } catch {
    return { valid: false, activationId: null, error: 'Could not reach license server — try again', networkError: true };
  }
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

async function signMessage(message, secret) {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function createToken(licenseKey, lastValidatedAt, activationId, secret) {
  const keyB64 = btoa(licenseKey);
  const ts = `${Math.floor(lastValidatedAt)}`;
  const actIdB64 = btoa(activationId || '');
  const sigB64 = await signMessage(`${keyB64}.${ts}.${actIdB64}`, secret);
  return `${keyB64}.${ts}.${actIdB64}.${sigB64}`;
}

async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 4) return null;
    const [keyB64, ts, actIdB64, sigB64] = parts;
    const lastValidatedAt = Number(ts);
    if (!Number.isFinite(lastValidatedAt)) return null;

    const expectedSig = await signMessage(`${keyB64}.${ts}.${actIdB64}`, secret);
    if (!timingSafeEqual(expectedSig, sigB64)) return null;

    const licenseKey = atob(keyB64);
    if (!licenseKey) return null;
    const activationId = atob(actIdB64);
    return { licenseKey, lastValidatedAt, activationId };
  } catch {
    return null;
  }
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function buildAuthCookie(token) {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

function clearAuthCookie() {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

// Non-HttpOnly sibling read by index.html to decide whether to redirect
// to /pro. Not a security boundary — real auth is the HttpOnly tm_pro
// cookie validated by HMAC in handlePro().
function buildFlagCookie() {
  return [
    `${FLAG_COOKIE_NAME}=1`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE}`,
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

function clearFlagCookie() {
  return [
    `${FLAG_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

function authSetHeaders(extra, authCookie) {
  const headers = new Headers(extra || {});
  headers.append('Set-Cookie', authCookie);
  headers.append('Set-Cookie', buildFlagCookie());
  return headers;
}

function authClearHeaders(extra) {
  const headers = new Headers(extra || {});
  headers.append('Set-Cookie', clearAuthCookie());
  headers.append('Set-Cookie', clearFlagCookie());
  return headers;
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
