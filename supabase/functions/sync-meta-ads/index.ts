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

        // Get User info
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
        if (authError || !user) throw new Error('Unauthorized')

        // Get Clinic/Profile info to ensure consistency
        const { data: profile } = await supabaseClient.from('profiles').select('clinic_id').eq('id', user.id).single()
        const clinicId = profile?.clinic_id || user.id

        const body = await req.json().catch(() => ({}))
        const { action } = body
        if (!action) throw new Error('Action is required')

        // Get Meta Config
        const { data: config, error: configError } = await supabaseClient
            .from('meta_ads_config')
            .select('*')
            .eq('clinic_id', clinicId)
            .maybeSingle()

        if (configError) throw new Error('Error al obtener configuración: ' + configError.message)
        if (!config?.access_token) {
            throw new Error('No se encontró configuración de Meta. Asegúrate de guardar el Token de Acceso en el panel antes de sincronizar.')
        }

        const accessToken = config.access_token

        if (action === 'discover-accounts') {
            // 1. Fetch Accounts from Meta
            const metaResponse = await fetch(`https://graph.facebook.com/v18.0/me/adaccounts?fields=name,account_id&access_token=${accessToken}`)
            const metaData = await metaResponse.json()

            if (metaData.error) throw new Error(metaData.error.message)

            // 2. Upsert to DB
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
            // 1. Get enabled accounts
            const { data: accounts } = await supabaseClient
                .from('meta_ads_accounts')
                .select('*')
                .eq('clinic_id', clinicId)
                .eq('is_sync_enabled', true)

            if (!accounts || accounts.length === 0) {
                return new Response(JSON.stringify({ success: true, message: 'No active accounts to sync' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }

            let totalSynced = 0

            for (const account of accounts) {
                console.log(`Sincronizando cuenta: ${account.ad_account_id}`);

                // 1. Fetch campaigns WITH effective_status
                const campaignsRes = await fetch(
                    `https://graph.facebook.com/v18.0/${account.ad_account_id}/campaigns?fields=id,name,effective_status&limit=100&access_token=${accessToken}`
                );
                const campaignsData = await campaignsRes.json();

                if (campaignsData.data) {
                    const baseCampaigns = campaignsData.data.map((c: any) => ({
                        clinic_id: clinicId,
                        ad_account_id: account.ad_account_id,
                        campaign_id: c.id,
                        campaign_name: c.name,
                        entity_type: 'campaign',
                        status: c.effective_status,
                        spend: 0,
                        impressions: 0,
                        clicks: 0,
                        date: new Date().toISOString().split('T')[0]
                    }));
                    await supabaseClient.from('meta_ads_performance').upsert(baseCampaigns, { onConflict: 'clinic_id,campaign_id,date,entity_type' });
                    totalSynced += baseCampaigns.length;

                    // 2. Fetch Adsets for these campaigns
                    const adsetsRes = await fetch(
                        `https://graph.facebook.com/v18.0/${account.ad_account_id}/adsets?fields=id,name,campaign_id,effective_status&limit=250&access_token=${accessToken}`
                    );
                    const adsetsData = await adsetsRes.json();
                    if (adsetsData.data) {
                        const baseAdsets = adsetsData.data.map((a: any) => ({
                            clinic_id: clinicId,
                            ad_account_id: account.ad_account_id,
                            campaign_id: a.id,
                            campaign_name: a.name,
                            entity_type: 'adset',
                            status: a.effective_status,
                            parent_id: a.campaign_id,
                            spend: 0,
                            impressions: 0,
                            clicks: 0,
                            date: new Date().toISOString().split('T')[0]
                        }));
                        await supabaseClient.from('meta_ads_performance').upsert(baseAdsets, { onConflict: 'clinic_id,campaign_id,date,entity_type' });
                        totalSynced += baseAdsets.length;
                    }
                }

                // 3. Update Insights (spend/clicks)
                const insightsRes = await fetch(
                    `https://graph.facebook.com/v18.0/${account.ad_account_id}/insights?fields=campaign_id,campaign_name,spend,impressions,clicks&level=campaign&date_preset=last_30d&access_token=${accessToken}`
                );
                const insightsData = await insightsRes.json();

                if (insightsData.data) {
                    for (const item of insightsData.data) {
                        await supabaseClient.from('meta_ads_performance').update({
                            spend: parseFloat(item.spend || 0),
                            impressions: parseInt(item.impressions || 0),
                            clicks: parseInt(item.clicks || 0),
                        }).eq('clinic_id', clinicId).eq('campaign_id', item.campaign_id).eq('date', new Date().toISOString().split('T')[0]).eq('entity_type', 'campaign');
                    }
                }
            }

            return new Response(JSON.stringify({ success: true, synced_campaigns: totalSynced }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
