import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, PATCH, OPTIONS',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { action, base_url, api_key, body, method = 'GET', path } = await req.json()

        if (!base_url || !api_key) {
            throw new Error("Base URL and API Key are required")
        }

        const cleanBaseUrl = base_url.endsWith('/') ? base_url.slice(0, -1) : base_url
        const cleanPath = path.startsWith('/') ? path : `/${path}`
        const url = `${cleanBaseUrl}${cleanPath}`
        console.log(`Proxying ${method} request to: ${url}`)

        const options: any = {
            method,
            headers: {
                'Authorization': `Bearer ${api_key}`,
                'Content-Type': 'application/json'
            }
        }

        if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
            options.body = JSON.stringify(body)
        }

        const response = await fetch(url, options)
        const responseText = await response.text();
        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch (e) {
            responseData = { message: responseText };
        }

        return new Response(JSON.stringify(responseData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: response.status
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        })
    }
})
