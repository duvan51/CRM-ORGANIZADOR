import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY')
const CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET')
const REDIRECT_URI = Deno.env.get('TIKTOK_REDIRECT_URI')

serve(async (req) => {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state') // Contendrá el clinic_id
    
    // Configuración de Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
    })

    // 1. Paso Inicial: Redirigir a TikTok para Autorización
    if (!code) {
        const clinicId = url.searchParams.get('clinic_id');
        if (!clinicId) return new Response("Error: Se requiere clinic_id", { status: 400 });

        if (!CLIENT_KEY || !REDIRECT_URI) {
            return new Response("Error: Credenciales de TikTok no configuradas en secretos", { status: 500 });
        }

        const tiktokAuthUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
        tiktokAuthUrl.searchParams.set("client_key", CLIENT_KEY);
        tiktokAuthUrl.searchParams.set("scope", "user.info.basic,video.upload,video.publish");
        tiktokAuthUrl.searchParams.set("response_type", "code");
        tiktokAuthUrl.searchParams.set("redirect_uri", REDIRECT_URI);
        tiktokAuthUrl.searchParams.set("state", clinicId);

        return Response.redirect(tiktokAuthUrl.toString(), 302);
    }

    // 2. Paso de Intercambio: Código -> Token
    try {
        const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_key: CLIENT_KEY!,
                client_secret: CLIENT_SECRET!,
                code: code,
                grant_type: "authorization_code",
                redirect_uri: REDIRECT_URI!,
            })
        });

        const tokenData = await tokenRes.json();
        if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

        // 3. Obtener info del usuario para el perfil
        const userRes = await fetch("https://open.tiktokapis.com/v2/user/info/", {
            method: "GET",
            headers: { "Authorization": `Bearer ${accessToken}`, "fields": "open_id,display_name,avatar_url" }
        });
        const userData = await userRes.json();
        const tUser = userData.data?.user;

        // 4. Guardar en social_platforms (Multi-tenant)
        const { error: upsertError } = await supabaseClient
            .from('social_platforms')
            .upsert({
                profile_id: state, // state = clinic_id
                platform_name: 'tiktok',
                platform_user_id: tUser?.open_id,
                platform_user_name: tUser?.display_name || 'TikTok User',
                access_token: accessToken,
                refresh_token: refreshToken,
                token_expires_at: expiresAt,
                metadata: { ...userData.data }
            }, { onConflict: 'profile_id,platform_name' });

        if (upsertError) throw upsertError;

        // 5. Redirigir de vuelta al CRM
        const baseCrmUrl = "https://desarrollandoando.fun"; 
        return Response.redirect(`${baseCrmUrl}/#social?status=success&platform=tiktok`, 302);

    } catch (err: any) {
        console.error("TikTok OAuth Error:", err);
        return new Response(`Error: ${err.message}`, { status: 500 });
    }
})
