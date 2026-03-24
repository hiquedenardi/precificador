export async function onRequestGet(context) {
  const { params, env } = context;
  const token = params.token;
  const checkoutUrl = env.CAKTO_CHECKOUT_URL;
  if (!checkoutUrl) {
    return new Response('Configure CAKTO_CHECKOUT_URL.', { status: 500 });
  }
  const html = `<!doctype html>
  <html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Redirecionando para o checkout</title>
  <style>body{font-family:Inter,system-ui,sans-serif;background:#f6f7fb;color:#111;display:grid;place-items:center;min-height:100vh;margin:0} .box{background:#fff;padding:28px 32px;border-radius:20px;box-shadow:0 18px 50px rgba(0,0,0,.08);max-width:520px;text-align:center} a{color:#111}</style>
  <meta http-equiv="refresh" content="0; url=${checkoutUrl}"></head><body><div class="box"><h1>Redirecionando para o checkout</h1><p>Sua conta foi vinculada a este fluxo. Assim que a Cakto confirmar o pagamento, o acesso será liberado automaticamente.</p><p>Se nada acontecer, <a href="${checkoutUrl}">clique aqui para continuar</a>.</p><small>Token de checkout: ${token}</small></div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
