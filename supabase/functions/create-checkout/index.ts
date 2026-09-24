import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2022-11-15',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const { user_id, price_id, product_id, unit_amount, product_name } = await req.json()

    if (!user_id) {
      throw new Error('Missing user_id')
    }
    
    if (!price_id && !product_id) {
      throw new Error('Missing price_id or product_id')
    }

    let line_item;
    
    if (price_id && price_id.startsWith('price_')) {
      line_item = {
        price: price_id,
        quantity: 1,
      };
    } else if (product_id) {
      // Use price_data if product_id is provided
      line_item = {
        price_data: {
          currency: 'brl',
          product: product_id,
          unit_amount: unit_amount || 3000, // Default to 30.00 BRL
        },
        quantity: 1,
      };
    } else {
      // Fallback if they put product ID in price_id by mistake
      line_item = {
        price_data: {
          currency: 'brl',
          product: price_id,
          unit_amount: unit_amount || 3000,
        },
        quantity: 1,
      };
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'pix'],
      line_items: [line_item],
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/cancel`,
      metadata: {
        user_id: user_id,
      },
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
