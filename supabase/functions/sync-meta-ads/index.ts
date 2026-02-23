import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('No authorization header')

        // 1. Cliente para verificar al usuario
        const authClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )
        const { data: { user }, error: authError } = await authClient.auth.getUser()
        if (authError || !user) {
            console.error("Auth Error details:", authError);
            throw new Error('Unauthorized: Tu sesión ha expirado o es inválida. Por favor, cierra sesión y vuelve a entrar al CRM.');
        }

        // 2. Cliente con Llave Maestra para operaciones de DB (Sincronización)
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { persistSession: false } }
        )

        const { data: profile } = await supabaseClient.from('profiles').select('clinic_id').eq('id', user.id).single()
        const clinicId = profile?.clinic_id || user.id

        // --- FUNCIÓN AUXILIAR PARA NOTIFICAR REALTIME ---
        const notifyRealtime = async (cId: string, cvId: string) => {
            try {
                const channel = supabaseClient.channel(`meta-clean-${cId}`);
                await channel.send({
                    type: 'broadcast',
                    event: 'CHATS_UPDATE',
                    payload: { conversation_id: cvId }
                });
                console.log(`📢 Realtime Broadcast enviado a: meta-clean-${cId}`);
            } catch (e) {
                console.error("Error enviando broadcast:", e);
            }
        };

        const body = await req.json().catch(() => ({}))
        const { action, startDate, endDate } = body
        if (!action) throw new Error('Action is required')

        const { data: config, error: configError } = await supabaseClient
            .from('meta_ads_config')
            .select('*')
            .eq('clinic_id', clinicId)
            .maybeSingle()

        if (configError) throw new Error('Error al obtener configuración: ' + configError.message)
        if (!config?.access_token) {
            throw new Error('No se encontró configuración de Meta.')
        }

        const accessToken = config.access_token

        if (action === 'exchange-token') {
            const shortLivedToken = body.shortLivedToken
            if (!shortLivedToken) throw new Error('shortLivedToken is required')

            const appId = Deno.env.get('FACEBOOK_APP_ID') || '850133951397257'
            const appSecret = Deno.env.get('FACEBOOK_APP_SECRET') || 'a8ae91262d9867dfb6cb611c4e42b369'
            // Nota: Se recomienda configurar estos como secrets en Supabase:
            // supabase secrets set FACEBOOK_APP_ID=... FACEBOOK_APP_SECRET=...

            const exchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`

            const exchangeRes = await fetch(exchangeUrl)
            const exchangeData = await exchangeRes.json()

            if (exchangeData.error) throw new Error(exchangeData.error.message)

            const longLivedToken = exchangeData.access_token

            // Opcionalmente guardar el token de una vez
            const { error: updateError } = await supabaseClient
                .from('meta_ads_config')
                .upsert({
                    clinic_id: clinicId,
                    access_token: longLivedToken,
                    is_active: true
                }, { onConflict: 'clinic_id' })

            if (updateError) throw updateError

            return new Response(JSON.stringify({ success: true, access_token: longLivedToken }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (action === 'discover-accounts') {
            const metaResponse = await fetch(`https://graph.facebook.com/v18.0/me/adaccounts?fields=name,account_id&access_token=${accessToken}`)
            const metaData = await metaResponse.json()
            if (metaData.error) throw new Error(metaData.error.message)

            const accountsToUpsert = metaData.data.map((acc: any) => ({
                clinic_id: clinicId,
                ad_account_id: `act_${acc.account_id}`,
                name: acc.name,
            }))

            const { error: upsertError } = await supabaseClient
                .from('meta_ads_accounts')
                .upsert(accountsToUpsert, { onConflict: 'clinic_id,ad_account_id' })

            if (upsertError) throw upsertError

            return new Response(JSON.stringify({ success: true, count: accountsToUpsert.length }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (action === 'sync-performance') {
            const { data: accounts } = await supabaseClient
                .from('meta_ads_accounts')
                .select('*')
                .eq('clinic_id', clinicId)
                .eq('is_sync_enabled', true)

            if (!accounts || accounts.length === 0) {
                return new Response(JSON.stringify({ success: true, message: 'No hay cuentas activas para sincronizar.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }

            let totalSynced = 0
            const todayStr = new Date().toISOString().split('T')[0]
            let sinceDate = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            let untilDate = endDate || todayStr

            const diagnostics: any[] = []

            for (const account of accounts) {
                try {
                    // 1. Fetch Campaigns Metadata
                    const campaignsRes = await fetch(`https://graph.facebook.com/v18.0/${account.ad_account_id}/campaigns?fields=id,name,effective_status&limit=500&access_token=${accessToken}`);
                    const campaignsData = await campaignsRes.json();

                    if (campaignsData.error) {
                        diagnostics.push({ account: account.name, error: campaignsData.error.message });
                        continue;
                    }

                    const campaignsMap = new Map();
                    if (campaignsData.data) {
                        campaignsData.data.forEach((c: any) => campaignsMap.set(c.id, c));
                    }

                    // 2. Fetch Insights (Added 'actions' for conversations)
                    const insightsRes = await fetch(
                        `https://graph.facebook.com/v18.0/${account.ad_account_id}/insights?fields=campaign_id,spend,impressions,clicks,actions,date_start&level=campaign&time_range=%7B%22since%22%3A%22${sinceDate}%22%2C%22until%22%3A%22${untilDate}%22%7D&time_increment=1&limit=2500&access_token=${accessToken}`
                    );
                    const insightsData = await insightsRes.json();

                    if (insightsData.data) {
                        const rows = insightsData.data.map((item: any) => {
                            const metaC = campaignsMap.get(item.campaign_id);

                            // Extraer conversaciones iniciadas (Sumar todas las variaciones de mensajería)
                            let convs = 0;
                            if (item.actions) {
                                item.actions.forEach((a: any) => {
                                    if (a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
                                        a.action_type === 'messaging_conversation_started_7d') {
                                        convs += parseInt(a.value || 0);
                                    }
                                });
                            }

                            return {
                                clinic_id: clinicId,
                                ad_account_id: account.ad_account_id,
                                campaign_id: item.campaign_id,
                                campaign_name: metaC?.name || 'Campaña Desconocida',
                                entity_type: 'campaign',
                                status: metaC?.effective_status || 'ACTIVE',
                                spend: parseFloat(item.spend || 0),
                                impressions: parseInt(item.impressions || 0),
                                clicks: parseInt(item.clicks || 0),
                                conversations_count: convs,
                                date: item.date_start
                            };
                        });

                        if (rows.length > 0) {
                            const { error: upsertErr } = await supabaseClient.from('meta_ads_performance').upsert(rows, { onConflict: 'clinic_id,campaign_id,date,entity_type' });
                            if (!upsertErr) totalSynced += rows.length;
                        }
                    }

                    // 3. Adsets (Simplified for brevity, following same pattern)
                    const adsetInsightsRes = await fetch(
                        `https://graph.facebook.com/v18.0/${account.ad_account_id}/insights?fields=adset_id,campaign_id,spend,impressions,clicks,actions,date_start&level=adset&time_range=%7B%22since%22%3A%22${sinceDate}%22%2C%22until%22%3A%22${untilDate}%22%7D&time_increment=1&limit=2500&access_token=${accessToken}`
                    );
                    const adsetInsightsData = await adsetInsightsRes.json();
                    if (adsetInsightsData.data) {
                        const aRows = adsetInsightsData.data.map((item: any) => {
                            let convs = 0;
                            if (item.actions) {
                                item.actions.forEach((a: any) => {
                                    if (a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
                                        a.action_type === 'messaging_conversation_started_7d') {
                                        convs += parseInt(a.value || 0);
                                    }
                                });
                            }
                            return {
                                clinic_id: clinicId,
                                ad_account_id: account.ad_account_id,
                                campaign_id: item.adset_id,
                                campaign_name: 'Adset ' + item.adset_id,
                                entity_type: 'adset',
                                parent_id: item.campaign_id,
                                spend: parseFloat(item.spend || 0),
                                impressions: parseInt(item.impressions || 0),
                                clicks: parseInt(item.clicks || 0),
                                conversations_count: convs,
                                date: item.date_start
                            };
                        });
                        if (aRows.length > 0) {
                            await supabaseClient.from('meta_ads_performance').upsert(aRows, { onConflict: 'clinic_id,campaign_id,date,entity_type' });
                        }
                    }

                    diagnostics.push({ account: account.name, status: 'OK' });
                } catch (e) {
                    diagnostics.push({ account: account.name, error: e.message });
                }
            }

            return new Response(JSON.stringify({ success: true, synced_rows: totalSynced, range: `${sinceDate} a ${untilDate}`, diagnostics }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (action === 'sync-conversations') {
            const { data: socialAccounts } = await supabaseClient
                .from('meta_social_accounts')
                .select('*')
                .eq('clinic_id', clinicId)
                .eq('is_active', true);

            if (!socialAccounts || socialAccounts.length === 0) {
                throw new Error('No hay páginas de Messenger/IG conectadas.');
            }

            let totalNewMessages = 0;
            const diagnostics: any[] = [];

            for (const acc of socialAccounts) {
                try {
                    const pageToken = acc.access_token || accessToken;
                    const platform = acc.platform;

                    console.log(`Syncing ${platform} for account ${acc.account_id}`);

                    const convRes = await fetch(`https://graph.facebook.com/v18.0/${acc.account_id}/conversations?fields=id,participants,updated_time&access_token=${pageToken}`);
                    const convData = await convRes.json();

                    if (convData.error) {
                        diagnostics.push({ account: acc.name, error: convData.error.message });
                        continue;
                    }

                    const rawConvs = convData.data || [];
                    let accConvs = 0;

                    for (const conv of rawConvs) {
                        const participant = conv.participants?.data?.find((p: any) => p.id !== acc.account_id);
                        const externalUserId = participant?.id || 'unknown';
                        const externalUserName = participant?.name || 'Usuario Meta';

                        const { data: dbConv, error: convErr } = await supabaseClient
                            .from('meta_conversations')
                            .upsert({
                                clinic_id: clinicId,
                                external_user_id: externalUserId,
                                // Hacemos el nombre opcional por si la columna no existe aún
                                ...(externalUserName ? { external_user_name: externalUserName } : {}),
                                platform: platform,
                                last_message_at: conv.updated_time
                            }, { onConflict: 'clinic_id,external_user_id,platform' })
                            .select()
                            .single();

                        if (convErr) {
                            diagnostics.push({
                                account: acc.name,
                                conv_id: conv.id,
                                db_error: convErr.message,
                                db_details: convErr.details,
                                clinic_id_used: clinicId
                            });
                            continue;
                        }

                        if (!dbConv) continue;

                        const msgRes = await fetch(`https://graph.facebook.com/v18.0/${conv.id}/messages?fields=id,message,created_time,from,to&limit=20&access_token=${pageToken}`);
                        const msgData = await msgRes.json();

                        if (msgData.error) {
                            diagnostics.push({
                                account: acc.name || acc.account_id,
                                msg_fetch_error: msgData.error.message
                            });
                            continue;
                        }

                        if (msgData.data && msgData.data.length > 0) {
                            const messagesToInsert = msgData.data
                                .filter((m: any) => m.message)
                                .map((m: any) => ({
                                    id: m.id,
                                    conversation_id: dbConv.id,
                                    sender_id: m.from.id,
                                    sender_type: m.from.id === acc.account_id ? 'human' : 'user',
                                    content: m.message,
                                    platform: platform,
                                    created_at: m.created_time
                                }));

                            for (const msg of messagesToInsert) {
                                const { error: msgErr } = await supabaseClient
                                    .from('meta_messages')
                                    .upsert({
                                        conversation_id: msg.conversation_id,
                                        sender_id: msg.sender_id,
                                        sender_type: msg.sender_type,
                                        content: msg.content,
                                        platform: msg.platform,
                                        created_at: msg.created_at,
                                        clinic_id: clinicId,
                                        external_id: msg.id
                                    }, { onConflict: 'external_id' });

                                if (!msgErr) {
                                    totalNewMessages++;
                                } else {
                                    console.error("Error guardando mensaje:", msgErr.message);
                                    diagnostics.push({
                                        account: acc.name || acc.account_id,
                                        msg_error: msgErr.message
                                    });
                                }
                            }
                            // Notificar tras procesar los mensajes de una conversación
                            await notifyRealtime(clinicId, dbConv.id);
                            accConvs++;
                        }
                    }
                    diagnostics.push({
                        account: acc.name || acc.account_id,
                        platform,
                        conversations_found: rawConvs.length,
                        messages_synced: accConvs
                    });
                } catch (e: any) {
                    diagnostics.push({
                        account: acc.name || acc.account_id,
                        error: e.message
                    });
                }
            }

            return new Response(JSON.stringify({ success: true, count: totalNewMessages, diagnostics }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
})
