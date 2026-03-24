import { bad, json, getUser, saveUser, sha256Hex, normalizeUser } from '../../_utils';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.APP_KV) return bad('APP_KV não está configurado no Cloudflare.', 500);

  let body = {};
  try { body = await request.json(); } catch {}

  const username = normalizeUser(body.username);
  const password = String(body.password || '');

  if (username.length < 3) return bad('Use um login com pelo menos 3 caracteres.');
  if (password.length < 4) return bad('Use uma senha com pelo menos 4 caracteres.');

  const exists = await getUser(env, username);
  if (exists) return bad('Esse login já existe.', 409);

  const passwordHash = await sha256Hex(password);
  await saveUser(env, {
    username,
    passwordHash,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  return json({ ok: true, message: 'Cadastro criado com sucesso.' });
}
