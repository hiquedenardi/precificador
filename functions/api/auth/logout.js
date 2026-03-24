import { json, getCookie, destroySession, clearCookie } from '../../_utils';

export async function onRequestPost(context) {
  const { request, env } = context;
  const sessionId = getCookie(request, 'precificador_session');
  if (sessionId) await destroySession(env, sessionId);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie('precificador_session') });
}
