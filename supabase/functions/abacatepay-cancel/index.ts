// Cancela a assinatura recorrente. O próprio usuário cancela a sua;
// o admin pode cancelar a de qualquer usuário enviando { user_id }.
// O acesso continua até o fim do período já pago (campo vencimento).
import {
  abacate, adminClient, aplicarAssinatura, corsHeaders, json, userFromRequest,
} from '../_shared/abacatepay.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    const user = await userFromRequest(req)
    if (!user) return json({ error: 'Não autenticado' }, 401)

    const supabase = adminClient()
    const body = await req.json().catch(() => ({}))
    let alvo = user.id

    if (body?.user_id && body.user_id !== user.id) {
      const { data: eu } = await supabase.from('profiles').select('role, email').eq('id', user.id).single()
      const isAdmin = eu?.role === 'admin' || eu?.email === 'anderlevita@gmail.com' || user.email === 'anderlevita@gmail.com'
      if (!isAdmin) return json({ error: 'Sem permissão' }, 403)
      alvo = body.user_id
    }

    const { data: perfil } = await supabase.from('profiles')
      .select('abacate_subscription_id').eq('id', alvo).single()
    if (!perfil?.abacate_subscription_id) return json({ error: 'Nenhuma assinatura encontrada.' }, 404)

    const r = await abacate<any>('/subscriptions/cancel', {
      method: 'POST',
      body: JSON.stringify({ id: perfil.abacate_subscription_id }),
    })
    await aplicarAssinatura(supabase, alvo, r.data)
    return json({ status: 'CANCELLED' })
  } catch (err) {
    console.error('abacatepay-cancel:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
