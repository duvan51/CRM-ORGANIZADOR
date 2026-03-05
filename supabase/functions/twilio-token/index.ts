import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import twilio from "npm:twilio"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const { data: { user } } = await supabaseClient.auth.getUser()
        if (!user) return new Response("Unauthorized", { status: 401, headers: corsHeaders })

        const { clinicId } = await req.json()
        if (!clinicId) throw new Error("clinicId is required")

        // Fetch Twilio config using service role to bypass RLS if needed, 
        // but here we can use the user's client if they have access.
        // However, configs might be restricted. Let's use service role for fetching the CONFIG ONLY if we trust the clinicId passed.
        // Better: check if the user belongs to that clinic.

        const { data: profile } = await supabaseClient.from('profiles').select('clinic_id').eq('id', user.id).single()
        if (!profile || (profile.clinic_id !== clinicId && user.id !== clinicId)) {
            throw new Error("You don't have access to this clinic's config")
        }

        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { data: config, error: configError } = await adminClient
            .from('twilio_configs')
            .select('*')
            .eq('clinic_id', clinicId)
            .single()

        if (configError || !config) {
            return new Response(JSON.stringify({ error: "Twilio not configured for this clinic" }), { status: 404, headers: corsHeaders })
        }

        const AccessToken = twilio.jwt.AccessToken;
        const VoiceGrant = AccessToken.VoiceGrant;

        const identity = `user_${user.id}`;

        const token = new AccessToken(
            config.account_sid,
            config.api_key_sid || config.account_sid,
            config.api_key_secret || config.auth_token,
            { identity }
        );

        const voiceGrant = new VoiceGrant({
            outgoingApplicationSid: config.twiml_app_sid,
            incomingAllow: true,
        });
        token.addGrant(voiceGrant);

        return new Response(JSON.stringify({ token: token.toJwt() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
