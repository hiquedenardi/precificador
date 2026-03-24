import { json, getCaktoToken } from '../_utils';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const token = await getCaktoToken(env);
    return json({ ok: true, hasCheckoutUrl: Boolean(env.CAKTO_CHECKOUT_URL), tokenPreview: token.slice(0, 12) + '...' });
  } catch (error) {
    return json({ ok: false, message: error.message || 'Falha na autenticação Cakto.' }, 500);
  }
}
