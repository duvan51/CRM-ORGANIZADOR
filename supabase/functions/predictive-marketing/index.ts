import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MIROFISH_URL = "http://72.62.163.204:5001/api/simulate";

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('No authorization header')

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { persistSession: false } }
        )

        // Verify user and get clinic_id
        const authClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )
        const { data: { user }, error: authError } = await authClient.auth.getUser()
        if (authError || !user) throw new Error('Unauthorized')

        const { data: userProfile } = await supabaseClient
            .from('profiles')
            .select('clinic_id')
            .eq('id', user.id)
            .single()

        const clinicId = userProfile?.clinic_id || user.id

        // Fetch credits from the OWNER of the clinic
        const { data: ownerProfile } = await supabaseClient
            .from('profiles')
            .select('predictive_credits')
            .eq('id', clinicId)
            .single()

        const currentCredits = ownerProfile?.predictive_credits || 0

        if (currentCredits <= 0) throw new Error('No tienes créditos suficientes para realizar esta simulación.')

        const body = await req.json()
        const { action, payload } = body

        if (action === 'simulate') {
            // 1. Send request to MiroFish VPS
            console.log("Invoking MiroFish Swarm Simulation...");
            
            // Structured prompt for Colombian market as requested
            const swarmPayload = {
                ...payload,
                market: "Colombia",
                currency: "COP",
                style: "Local Colombian Slang/Modisms",
                system_auth_key: Deno.env.get('MIROFISH_AUTH_SECRET') // Secret key shared with VPS
            };

            const authSecret = Deno.env.get('MIROFISH_AUTH_SECRET')
            const fetchHeaders: any = { 'Content-Type': 'application/json' }
            if (authSecret) {
                fetchHeaders['Authorization'] = `Bearer ${authSecret}`
            }

            const response = await fetch(MIROFISH_URL, {
                method: 'POST',
                headers: fetchHeaders,
                body: JSON.stringify(swarmPayload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                return new Response(JSON.stringify({ 
                    error: `MiroFish VPS Error (${response.status})`,
                    details: errorText.substring(0, 200) 
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const simResult = await response.json();

            // 2. Deduct credit
            const { error: updateError } = await supabaseClient
                .from('profiles')
                .update({ predictive_credits: currentCredits - 1 })
                .eq('clinic_id', clinicId);

            if (updateError) console.error("Credit deduction failed:", updateError);

            // 3. Store simulation in history
            const { error: storeError } = await supabaseClient
                .from('predictive_simulations')
                .insert({
                    clinic_id: clinicId,
                    user_id: user.id,
                    payload: payload,
                    result: simResult,
                    campaign_name: payload.campaignGoal + " - " + new Date().toLocaleDateString()
                });

            if (storeError) console.error("History storage failed:", storeError);

            return new Response(JSON.stringify(simResult), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
