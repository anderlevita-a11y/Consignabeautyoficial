// Recebe os webhooks da AbacatePay e libera/renova/encerra o acesso.
// URL a cadastrar no painel da AbacatePay:
//   https://<projeto>.supabase.co/functions/v1/abacatepay-webhook?webhookSecret=<ABACATEPAY_WEBHOOK_SECRET>
//
// Segurança em camadas:
//  1. webhookSecret na URL (comparação em tempo constante)
//  2. Assinatura HMAC (X-Webhook-Signature) — conferida se ABACATEPAY_HMAC_KEY estiver configurada
//  3. O estado da assinatura é SEMPRE reconsultado na API da AbacatePay antes de liberar acesso;
//     o conteúdo do webhook só serve para saber "quem" e "qual assinatura".
import {
  abacate, adminClient, aplicarAssinatura, json, AbacateSubscription,
} from '../_shared/abacatepay.ts'

const enc = new TextEncoder()

function iguais(a: string, b: string) {
  const A = enc.encode(a), B = enc.encode(b)
  if (A.length !== B.length) return false
  let diff = 0
  for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i]
  return diff === 0
}

async function hmacBase64(key: string, body: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(body)))
  let bin = ''
  sig.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

const EVENTOS_ATIVACAO = new Set(['subscription.completed', 'subscription.renewed', 'subscription.trial_started', 'subscription.plan_changed'])
const EVENTOS_CANCELAMENTO = new Set(['subscription.cancelled'])

function userIdDoExternalId(ext?: string | null): string | null {
  if (!ext) return null
  const m = /^cb_([0-9a-f-]{36})_/i.exec(ext)
  return m ? m[1] : null
}

async function localizarUsuario(supabase: ReturnType<typeof adminClient>, data: any): Promise<string | null> {
  const checkout = data?.checkout ?? {}
  const sub = data?.subscription ?? {}

  const direto = checkout?.metadata?.user_id ?? data?.metadata?.user_id ??
    userIdDoExternalId(checkout?.externalId) ?? userIdDoExternalId(data?.externalId)
  if (direto) return direto

  const tentativas: [string, string | undefined][] = [
    ['abacate_subscription_id', sub?.id],
    ['abacate_checkout_id', sub?.checkoutId ?? checkout?.id],
    ['abacate_customer_id', sub?.customerId ?? data?.customer?.id],
  ]
  for (const [coluna, valor] of tentativas) {
    if (!valor) continue
    const { data: rows } = await supabase.from('profiles').select('id').eq(coluna, valor).limit(2)
    if (rows && rows.length === 1) return rows[0].id
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  // 1) Segredo na URL
  const segredo = Deno.env.get('ABACATEPAY_WEBHOOK_SECRET') ?? ''
  const recebido = new URL(req.url).searchParams.get('webhookSecret') ?? ''
  if (!segredo || !iguais(segredo, recebido)) return json({ error: 'Unauthorized' }, 401)

  const raw = await req.text()

  // 2) HMAC opcional
  const hmacKey = Deno.env.get('ABACATEPAY_HMAC_KEY')
  if (hmacKey) {
    const assinatura = req.headers.get('X-Webhook-Signature') ?? ''
    if (!iguais(await hmacBase64(hmacKey, raw), assinatura)) return json({ error: 'Assinatura inválida' }, 401)
  }

  let evento: any
  try { evento = JSON.parse(raw) } catch { return json({ error: 'JSON inválido' }, 400) }

  const supabase = adminClient()
  const eventId: string = evento?.id ?? `sem-id-${crypto.randomUUID()}`
  const tipo: string = evento?.event ?? 'desconhecido'

  // Idempotência: retentativas chegam com o mesmo id
  const { error: dup } = await supabase.from('abacatepay_webhook_events')
    .insert({ id: eventId, event: tipo, payload: evento })
  if (dup) {
    if ((dup as any).code === '23505') return json({ received: true, duplicate: true })
    console.error('Erro ao registrar evento:', dup)
  }

  const registrar = (result: string, userId: string | null = null) =>
    supabase.from('abacatepay_webhook_events')
      .update({ result, user_id: userId, processed_at: new Date().toISOString() })
      .eq('id', eventId)

  try {
    if (!EVENTOS_ATIVACAO.has(tipo) && !EVENTOS_CANCELAMENTO.has(tipo)) {
      await registrar('ignorado')
      return json({ received: true, ignored: tipo })
    }

    const userId = await localizarUsuario(supabase, evento?.data)
    if (!userId) {
      await registrar('usuario_nao_encontrado')
      return json({ received: true, warning: 'usuário não encontrado' })
    }

    // 3) Confirma o estado real na API (não confia no corpo do webhook)
    const subId: string | undefined = evento?.data?.subscription?.id
    let sub: AbacateSubscription | null = null
    if (subId) {
      const r = await abacate<any>(`/subscriptions/get?id=${encodeURIComponent(subId)}`)
      sub = r?.data ?? null
    } else {
      const checkoutId = evento?.data?.checkout?.id
      if (checkoutId) {
        const r = await abacate<any>(`/subscriptions/list?checkoutId=${encodeURIComponent(checkoutId)}&limit=10`)
        const lista: AbacateSubscription[] = Array.isArray(r?.data) ? r.data : []
        sub = lista.find((s) => s.status === 'ACTIVE') ?? lista[0] ?? null
      }
    }
    if (!sub) {
      await registrar('assinatura_nao_confirmada', userId)
      return json({ received: true, warning: 'assinatura não confirmada na API' })
    }

    // A assinatura confirmada precisa pertencer a esse usuário
    const { data: dono } = await supabase.from('profiles')
      .select('abacate_checkout_id, abacate_customer_id, abacate_subscription_id')
      .eq('id', userId).single()
    const pertence = !!dono && (
      (!!sub.checkoutId && sub.checkoutId === dono.abacate_checkout_id) ||
      (!!sub.id && sub.id === dono.abacate_subscription_id) ||
      (!!sub.customerId && sub.customerId === dono.abacate_customer_id)
    )
    if (!pertence) {
      await registrar('assinatura_de_outro_usuario', userId)
      return json({ received: true, warning: 'assinatura não corresponde ao usuário' })
    }

    await aplicarAssinatura(supabase, userId, sub)
    await registrar(`ok:${sub.status}`, userId)
    return json({ received: true })
  } catch (err) {
    console.error('abacatepay-webhook:', err)
    await registrar(`erro:${(err as Error).message}`.slice(0, 500))
    // Libera o id para a retentativa da AbacatePay reprocessar
    await supabase.from('abacatepay_webhook_events').delete().eq('id', eventId)
    return json({ error: 'falha temporária' }, 500)
  }
})
