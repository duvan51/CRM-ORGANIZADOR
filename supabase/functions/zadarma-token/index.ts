import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to calculate MD5 and SHA1 HMAC for Zadarma
async function getMd5(text: string): Promise<string> {
    const data = new TextEncoder().encode(text);
    // En Deno, SubtleCrypto a veces no tiene MD5, usamos un fallback manual si es necesario
    const hashBuffer = await crypto.subtle.digest("MD5" as any, data);
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

    // IMPORTANTE: Zadarma requiere Base64 puro
    const uint8Array = new Uint8Array(signature);
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
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
            console.error("Missing Authorization header in request");
            return new Response(JSON.stringify({ error: "No se proporcionó token de autorización" }), { status: 401, headers: corsHeaders });
        }

        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        });

        // Get user session
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            console.error("Auth validation failed:", authError?.message || "User not found");
            return new Response(JSON.stringify({
                error: "Sesión inválida o expirada. Por favor, cierra sesión y vuelve a entrar.",
                details: authError?.message
            }), { status: 401, headers: corsHeaders });
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
            return new Response(JSON.stringify({
                error: "Zadarma no está configurado",
                details: `No se encontró configuración para clinicId: ${clinicId}. Por favor, guarda la configuración en el Admin Panel de nuevo.`
            }), { status: 400, headers: corsHeaders });
        }

        // Zadarma API call: GET /v1/webrtc/get_key
        const apiKey = config.api_key.trim();
        const apiSecret = config.api_secret.trim();

        const apiPath = "/v1/webrtc/get_key"; // Eliminado el slash final según documentación
        const sortedParams = "";
        const md5Params = await getMd5(sortedParams);
        const dataToSign = apiPath + sortedParams + md5Params;

        console.log(`DEBUG: Signing string: "${dataToSign}"`);
        const signature = await getHmacSha1(apiSecret, dataToSign);

        const zadarmaUrl = `https://api.zadarma.com${apiPath}`;
        console.log(`Calling Zadarma API: ${zadarmaUrl}`);

        const response = await fetch(zadarmaUrl, {
            method: 'GET',
            headers: {
                'Authorization': `${apiKey}:${signature}`
            }
        });

        if (!response.ok) {
            const rawError = await response.text();
            console.error("Zadarma API Error Response:", rawError);
            throw new Error(`Zadarma API error (${response.status}): ${rawError}`);
        }

        const data = await response.json();
        if (data.status === 'error') {
            throw new Error(`Zadarma Business Error: ${data.message || 'Unknown error'}`);
        }

        return new Response(JSON.stringify({
            key: data.key,
            sip: config.sip_user,
            status: 'success'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error("DEBUG - Zadarma Function Error:", error.message);
        return new Response(JSON.stringify({
            error: error.message,
            hint: "Verifica que el API Key y Secret en el Panel de Admin sean correctos."
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
