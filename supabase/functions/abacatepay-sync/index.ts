// Sincroniza a assinatura do usuário logado com a AbacatePay.
// Chamado pelo app quando o usuário volta do checkout — libera o acesso na hora,
// mesmo que o webhook ainda não tenha chegado.
import {
  abacate, adminClient, aplicarAssinatura, corsHeaders, json, userFromRequest, AbacateSubscription,
} from '../_shared/abacatepay.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    const user = await userFromRequest(req)
    if (!user) return json({ error: 'Não autenticado' }, 401)

    const supabase = adminClient()
    const { data: perfil } = await supabase.from('profiles')
      .select('abacate_checkout_id, abacate_subscription_id, abacate_customer_id')
      .eq('id', user.id).single()
    if (!perfil) return json({ error: 'Perfil não encontrado' }, 404)

    let sub: AbacateSubscription | null = null
    if (perfil.abacate_subscription_id) {
      const r = await abacate<any>(`/subscriptions/get?id=${encodeURIComponent(perfil.abacate_subscription_id)}`)
      sub = r?.data ?? null
    }
    // Nova assinatura gerada a partir do último checkout tem prioridade sobre uma antiga cancelada
    if ((!sub || sub.status !== 'ACTIVE') && perfil.abacate_checkout_id) {
      const r = await abacate<any>(`/subscriptions/list?checkoutId=${encodeURIComponent(perfil.abacate_checkout_id)}&limit=10`)
      const lista: AbacateSubscription[] = Array.isArray(r?.data) ? r.data : []
      const daCliente = lista.filter((s) => !perfil.abacate_customer_id || !s.customerId || s.customerId === perfil.abacate_customer_id)
      sub = daCliente.find((s) => s.status === 'ACTIVE') ?? sub ?? daCliente[0] ?? null
    }

    if (!sub) return json({ status: 'PENDING', message: 'Pagamento ainda não identificado.' })

    const aplicado = await aplicarAssinatura(supabase, user.id, sub)
    return json({ status: sub.status, vencimento: aplicado.vencimento ?? null })
  } catch (err) {
    console.error('abacatepay-sync:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
