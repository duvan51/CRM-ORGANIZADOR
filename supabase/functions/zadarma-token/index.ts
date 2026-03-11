import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import md5 from "https://esm.sh/md5@2.3.0"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "No se proporcionó token de autorización" }), { status: 401, headers: corsHeaders });
        }

        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) {
            return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers: corsHeaders });
        }

        const { clinicId } = await req.json();
        const adminClient = createClient(supabaseUrl, supabaseServiceKey);
        const { data: config, error: configError } = await adminClient
            .from('zadarma_configs')
            .select('*')
            .eq('clinic_id', clinicId)
            .maybeSingle();

        if (configError || !config) {
            throw new Error("Zadarma no está configurado para esta clínica");
        }

        const apiKey = config.api_key.trim();
        const apiSecret = config.api_secret.trim();
        const sipUser = config.sip_user?.trim() || "";

        const apiPath = "/v1/webrtc/get_key";
        const sortedParams = sipUser ? `sip=${sipUser}` : "";
        const md5Params = md5(sortedParams);
        const dataToSign = apiPath + sortedParams + md5Params;

        // 1. Calcular HMAC-SHA1 en formato HEXADECIMAL (requisito de Zadarma V1)
        const encoder = new TextEncoder();
        const keyData = encoder.encode(apiSecret);
        const msgData = encoder.encode(dataToSign);

        const cryptoKey = await crypto.subtle.importKey(
            "raw", keyData,
            { name: "HMAC", hash: "SHA-1" },
            false, ["sign"]
        );

        const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
        const signatureHex = Array.from(new Uint8Array(signatureBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");

        // 2. Base64 de la cadena HEX (No binaria, Zadarma V1 es especial)
        const signature = btoa(signatureHex);

        const zadarmaUrl = `https://api.zadarma.com${apiPath}${sortedParams ? '?' + sortedParams : ''}`;

        const response = await fetch(zadarmaUrl, {
            method: 'GET',
            headers: {
                'Authorization': `${apiKey}:${signature}`
            }
        });

        const result = await response.json();

        if (!response.ok || result.status === 'error') {
            throw new Error(`Zadarma API Error: ${result.message || response.statusText}`);
        }

        return new Response(JSON.stringify({
            key: result.key,
            sip: config.sip_user,
            status: 'success'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({
            error: error.message,
            hint: "Verifica API Key/Secret y que el dominio https://andocrm.cloud esté en el panel de Zadarma."
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
