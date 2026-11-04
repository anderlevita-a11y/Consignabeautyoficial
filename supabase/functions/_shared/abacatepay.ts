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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
