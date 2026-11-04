// Cria (ou reaproveita) o checkout de assinatura mensal R$ 39,99 na AbacatePay
// para o usuário logado e devolve a URL de pagamento.
import {
  abacate, adminClient, corsHeaders, json, userFromRequest,
  PLANO_MENSAL_CENTAVOS, PLANO_MENSAL_EXTERNAL_ID,
} from '../_shared/abacatepay.ts'

async function obterProdutoMensal(): Promise<string> {
  const fixo = Deno.env.get('ABACATEPAY_PRODUCT_ID')
  if (fixo) return fixo

  // 1) Procura pelo externalId
  try {
    const r = await abacate<any>(`/products/get?externalId=${encodeURIComponent(PLANO_MENSAL_EXTERNAL_ID)}`)
    if (r?.data?.id) return r.data.id
  } catch (_) { /* segue para a listagem */ }

  // 2) Procura na listagem
  try {
    const r = await abacate<any>('/products/list?limit=100')
    const lista: any[] = Array.isArray(r?.data) ? r.data : (r?.data?.items ?? [])
    const p = lista.find((x) =>
      x.externalId === PLANO_MENSAL_EXTERNAL_ID ||
      (x.cycle === 'MONTHLY' && x.price === PLANO_MENSAL_CENTAVOS && x.status !== 'INACTIVE'))
    if (p?.id) return p.id
  } catch (_) { /* cria abaixo */ }

  // 3) Cria o produto recorrente (sem trial na AbacatePay: o teste de 7 dias é dado pelo admin no app)
  const novo = await abacate<any>('/products/create', {
    method: 'POST',
    body: JSON.stringify({
      externalId: PLANO_MENSAL_EXTERNAL_ID,
      name: 'Consigna Beauty — Plano Mensal',
      description: 'Acesso completo ao Consigna Beauty, renovação mensal automática.',
      price: PLANO_MENSAL_CENTAVOS,
      currency: 'BRL',
      cycle: 'MONTHLY',
    }),
  })
  return novo.data.id
}

function metodos(): ('CARD' | 'PIX')[] {
  const raw = (Deno.env.get('ABACATEPAY_METHODS') ?? 'CARD').toUpperCase()
  const m = raw.split(',').map((s) => s.trim()).filter((s) => s === 'CARD' || s === 'PIX') as ('CARD' | 'PIX')[]
  return m.length ? m : ['CARD']
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    const user = await userFromRequest(req)
    if (!user) return json({ error: 'Não autenticado' }, 401)

    const supabase = adminClient()
    const { data: perfil, error } = await supabase
      .from('profiles')
      .select('id, nome, email, cpf, whatsapp, abacate_customer_id, abacate_subscription_status, abacate_subscription_id')
      .eq('id', user.id)
      .single()
    if (error || !perfil) return json({ error: 'Perfil não encontrado' }, 404)

    if (perfil.abacate_subscription_status === 'ACTIVE') {
      return json({ error: 'Você já possui uma assinatura ativa.', already_active: true }, 409)
    }

    // Cliente na AbacatePay (único por CPF; reaproveita se já existir)
    let customerId: string | null = perfil.abacate_customer_id
    if (!customerId) {
      const email = perfil.email || user.email
      if (!email) return json({ error: 'Cadastre seu e-mail antes de assinar.' }, 400)
      const cliente: Record<string, unknown> = { email }
      if (perfil.nome) cliente.name = perfil.nome
      const fone = (perfil.whatsapp ?? '').replace(/\D/g, '')
      if (fone.length >= 10) cliente.cellphone = fone.startsWith('55') ? `+${fone}` : `+55${fone}`
      const cpf = (perfil.cpf ?? '').replace(/\D/g, '')
      if (cpf.length === 11 || cpf.length === 14) cliente.taxId = cpf
      cliente.metadata = { user_id: user.id }
      try {
        const c = await abacate<any>('/customers/create', { method: 'POST', body: JSON.stringify(cliente) })
        customerId = c?.data?.id ?? null
      } catch (e) {
        console.warn('Falha ao criar cliente na AbacatePay (seguindo sem customerId):', e)
      }
    }

    const productId = await obterProdutoMensal()
    const origin = Deno.env.get('APP_URL') || req.headers.get('origin') || 'https://consignabeauty.com.br'
    const externalId = `cb_${user.id}_${Date.now()}`

    const body: Record<string, unknown> = {
      items: [{ id: productId, quantity: 1 }],
      methods: metodos(),
      externalId,
      metadata: { user_id: user.id, app: 'consigna-beauty' },
      returnUrl: `${origin}/?tab=profile`,
      completionUrl: `${origin}/?tab=profile&assinatura=retorno`,
      retryPolicy: { maxRetry: 3, retryEvery: 1 },
    }
    if (customerId) body.customerId = customerId

    const checkout = await abacate<any>('/subscriptions/create', { method: 'POST', body: JSON.stringify(body) })

    await supabase.from('profiles').update({
      abacate_customer_id: customerId,
      abacate_checkout_id: checkout.data.id,
      abacate_checkout_url: checkout.data.url,
      abacate_subscription_status: 'PENDING',
      assinatura_atualizada_em: new Date().toISOString(),
    }).eq('id', user.id)

    return json({ url: checkout.data.url, checkout_id: checkout.data.id })
  } catch (err) {
    console.error('abacatepay-checkout:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
