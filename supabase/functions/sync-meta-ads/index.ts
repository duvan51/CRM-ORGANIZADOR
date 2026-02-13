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
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
        if (authError || !user) throw new Error('Unauthorized')

        const { data: profile } = await supabaseClient.from('profiles').select('clinic_id').eq('id', user.id).single()
        const clinicId = profile?.clinic_id || user.id

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

        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
})
