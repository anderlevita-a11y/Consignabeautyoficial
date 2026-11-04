# Assinatura recorrente AbacatePay — Consigna Beauty

Plano **Mensal R$ 39,99** com cobrança automática e liberação de acesso sem intervenção do admin.

## Como funciona

| Categoria | Como entra | O que libera |
|---|---|---|
| **TRIAL** | Admin clica em `TRIAL` (7 dias grátis) | Tudo, exceto Rotas e Simulação |
| **MENSAL** | Pagamento na AbacatePay (automático) ou admin clica em `MENSAL` | Todas as funções |
| **PENDENTE** | Cadastro novo | Só a tela de perfil |

Fluxo do pagamento:

1. Usuária clica em **Assinar agora** no perfil → função `abacatepay-checkout` cria o checkout recorrente e redireciona.
2. Ela paga na AbacatePay e volta para `/?tab=profile&assinatura=retorno`.
3. O app chama `abacatepay-sync`, que confirma a assinatura na API e libera o acesso na hora.
4. Em paralelo, o webhook `subscription.completed` faz o mesmo (caso ela feche a aba antes).
5. Todo mês, `subscription.renewed` empurra o `vencimento` para o próximo ciclo (+3 dias de tolerância).
6. Se o cartão falhar em todas as retentativas, a AbacatePay cancela (`subscription.cancelled`) e o acesso termina no vencimento.

Admin continua com **Arquivar/Restaurar** e **Bloquear/Desbloquear** manuais.
- Bloqueio pelo botão do admin = `manual` → pagamento **não** desbloqueia.
- Bloqueio pelo botão "bloquear vencidos" = `inadimplencia` → pagamento desbloqueia sozinho.

## Ativação (uma vez)

### 1. Banco
No SQL Editor do Supabase, rode `supabase/migrations/20261104_assinatura_abacatepay.sql`.
Ela também converte quem estava em PRO/STARTER/PAGO para MENSAL (mantendo o vencimento) e
impede que usuárias alterem o próprio status/vencimento/role pelo navegador.

### 2. Secrets das Edge Functions
```bash
supabase secrets set ABACATEPAY_TOKEN=<chave de API da AbacatePay>
supabase secrets set ABACATEPAY_WEBHOOK_SECRET=<gere uma senha longa e aleatória>
supabase secrets set APP_URL=https://consignabeauty.com.br
# opcionais
supabase secrets set ABACATEPAY_METHODS=CARD,PIX      # PIX só se o Pix Automático estiver habilitado na sua conta
supabase secrets set ABACATEPAY_PRODUCT_ID=prod_xxx   # se já criou o produto no painel
supabase secrets set ABACATEPAY_HMAC_KEY=<chave>      # validação extra do header X-Webhook-Signature
```
Sem `ABACATEPAY_PRODUCT_ID`, a primeira assinatura cria sozinha o produto
"Consigna Beauty — Plano Mensal" (R$ 39,99, ciclo MONTHLY).

### 3. Deploy das funções
```bash
supabase functions deploy abacatepay-checkout
supabase functions deploy abacatepay-sync
supabase functions deploy abacatepay-cancel
supabase functions deploy abacatepay-webhook --no-verify-jwt
```

### 4. Webhook no painel da AbacatePay
- URL: `https://<ref-do-projeto>.supabase.co/functions/v1/abacatepay-webhook?webhookSecret=<o mesmo ABACATEPAY_WEBHOOK_SECRET>`
- Eventos: `subscription.completed`, `subscription.renewed`, `subscription.cancelled`

### 5. Teste
Use a chave de **modo dev** da AbacatePay primeiro, assine com uma conta de teste e confira:
- o card do perfil muda para "Assinatura ativa";
- no admin aparece `MENSAL` + "● RECORRENTE";
- a tabela `abacatepay_webhook_events` registra `ok:ACTIVE`.

## Segurança
- Webhook: segredo na URL (comparação em tempo constante) + HMAC opcional + **reconsulta da assinatura na API** antes de liberar, e checagem de que a assinatura pertence àquela usuária.
- Eventos são idempotentes (o `id` do webhook é chave primária).
- Trigger `cb_protect_billing_fields` reverte alterações de status, vencimento, bloqueio e role feitas por quem não é admin.
