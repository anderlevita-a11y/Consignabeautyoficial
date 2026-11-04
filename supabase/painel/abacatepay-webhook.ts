// abacatepay-webhook — versão arquivo único para colar no editor do painel do Supabase
// Gerado a partir de supabase/functions/abacatepay-webhook + _shared/abacatepay.ts

// Utilitários compartilhados da integração AbacatePay (API v2)
// Docs: https://docs.abacatepay.com/pages/subscriptions/reference
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const ABACATE_API = 'https://api.abacatepay.com/v2'

/** Preço do plano mensal em centavos (R$ 39,99). */
export const PLANO_MENSAL_CENTAVOS = 3999
export const PLANO_MENSAL_EXTERNAL_ID = 'consigna-beauty-mensal-3999'
/** Dias de tolerância após a data de renovação (cobre as retentativas da AbacatePay). */
export const DIAS_TOLERANCIA = 3

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name, x-supabase-api-version, accept, accept-profile, content-profile, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )
}

/** Resolve o usuário a partir do JWT enviado pelo app. */
export async function userFromRequest(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data, error } = await adminClient().auth.getUser(jwt)
  if (error || !data?.user) return null
  return data.user
}

export async function abacate<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = Deno.env.get('ABACATEPAY_TOKEN')
  if (!token) throw new Error('ABACATEPAY_TOKEN não configurado nas secrets do Supabase.')
  const res = await fetch(`${ABACATE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.success === false) {
    const msg = body?.error?.message ?? body?.error ?? `HTTP ${res.status}`
    throw new Error(`AbacatePay ${path}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`)
  }
  return body as T
}

/** Soma meses preservando o dia (31/jan + 1 mês = 28/fev). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime())
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

/**
 * Próximo vencimento de uma assinatura ATIVA: o primeiro "aniversário"
 * mensal (a partir do início da cobrança) que ainda está no futuro, mais a
 * tolerância. É determinístico — webhook e sincronização chegam ao mesmo
 * valor, então reprocessar um evento nunca estende o acesso indevidamente.
 */
export function proximoVencimento(inicioCobranca: Date, agora = new Date()): Date {
  let n = 1
  let alvo = addMonths(inicioCobranca, n)
  while (alvo.getTime() <= agora.getTime() && n < 1200) {
    n++
    alvo = addMonths(inicioCobranca, n)
  }
  return new Date(alvo.getTime() + DIAS_TOLERANCIA * 24 * 60 * 60 * 1000)
}

export interface AbacateSubscription {
  id: string
  checkoutId?: string
  customerId?: string
  amount?: number
  status: 'PENDING' | 'ACTIVE' | 'CANCELLED'
  method?: 'CARD' | 'PIX'
  trialEndsAt?: string | null
  createdAt: string
}

/** Aplica no perfil o estado de uma assinatura confirmada na API. */
export async function aplicarAssinatura(
  supabase: SupabaseClient,
  userId: string,
  sub: AbacateSubscription,
) {
  const { data: perfil, error: perfilErr } = await supabase
    .from('profiles')
    .select('id, is_blocked, blocked_reason, vencimento')
    .eq('id', userId)
    .single()
  if (perfilErr || !perfil) throw new Error(`Perfil ${userId} não encontrado`)

  const base: Record<string, unknown> = {
    abacate_subscription_id: sub.id,
    abacate_subscription_status: sub.status,
    abacate_method: sub.method ?? null,
    assinatura_atualizada_em: new Date().toISOString(),
  }
  if (sub.customerId) base.abacate_customer_id = sub.customerId
  if (sub.checkoutId) base.abacate_checkout_id = sub.checkoutId

  if (sub.status === 'ACTIVE') {
    const inicio = new Date(sub.trialEndsAt ?? sub.createdAt)
    const venc = proximoVencimento(inicio)
    // Nunca encurta um vencimento maior já concedido manualmente pelo admin
    const atual = perfil.vencimento ? new Date(perfil.vencimento) : null
    const vencimentoFinal = atual && atual > venc ? atual : venc

    Object.assign(base, {
      status_pagamento: 'MENSAL',
      plano_tipo: 'mensal',
      plano_status: 'ativo',
      plan: 'Mensal',
      vencimento: vencimentoFinal.toISOString(),
      data_pagamento: new Date().toISOString().slice(0, 10),
    })
    // Desbloqueia só bloqueios por inadimplência; bloqueio manual do admin permanece
    if (perfil.is_blocked && perfil.blocked_reason !== 'manual') {
      base.is_blocked = false
      base.blocked_reason = null
    }
  } else if (sub.status === 'CANCELLED') {
    // Mantém o acesso até o fim do período já pago (vencimento atual)
    base.plano_status = 'cancelado'
  }

  const { error } = await supabase.from('profiles').update(base).eq('id', userId)
  if (error) throw error
  return base
}

// ===================== função abacatepay-webhook =====================
// Recebe os webhooks da AbacatePay e libera/renova/encerra o acesso.
// URL a cadastrar no painel da AbacatePay:
//   https://<projeto>.supabase.co/functions/v1/abacatepay-webhook?webhookSecret=<ABACATEPAY_WEBHOOK_SECRET>
//
// Segurança em camadas:
//  1. webhookSecret na URL (comparação em tempo constante)
//  2. Assinatura HMAC (X-Webhook-Signature) — conferida se ABACATEPAY_HMAC_KEY estiver configurada
//  3. O estado da assinatura é SEMPRE reconsultado na API da AbacatePay antes de liberar acesso;
//     o conteúdo do webhook só serve para saber "quem" e "qual assinatura".

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

