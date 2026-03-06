import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to calculate MD5 and SHA1 HMAC for Zadarma
async function getMd5(text: string): Promise<string> {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest("MD5", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

async function getHmacSha1(key: string, data: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const dataToSign = encoder.encode(data);

    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, dataToSign);
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        // Validate headers
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            console.error("Missing Authorization header");
            return new Response(JSON.stringify({ error: "No se proporcionó token de autorización" }), { status: 401, headers: corsHeaders });
        }

        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        });

        // Get user session
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) {
            console.error("Auth error:", authError);
            return new Response(JSON.stringify({ error: "No autorizado o sesión expirada" }), { status: 401, headers: corsHeaders });
        }

        // Parse body
        const { clinicId } = await req.json();
        if (!clinicId) {
            return new Response(JSON.stringify({ error: "clinicId es requerido" }), { status: 400, headers: corsHeaders });
        }

        console.log(`Generating Zadarma token for user ${user.id} and clinic ${clinicId}`);

        // Use service role to fetch config
        const adminClient = createClient(supabaseUrl, supabaseServiceKey);

        const { data: config, error: configError } = await adminClient
            .from('zadarma_configs')
            .select('*')
            .eq('clinic_id', clinicId)
            .maybeSingle();

        if (configError) {
            console.error("Database error fetching config:", configError);
            throw new Error("Error interno al buscar configuración");
        }

        if (!config) {
            console.warn(`Zadarma not configured for clinic ${clinicId}`);
            return new Response(JSON.stringify({ error: "Zadarma no está configurado para esta clínica" }), { status: 404, headers: corsHeaders });
        }

        // Zadarma API call: GET /v1/webrtc/get_key/
        const apiPath = "/v1/webrtc/get_key/";
        const sortedParams = ""; // No params for this specific call
        const md5Params = await getMd5(sortedParams);
        const dataToSign = apiPath + sortedParams + md5Params;
        const signature = await getHmacSha1(config.api_secret, dataToSign);

        const zadarmaUrl = `https://api.zadarma.com${apiPath}`;
        console.log("Calling Zadarma API...");

        const response = await fetch(zadarmaUrl, {
            method: 'GET',
            headers: {
                'Authorization': `${config.api_key}:${signature}`
            }
        });

        if (!response.ok) {
            const rawError = await response.text();
            console.error("Zadarma API HTTP Error:", response.status, rawError);
            throw new Error(`Zadarma API respondió con error ${response.status}`);
        }

        const data = await response.json();
        console.log("Zadarma response received:", data.status);

        if (data.status === 'error') {
            console.error("Zadarma API Business Error:", data.message);
            throw new Error(data.message || "Error devuelto por la API de Zadarma");
        }

        return new Response(JSON.stringify({
            key: data.key,
            status: 'success'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error("Zadarma Edge Function Error:", error.message);
        return new Response(JSON.stringify({
            error: error.message,
            hint: "Verifica las credenciales de Zadarma en el Panel de Admin."
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
