Cloudflare Pages + Cakto automático (sem Netlify)

O que este pacote faz:
- cadastro/login no backend do Cloudflare Pages Functions
- guarda usuários no Cloudflare KV
- abre o checkout da Cakto por uma rota intermediária /checkout/TOKEN
- consulta automaticamente os pedidos pagos na API da Cakto usando o campo referererURL
- libera a conta assim que achar um pedido paid correspondente

IMPORTANTE
A chave da API da Cakto precisa ter os escopos: read + orders.

Como subir no Cloudflare Pages:
1) Crie/abra seu projeto Pages.
2) Faça upload deste projeto inteiro.
3) Vá em Settings > Variables and Secrets e crie:
   - CAKTO_CLIENT_ID
   - CAKTO_CLIENT_SECRET
   - CAKTO_CHECKOUT_URL
   - PAYWALL_PRICE (ex: 79.90)
   - PAYWALL_LABEL (ex: Acesso mensal)
4) Vá em Settings > Functions > KV namespace bindings.
   Crie ou conecte um KV namespace com binding name: APP_KV
5) Redeploy.

Teste técnico:
- /api/cakto-diagnose

Observação prática:
A automação depende da API da Cakto localizar o pedido pago usando o referererURL da rota /checkout/TOKEN e o checkoutURL configurado.


IMPORTANTE: contas antigas salvas apenas no navegador/localStorage da versão estática não migram automaticamente para o backend novo. Depois desta versão, cadastros e login passam a existir no KV do Cloudflare.
