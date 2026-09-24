import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return new Response('No signature', { status: 400 })
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2022-11-15',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.text()
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
    )

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.metadata?.user_id || session.client_reference_id

      if (userId) {
        // Update profile
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update({ 
            status_pagamento: 'PRO',
            plan: 'Pro',
            plano_tipo: 'pro', 
            plano_status: 'ativo',
            vencimento: null
          })
          .eq('id', userId)

        if (profileError) {
          console.error(`Error updating profile: ${profileError.message}`)
          throw profileError
        }

        // Log payment
        const { error: logError } = await supabaseAdmin
          .from('pagamentos_log')
          .insert({
            user_id: userId,
            stripe_session_id: session.id,
            amount: session.amount_total,
            currency: session.currency,
            status: 'completed',
            metadata: session.metadata
          })
        
        if (logError) {
          console.error(`Error logging payment: ${logError.message}`)
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }
})
