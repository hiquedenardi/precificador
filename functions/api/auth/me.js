import { json, requireUser, paywallMeta } from '../../_utils';

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  const meta = paywallMeta(env);

  if (!auth) {
    return json({ ok: true, loggedIn: false, price: meta.price, priceLabel: meta.priceLabel });
  }

  return json({
    ok: true,
    loggedIn: true,
    price: meta.price,
    priceLabel: meta.priceLabel,
    user: {
      username: auth.user.username,
      status: auth.user.status || 'pending',
      paidAt: auth.user.paidAt || null,
      orderRef: auth.user.orderRef || null,
    }
  });
}
