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

    const supabaseServer = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    try {
        const url = new URL(req.url)

        // 1. Handle Webhook Verification (GET)
        if (req.method === 'GET') {
            const mode = url.searchParams.get('hub.mode')
            const token = url.searchParams.get('hub.verify_token')
            const challenge = url.searchParams.get('hub.challenge')

            if (mode && token) {
                const { data: config } = await supabaseServer
                    .from('ai_agent_config')
                    .select('verify_token')
                    .eq('verify_token', token)
                    .single()

                if (config && mode === 'subscribe') {
                    return new Response(challenge, { status: 200 })
                }
            }
            return new Response('Verification failed', { status: 403 })
        }

        // 2. Handle Incoming Messages (POST)
        const body = await req.json()
        const isTest = body.is_test === true

        let text = ''
        let externalUserId = ''
        let phoneId = ''
        let clinicId = body.clinic_id

        if (isTest) {
            text = body.text
            externalUserId = 'test-user'
        } else {
            const entry = body.entry?.[0]
            const changes = entry?.changes?.[0]
            const value = changes?.value
            const message = value?.messages?.[0]

            if (!message) return new Response('No message found', { status: 200 })

            externalUserId = message.from
            text = message.text?.body
            phoneId = value?.metadata?.phone_number_id
        }

        if (!text) return new Response('No text to process', { status: 200 })

        // Find Clinic Config
        let configQuery = supabaseServer.from('ai_agent_config').select('*').eq('is_active', true)
        if (isTest && clinicId) {
            configQuery = configQuery.eq('clinic_id', clinicId)
        } else if (phoneId) {
            configQuery = configQuery.eq('phone_id', phoneId)
        } else {
            return new Response('Missing identification', { status: 200 })
        }

        const { data: config, error: configError } = await configQuery.single()

        if (!config || configError) {
            return new Response('Clinic config not found or inactive', { status: 200 })
        }

        // Fetch Services for Context
        const { data: services } = await supabaseServer
            .from('global_services')
            .select('id, nombre, precio_base, duracion_minutos, descripcion, parent_id, informacion_ia')
            .eq('clinic_id', config.clinic_id)

        const servicesContext = services?.length
            ? `\n\nSERVICIOS DISPONIBLES:\n${services.map(s => {
                const parent = s.parent_id ? services.find((p: any) => p.id === s.parent_id) : null;
                const name = parent ? `${s.nombre} (Variante de ${parent.nombre})` : s.nombre;
                const detailIa = s.informacion_ia ? `\n   - INFO EXPERTA/DETALLES: ${s.informacion_ia}` : '';
                return `- ${name}: $${s.precio_base} (${s.duracion_minutos} min). ${s.descripcion || ''}${detailIa}`;
            }).join('\n')}`
            : ''

        const systemPrompt = config.system_prompt + servicesContext

        let history = []
        let conversationId = null

        if (!isTest) {
            // Find or Create Conversation
            let { data: conversation, error: convError } = await supabaseServer
                .from('meta_conversations')
                .select('*')
                .eq('clinic_id', config.clinic_id)
                .eq('external_user_id', externalUserId)
                .single()

            if (convError && convError.code === 'PGRST116') {
                const { data: newConv } = await supabaseServer
                    .from('meta_conversations')
                    .insert({
                        clinic_id: config.clinic_id,
                        external_user_id: externalUserId,
                        platform: 'whatsapp',
                        status: 'ai_handling'
                    })
                    .select()
                    .single()
                conversation = newConv
            }

            if (!conversation || conversation.status === 'paused' || conversation.status === 'human_required') {
                return new Response('Conversation paused or human required', { status: 200 })
            }
            conversationId = conversation.id

            // Save User Message
            await supabaseServer.from('meta_messages').insert({
                conversation_id: conversationId,
                sender_type: 'user',
                content: text
            })

            // Get History
            const { data: histData } = await supabaseServer
                .from('meta_messages')
                .select('sender_type, content')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .limit(10)
            history = (histData || []).reverse()
        } else {
            history = [{ sender_type: 'user', content: text }]
        }

        const messagesForAI = [
            { role: 'system', content: systemPrompt },
            ...history.map(m => ({
                role: m.sender_type === 'user' ? 'user' : 'assistant',
                content: m.content
            }))
        ]

        // Call AI
        let aiResponse = "Lo siento, no pude procesar tu mensaje."
        if (config.provider === 'openai' && config.api_key) {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.api_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: config.model || 'gpt-3.5-turbo',
                    messages: messagesForAI
                })
            })
            const aiData = await res.json()
            if (aiData.choices?.[0]?.message?.content) {
                aiResponse = aiData.choices[0].message.content
            }
        }

        if (isTest) {
            return new Response(JSON.stringify({ aiResponse }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // Send Message back to Meta
        if (config.meta_access_token) {
            await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.meta_access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: externalUserId,
                    text: { body: aiResponse }
                })
            })
        }

        // Save AI Message History
        await supabaseServer.from('meta_messages').insert({
            conversation_id: conversationId,
            sender_type: 'ai',
            content: aiResponse
        })

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        console.error('Error handling request:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
