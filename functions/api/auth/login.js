import { bad, json, getUser, sha256Hex, createSession, setCookie, normalizeUser } from '../../_utils';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.APP_KV) return bad('APP_KV não está configurado no Cloudflare.', 500);

  let body = {};
  try { body = await request.json(); } catch {}

  const username = normalizeUser(body.username);
  const password = String(body.password || '');

  if (!username || !password) return bad('Informe login e senha.');

  const user = await getUser(env, username);
  if (!user) return bad('Login ou senha inválidos.', 401);

  const passwordHash = await sha256Hex(password);
  if (user.passwordHash !== passwordHash) return bad('Login ou senha inválidos.', 401);

  const sessionId = await createSession(env, username);
  const cookie = setCookie('precificador_session', sessionId);

  return json({ ok: true, user: { username: user.username, status: user.status || 'pending', paidAt: user.paidAt || null, orderRef: user.orderRef || null } }, 200, { 'Set-Cookie': cookie });
}
