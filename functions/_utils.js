export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function bad(message, status = 400) {
  return json({ ok: false, message }, status);
}

export function getCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  const parts = cookie.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = decodeURIComponent(part.slice(0, eq));
    if (key === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return '';
}

export function setCookie(name, value, maxAge = 60 * 60 * 24 * 30) {
  return `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie(name) {
  return `${encodeURIComponent(name)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input || ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomId(size = 24) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeUser(username) {
  return String(username || '').trim().toLowerCase();
}

export async function getUser(env, username) {
  const key = `user:${normalizeUser(username)}`;
  const raw = await env.APP_KV.get(key, 'json');
  return raw || null;
}

export async function saveUser(env, user) {
  const username = normalizeUser(user.username);
  await env.APP_KV.put(`user:${username}`, JSON.stringify({ ...user, username }));
}

export async function requireUser(request, env) {
  const sessionId = getCookie(request, 'precificador_session');
  if (!sessionId) return null;
  const username = await env.APP_KV.get(`session:${sessionId}`);
  if (!username) return null;
  const user = await getUser(env, username);
  if (!user) return null;
  return { sessionId, user };
}

export async function createSession(env, username) {
  const sessionId = randomId(24);
  await env.APP_KV.put(`session:${sessionId}`, normalizeUser(username), { expirationTtl: 60 * 60 * 24 * 30 });
  return sessionId;
}

export async function destroySession(env, sessionId) {
  if (!sessionId) return;
  await env.APP_KV.delete(`session:${sessionId}`);
}

export function baseOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function paywallMeta(env) {
  return {
    price: Number(env.PAYWALL_PRICE || 79.9),
    priceLabel: env.PAYWALL_LABEL || 'Acesso mensal',
  };
}

export async function getCaktoToken(env) {
  const clientId = env.CAKTO_CLIENT_ID;
  const clientSecret = env.CAKTO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Configure CAKTO_CLIENT_ID e CAKTO_CLIENT_SECRET.');
  const body = new URLSearchParams();
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  const res = await fetch('https://api.cakto.com.br/public_api/token/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Falha ao autenticar na Cakto.');
  }
  return payload.access_token;
}

export async function caktoOrders(env, query) {
  const token = await getCaktoToken(env);
  const qs = new URLSearchParams(query);
  const res = await fetch(`https://api.cakto.com.br/public_api/orders/?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.detail || payload.message || 'Falha ao consultar pedidos na Cakto.');
  }
  return payload;
}

export async function activateUserFromOrder(env, user, order) {
  user.status = 'active';
  user.paidAt = order.paidAt || new Date().toISOString();
  user.orderRef = order.refId || order.id || null;
  user.lastCheckoutToken = user.pendingCheckoutToken || user.lastCheckoutToken || null;
  delete user.pendingCheckoutToken;
  delete user.pendingCheckoutCreatedAt;
  await saveUser(env, user);
  return user;
}
