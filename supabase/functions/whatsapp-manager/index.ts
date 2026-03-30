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

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { persistSession: false } }
        )

        // Identify user and clinic
        const authClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )
        const { data: { user }, error: authError } = await authClient.auth.getUser()
        if (authError || !user) throw new Error('Unauthorized')

        const { data: profile } = await supabaseClient.from('profiles').select('clinic_id').eq('id', user.id).single()
        const clinicId = profile?.clinic_id || user.id

        const body = await req.json().catch(() => ({}))
        const { action } = body

        // Get Meta Config
        const { data: config } = await supabaseClient
            .from('meta_ads_config')
            .select('*')
            .eq('clinic_id', clinicId)
            .single()

        if (!config?.access_token) throw new Error('Meta Ads not configured for this clinic')

        const accessToken = config.access_token
        const wabaId = config.whatsapp_business_account_id
        const phoneId = config.whatsapp_phone_number_id

        if (action === 'fetch-templates') {
            if (!wabaId) throw new Error('WhatsApp Business Account ID not configured')
            
            const res = await fetch(`https://graph.facebook.com/v18.0/${wabaId}/message_templates?access_token=${accessToken}`)
            const data = await res.json()

            if (data.error) throw new Error(data.error.message)

            // Sync templates to DB
            const templates = data.data.map((t: any) => ({
                clinic_id: clinicId,
                meta_template_id: t.id,
                name: t.name,
                language: t.language,
                category: t.category,
                components: t.components,
                status: t.status
            }))

            if (templates.length > 0) {
                await supabaseClient
                    .from('whatsapp_templates')
                    .upsert(templates, { onConflict: 'clinic_id,meta_template_id' })
            }

            return new Response(JSON.stringify({ success: true, count: templates.length }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (action === 'send-campaign') {
            const { campaignId, recipients } = body // recipients: [{ phone, leadId, name }]
            if (!campaignId || !recipients || !phoneId) throw new Error('Missing parameters')

            const { data: campaign } = await supabaseClient
                .from('whatsapp_campaigns')
                .select('*, whatsapp_templates(*)')
                .eq('id', campaignId)
                .single()

            if (!campaign) throw new Error('Campaign not found')

            let sent = 0
            let failed = 0

            for (const recipient of recipients) {
                try {
                    const phone = recipient.phone.replace(/\D/g, '')
                    // Ensure phone has country code (Colombia 57 as default if 10 digits)
                    const fullPhone = phone.length === 10 ? `57${phone}` : phone

                    const templateRes = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            messaging_product: "whatsapp",
                            to: fullPhone,
                            type: "template",
                            template: {
                                name: campaign.whatsapp_templates.name,
                                language: { code: campaign.whatsapp_templates.language },
                                components: [
                                    {
                                        type: "body",
                                        parameters: [
                                            { type: "text", text: recipient.name || 'Cliente' }
                                        ]
                                    }
                                ]
                            }
                        })
                    })

                    const templateData = await templateRes.json()

                    if (templateData.error) {
                        throw new Error(templateData.error.message)
                    }

                    // Log success
                    await supabaseClient.from('whatsapp_campaign_logs').insert({
                        campaign_id: campaignId,
                        clinic_id: clinicId,
                        lead_id: recipient.leadId,
                        phone: fullPhone,
                        status: 'sent',
                        meta_message_id: templateData.messages?.[0]?.id
                    })
                    sent++
                } catch (err: any) {
                    await supabaseClient.from('whatsapp_campaign_logs').insert({
                        campaign_id: campaignId,
                        clinic_id: clinicId,
                        lead_id: recipient.leadId,
                        phone: recipient.phone,
                        status: 'failed',
                        error_message: err.message
                    })
                    failed++
                }
            }

            // Update campaign status
            await supabaseClient
                .from('whatsapp_campaigns')
                .update({
                    status: 'completed',
                    sent_count: sent,
                    failed_count: failed
                })
                .eq('id', campaignId)

            return new Response(JSON.stringify({ success: true, sent, failed }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
})
