import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } }
    )

    try {
        // 1. Obtener publicaciones pendientes enviables ahora
        const { data: pendingPosts, error: fetchError } = await supabaseClient
            .from('social_posts')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_at', new Date().toISOString())
            .limit(5);

        if (fetchError) throw fetchError;
        if (!pendingPosts || pendingPosts.length === 0) {
            return new Response(JSON.stringify({ message: "No pendings" }), { headers: corsHeaders });
        }

        for (const post of pendingPosts) {
            // Marcar como procesando
            await supabaseClient.from('social_posts').update({ status: 'processing' }).eq('id', post.id);

            const errors = [];
            const platformsDone = [];

            // Obtener tokens del tenant
            const { data: platforms } = await supabaseClient.from('social_platforms').select('*').eq('profile_id', post.profile_id);
            const { data: metaAccounts } = await supabaseClient.from('meta_social_accounts').select('*').eq('clinic_id', post.profile_id).eq('is_active', true);

            // --- TIKTOK PUBLICATION ---
            if (post.platforms.includes('tiktok')) {
                const tiktok = platforms?.find(p => p.platform_name === 'tiktok');
                if (tiktok?.access_token) {
                    try {
                        await publishToTikTok(tiktok.access_token, post);
                        platformsDone.push('tiktok');
                    } catch (err: any) { errors.push(`TikTok: ${err.message}`); }
                } else { errors.push("TikTok: No conectado."); }
            }

            // --- INSTAGRAM PUBLICATION ---
            if (post.platforms.includes('instagram')) {
                const ig = metaAccounts?.find(p => p.platform === 'instagram');
                if (ig) {
                    try {
                        const { data: metaCfg } = await supabaseClient.from('meta_ads_config').select('access_token').eq('clinic_id', post.profile_id).single();
                        await publishToInstagram(ig.access_token || metaCfg?.access_token, ig.account_id, post);
                        platformsDone.push('instagram');
                    } catch (err: any) { errors.push(`Instagram: ${err.message}`); }
                } else { errors.push("Instagram: No conectado."); }
            }

            // --- FACEBOOK PUBLICATION ---
            if (post.platforms.includes('facebook')) {
                const fb = metaAccounts?.find(p => p.platform === 'messenger');
                if (fb) {
                    try {
                        await publishToFacebook(fb.access_token, fb.account_id, post);
                        platformsDone.push('facebook');
                    } catch (err: any) { errors.push(`Facebook: ${err.message}`); }
                } else { errors.push("Facebook: No conectado."); }
            }

            // Actualizar estado final
            const finalStatus = errors.length === 0 ? 'published' : (platformsDone.length > 0 ? 'partially_published' : 'failed');
            await supabaseClient.from('social_posts').update({
                status: finalStatus,
                error_message: errors.join(' | '),
                published_at: finalStatus === 'published' ? new Date().toISOString() : null,
                metadata: { ...post.metadata, platforms_done: platformsDone }
            }).eq('id', post.id);
        }

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error: any) {
        return new Response(error.message, { status: 500, headers: corsHeaders })
    }
})

// --- HELPERS DE PUBLICACIÓN ---

async function publishToTikTok(token: string, post: any) {
    const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            post_info: { title: post.caption?.substring(0, 80), description: post.caption, privacy_level: "PUBLIC_TO_EVERYONE" },
            source: "PULL_FROM_URL",
            video_url: post.cloudinary_url
        })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
}

async function publishToInstagram(token: string, igId: string, post: any) {
    const isVideo = post.cloudinary_url.includes('.mp4');
    const container = await fetch(`https://graph.facebook.com/v18.0/${igId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            [isVideo ? 'video_url' : 'image_url']: post.cloudinary_url,
            caption: post.caption,
            media_type: isVideo ? 'REELS' : 'IMAGE',
            access_token: token
        })
    }).then(r => r.json());

    if (container.error) throw new Error(container.error.message);
    
    // Publicar (Instagram requiere un pequeño delay para procesar si es video)
    if (isVideo) await new Promise(r => setTimeout(r, 10000));
    
    const publish = await fetch(`https://graph.facebook.com/v18.0/${igId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: container.id, access_token: token })
    }).then(r => r.json());

    if (publish.error) throw new Error(publish.error.message);
}

async function publishToFacebook(token: string, pageId: string, post: any) {
    const isVideo = post.cloudinary_url.includes('.mp4');
    const endpoint = isVideo ? `/${pageId}/videos` : `/${pageId}/photos`;
    const res = await fetch(`https://graph.facebook.com/v18.0${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            [isVideo ? 'file_url' : 'url']: post.cloudinary_url,
            message: post.caption,
            access_token: token
        })
    }).then(r => r.json());
    if (res.error) throw new Error(res.error.message);
}
