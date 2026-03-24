import { bad, json, requireUser, randomId, saveUser } from '../_utils';

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth) return bad('Faça login antes de abrir o checkout.', 401);
  if (!env.CAKTO_CHECKOUT_URL) return bad('Configure CAKTO_CHECKOUT_URL no Cloudflare.');

  const token = randomId(12);
  auth.user.pendingCheckoutToken = token;
  auth.user.pendingCheckoutCreatedAt = new Date().toISOString();
  await saveUser(env, auth.user);

  const origin = new URL(request.url).origin;
  return json({ ok: true, url: `${origin}/checkout/${token}` });
}
