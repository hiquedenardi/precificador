import { bad, json, requireUser, caktoOrders, activateUserFromOrder } from '../_utils';

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth) return bad('Faça login para validar o pagamento.', 401);

  if (auth.user.status === 'active') {
    return json({ paid: true, message: 'Acesso liberado.', reference: auth.user.orderRef || null });
  }

  const token = auth.user.pendingCheckoutToken || auth.user.lastCheckoutToken;
  if (!token) {
    return json({ paid: false, message: 'Abra o checkout para vincular a compra a esta conta.' });
  }

  const origin = new URL(request.url).origin;
  const refererTarget = `${origin}/checkout/${token}`;

  try {
    const orders = await caktoOrders(env, {
      status: 'paid',
      ordering: '-paidAt',
      limit: '5',
      referererURL: refererTarget,
      checkoutURL: env.CAKTO_CHECKOUT_URL || '',
    });
    const order = Array.isArray(orders.results) ? orders.results.find((item) => item.status === 'paid') : null;
    if (!order) {
      return json({ paid: false, message: 'Pagamento ainda não confirmado. Assim que a Cakto aprovar, a conta libera sozinha.' });
    }
    await activateUserFromOrder(env, auth.user, order);
    return json({ paid: true, message: 'Pagamento confirmado. Acesso liberado automaticamente.', reference: order.refId || order.id || null });
  } catch (error) {
    return bad(error.message || 'Erro ao consultar a Cakto.', 500);
  }
}
