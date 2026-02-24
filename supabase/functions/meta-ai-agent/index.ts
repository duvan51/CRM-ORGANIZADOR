import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

serve(async (req) => {
    // 1. Manejo de Preflight (OPTIONS)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const supabaseServer = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    try {
        const url = new URL(req.url)

        // 2. Verificación de Webhook (GET)
        if (req.method === 'GET') {
            const mode = url.searchParams.get('hub.mode')
            const token = url.searchParams.get('hub.verify_token')
            const challenge = url.searchParams.get('hub.challenge')

            console.log(`🔍 Intentando verificar Webhook: mode=${mode}, token=${token}`);

            // Aceptamos tu token directamente como respaldo de emergencia
            if (mode === 'subscribe' && token === 'duvan1234789149') {
                console.log("✅ Verificación exitosa (Token directo)");
                return new Response(challenge, { status: 200, headers: corsHeaders })
            }

            if (mode && token) {
                const { data: config } = await supabaseServer
                    .from('ai_agent_config')
                    .select('verify_token')
                    .eq('verify_token', token)
                    .single()

                if (config && mode === 'subscribe') {
                    return new Response(challenge, { status: 200, headers: corsHeaders })
                }
            }
            return new Response(`Verification failed. Mode: ${mode}, Token: ${token}`, { status: 403, headers: corsHeaders })
        }

        // 3. Procesamiento de Mensajes (POST)
        const body = await req.json()
        console.log("📦 NEW WEBHOOK EVENT RECEIVED!");
        console.log("📦 FULL BODY:", JSON.stringify(body, null, 2));

        const isTest = body.is_test === true
        const isHumanReply = body.is_human_reply === true

        let text = ''
        let externalUserId = ''
        let phoneId = ''
        let recipientId = ''
        let platform = 'whatsapp'
        let clinicId = body.clinic_id
        let pageAccessToken = ''

        let metaMessageId = '';
        if (isHumanReply) {
            text = body.text
            externalUserId = body.external_user_id
            platform = body.platform || 'whatsapp'
        } else if (isTest) {
            text = body.text
            externalUserId = 'test-user'
        } else {
            if (body.object === 'page' || body.object === 'instagram') {
                const entry = body.entry?.[0]
                const messaging = entry?.messaging?.[0]
                metaMessageId = messaging?.message?.mid || messaging?.message?.id || messaging?.id || '';
                platform = body.object === 'page' ? 'messenger' : 'instagram'
                recipientId = messaging?.recipient?.id || entry?.id || '';
                externalUserId = messaging?.sender?.id || '';
                text = messaging?.message?.text || '';
            } else {
                const entry = body.entry?.[0]
                const changes = entry?.changes?.[0]
                const value = changes?.value
                const message = value?.messages?.[0]
                metaMessageId = message?.id || '';
                externalUserId = message?.from || '';
                text = message?.text?.body || message?.button?.text || '';
                phoneId = value?.metadata?.phone_number_id || '';
                platform = 'whatsapp'
            }
        }

        console.log(`📩 Webhook recibido: Platform=${platform}, Recipient=${recipientId}, Phone=${phoneId}, MsgId=${metaMessageId}`);

        // --- FUNCIÓN AUXILIAR PARA NOTIFICAR REALTIME ---
        const notifyRealtime = async (cId: string, cvId: string) => {
            try {
                if (!cId) {
                    console.error("⚠️ No se puede notificar Realtime: cId es nulo");
                    return;
                }
                const channel = supabaseServer.channel(`meta-clean-${cId}`);
                await channel.send({
                    type: 'broadcast',
                    event: 'CHATS_UPDATE',
                    payload: { conversation_id: cvId, timestamp: new Date().toISOString() }
                });
                console.log(`📢 Realtime Broadcast enviado a: meta-clean-${cId} (Conv: ${cvId})`);
            } catch (e) {
                console.error("Error enviando broadcast:", e);
            }
        };

        if (!text) return new Response('No text to process', { status: 200, headers: corsHeaders })

        // Buscar Configuración de la Clínica
        let config;
        let targetClinicId = clinicId;

        if ((isTest || isHumanReply) && clinicId) {
            const { data } = await supabaseServer.from('ai_agent_config').select('*').eq('clinic_id', clinicId).single()
            config = data
            targetClinicId = clinicId;

            if (isHumanReply && (platform === 'messenger' || platform === 'instagram')) {
                const { data: socialAcc } = await supabaseServer
                    .from('meta_social_accounts')
                    .select('access_token, account_id')
                    .eq('clinic_id', clinicId)
                    .eq('platform', platform)
                    .limit(1)
                    .single()
                if (socialAcc) {
                    pageAccessToken = socialAcc.access_token
                    recipientId = socialAcc.account_id
                }
            } else if (isHumanReply && platform === 'whatsapp') {
                phoneId = config.phone_id
            }
        } else if (platform === 'whatsapp' && phoneId) {
            // Caso WhatsApp: Buscamos por phone_id
            const { data } = await supabaseServer.from('ai_agent_config').select('*').eq('phone_id', phoneId).eq('is_active', true).single()
            config = data
            targetClinicId = config?.clinic_id;
        } else if (recipientId) {
            // Caso Messenger/Instagram: Buscamos por el ID de la cuenta vinculado
            const { data: socialAcc } = await supabaseServer
                .from('meta_social_accounts')
                .select('clinic_id')
                .eq('account_id', recipientId)
                .single()

            if (socialAcc) {
                targetClinicId = socialAcc.clinic_id;
                const { data: aiConfig } = await supabaseServer.from('ai_agent_config').select('*').eq('clinic_id', targetClinicId).single()
                config = aiConfig;

                // Buscar el token de acceso específico para esta cuenta
                const { data: specificAcc } = await supabaseServer
                    .from('meta_social_accounts')
                    .select('access_token')
                    .eq('account_id', recipientId)
                    .single()
                pageAccessToken = specificAcc?.access_token || '';
            }
        }

        if (!targetClinicId) {
            return new Response('Clinic not found', { status: 200, headers: corsHeaders })
        }

        let aiResponse = "";
        let conversationId = null;

        if (!config) {
            // Fallback: Si no hay IA activa, al menos guardamos el mensaje para el CRM
            aiResponse = ""; // No habrá respuesta automática
        }

        if (isHumanReply) {
            aiResponse = text;
            const { data: conv } = await supabaseServer
                .from('meta_conversations')
                .select('id')
                .eq('clinic_id', targetClinicId)
                .eq('external_user_id', externalUserId)
                .eq('platform', platform)
                .single();
            conversationId = conv?.id;
        } else {
            // --- Lógica del Agente IA (Tools) ---
            let history = []

            if (!isTest) {
                let { data: conversation, error: convError } = await supabaseServer
                    .from('meta_conversations')
                    .select('*')
                    .eq('clinic_id', targetClinicId)
                    .eq('external_user_id', externalUserId)
                    .eq('platform', platform)
                    .maybeSingle();

                if (!conversation) {
                    const { data: newConv } = await supabaseServer
                        .from('meta_conversations')
                        .insert({
                            clinic_id: targetClinicId,
                            external_user_id: externalUserId,
                            platform: platform,
                            status: 'ai_handling'
                        })
                        .select()
                        .single()
                    conversation = newConv
                }

                conversationId = conversation.id
                const finalMsgId = metaMessageId || `msg_${Date.now()}`;

                // --- ARREGLO: GUARDAR MENSAJE (Con clinic_id para Realtime) ---
                if (!targetClinicId && conversation.clinic_id) {
                    targetClinicId = conversation.clinic_id;
                }

                console.log(`💾 Guardando mensaje en DB: Platform=${platform}, Clinic=${targetClinicId}, Conv=${conversationId}`);

                const { error: msgInsertError } = await supabaseServer.from('meta_messages').upsert({
                    conversation_id: conversationId,
                    sender_id: externalUserId,
                    sender_type: 'user',
                    content: text,
                    platform: platform,
                    clinic_id: targetClinicId,
                    external_id: finalMsgId
                }, { onConflict: 'external_id' });

                if (msgInsertError) {
                    console.error("❌ Error guardando mensaje:", msgInsertError.message);
                }

                await supabaseServer.from('meta_conversations').update({
                    last_message_at: new Date().toISOString()
                }).eq('id', conversationId);

                // Notificar cambio
                await notifyRealtime(targetClinicId, conversationId);

                if (conversation.status === 'paused' || conversation.status === 'human_required') {
                    console.log("ℹ️ Conversación en modo humano o pausada. No respondemos con IA.");
                    return new Response('Mensaje guardado (modo humano)', { status: 200, headers: corsHeaders })
                }

                const { data: histData } = await supabaseServer
                    .from('meta_messages')
                    .select('sender_type, content')
                    .eq('conversation_id', conversationId)
                    .order('created_at', { ascending: false })
                    .limit(10)
                history = (histData || []).reverse()
            } else {
                // In test mode, we accept history from the body to maintain context in the simulator
                history = body.history || [{ sender_type: 'user', content: text }]
            }

            const tools = [
                {
                    type: "function",
                    function: {
                        name: "get_service_by_problem",
                        description: "Busca servicios médicos basados en síntomas y ciudad.",
                        parameters: {
                            type: "object",
                            properties: {
                                problem: { type: "string" },
                                city: { type: "string" }
                            },
                            required: ["problem", "city"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_available_days",
                        description: "Busca qué días de la próxima semana tienen citas disponibles. Úsalo cuando el usuario pregunta '¿qué días tienes?' o '¿cuándo puedo ir?'.",
                        parameters: {
                            type: "object",
                            properties: {
                                service_id: { type: "integer" },
                                agenda_id: { type: "integer" }
                            },
                            required: ["service_id", "agenda_id"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_availability",
                        description: "Consulta las horas disponibles para un día específico (YYYY-MM-DD). Úsalo SOLO después de que el usuario haya elegido un día.",
                        parameters: {
                            type: "object",
                            properties: {
                                service_id: { type: "integer" },
                                agenda_id: { type: "integer" },
                                date: { type: "string", description: "Fecha en formato YYYY-MM-DD" }
                            },
                            required: ["service_id", "agenda_id", "date"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "create_appointment",
                        description: "Agendar la cita final con los datos del paciente.",
                        parameters: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                phone: { type: "string" },
                                service_id: { type: "integer" },
                                agenda_id: { type: "integer" },
                                date: { type: "string" },
                                time: { type: "string" },
                                notes: { type: "string" }
                            },
                            required: ["name", "phone", "service_id", "agenda_id", "date", "time"]
                        }
                    }
                }
            ];

            const now = new Date();
            const currentDateStr = now.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const currentTimeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

            const systemPrompt = `${config.system_prompt}
        FECHA ACTUAL: ${currentDateStr}, ${currentTimeStr}.
        ERES UN AGENTE MÉDICO DE VENTAS. Tu objetivo es VENDER y AGENDAR.
        
        FLUJO DE TRABAJO:
        1. Identifica el síntoma y la ciudad.
        2. Busca servicios con 'get_service_by_problem'.
        3. IMPORTANTE: Si no encuentras un servicio específico para el síntoma (ej: gripe, dolor muscular), DEBES ofrecer una 'Consulta Médica General' o 'Valoración' como el primer paso necesario para que un médico lo diagnostique. ¡Nunca digas que no puedes ayudar!
        4. Cuando el usuario acepte el servicio, usa 'get_available_days' para ver qué días hay citas.
        5. Una vez el usuario elija UN DÍA, usa 'get_availability' para las horas.
        6. No muestres horas hasta que el usuario confirme el día.
        
        REGLAS:
        - Siempre menciona el Precio al inicio.
        - Sé breve. Siempre usa "||" para separar mensajes cortos.
        - Si algo falla o no sabes qué responder, di: "Ya en un momento te ayudo a solucionar..."
        - Traduce términos como "sábado" a fechas YYYY-MM-DD usando la FECHA ACTUAL.`

            const messagesForAI = [
                { role: 'system', content: systemPrompt },
                ...history.map(m => ({
                    role: m.sender_type === 'user' ? 'user' : 'assistant',
                    content: m.content
                }))
            ]

            let aiResponse = "Ya en un momento te ayudo a solucionar...";
            let retryCount = 0;
            let currentMessage = null;

            while (retryCount < 5) { // Aumentamos retintentos para flujos complejos
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${config.api_key}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: config.model || 'gpt-4o-mini',
                        messages: messagesForAI,
                        tools: tools,
                        tool_choice: "auto"
                    })
                });

                const aiData = await res.json();

                if (aiData.error) {
                    aiResponse = `Error de OpenAI: ${aiData.error.message}`;
                    break;
                }

                currentMessage = aiData.choices?.[0]?.message;

                if (!currentMessage) {
                    aiResponse = "No pude obtener una respuesta de la inteligencia artificial.";
                    break;
                }

                if (currentMessage.tool_calls) {
                    messagesForAI.push(currentMessage);

                    for (const toolCall of currentMessage.tool_calls) {
                        const funcName = toolCall.function.name;
                        let args;
                        try {
                            args = JSON.parse(toolCall.function.arguments);
                        } catch (e) {
                            console.error("Error parsing args:", e);
                            continue;
                        }

                        let result;

                        if (funcName === 'get_service_by_problem') {
                            const { data } = await supabaseServer
                                .from('agendas')
                                .select(`
                                id, name, ciudad, 
                                agenda_services(precio_final, global_services(*))
                            `)
                                .eq('clinic_id', config.clinic_id)
                                .ilike('ciudad', `%${args.city}%`);

                            let services: any[] = [];
                            data?.forEach(ag => {
                                ag.agenda_services?.forEach((as: any) => {
                                    const gs = as.global_services;
                                    if (gs.nombre.toLowerCase().includes(args.problem.toLowerCase()) ||
                                        (gs.informacion_ia && gs.informacion_ia.toLowerCase().includes(args.problem.toLowerCase()))) {
                                        services.push({
                                            id: gs.id,
                                            nombre: gs.nombre,
                                            precio: as.precio_final || gs.precio_descuento || gs.precio_base,
                                            agenda_id: ag.id,
                                            agenda_nombre: ag.name,
                                            ciudad: ag.ciudad,
                                            detalles: gs.informacion_ia || gs.descripcion
                                        });
                                    }
                                });
                            });

                            if (services.length === 0) {
                                data?.forEach(ag => {
                                    ag.agenda_services?.forEach((as: any) => {
                                        const gs = as.global_services;
                                        const n = gs.nombre.toLowerCase();
                                        const isGeneral = n.includes('consulta') ||
                                            n.includes('valoración') ||
                                            n.includes('general') ||
                                            n.includes('medica') ||
                                            n.includes('doctor') ||
                                            n.includes('cita');

                                        if (isGeneral) {
                                            services.push({
                                                id: gs.id, nombre: gs.nombre, precio: as.precio_final || gs.precio_descuento || gs.precio_base,
                                                agenda_id: ag.id, agenda_nombre: ag.name, ciudad: ag.ciudad, detalles: "Valoración médica general."
                                            });
                                        }
                                    });
                                });
                            }

                            // Super Fallback: If still empty but we have agendas, just offer the first service of the first agenda
                            if (services.length === 0 && data && data.length > 0) {
                                const firstAg = data[0];
                                if (firstAg.agenda_services && firstAg.agenda_services.length > 0) {
                                    const firstAs = firstAg.agenda_services[0];
                                    const gs = firstAs.global_services;
                                    services.push({
                                        id: gs.id, nombre: gs.nombre, precio: firstAs.precio_final || gs.precio_descuento || gs.precio_base,
                                        agenda_id: firstAg.id, agenda_nombre: firstAg.name, ciudad: firstAg.ciudad, detalles: "Consulta de evaluación."
                                    });
                                }
                            }

                            result = services.length ? services : "No encontré ningún servicio ni agenda en esta ciudad.";
                        }
                        else if (funcName === 'get_available_days') {
                            const aid = parseInt(args.agenda_id);
                            const sid = parseInt(args.service_id);
                            let availableDays: string[] = [];

                            // Revisamos los próximos 7 días
                            for (let i = 0; i < 7; i++) {
                                const date = new Date();
                                date.setDate(date.getDate() + i);
                                const dateStr = date.toISOString().split('T')[0];

                                const { data } = await supabaseServer.rpc('get_ai_availability', {
                                    p_agenda_id: aid,
                                    p_service_id: sid,
                                    p_date: dateStr
                                });

                                if (data && data.length > 0) {
                                    availableDays.push(dateStr);
                                }
                            }
                            result = availableDays.length ? availableDays : "No hay días disponibles en la próxima semana.";
                        }
                        else if (funcName === 'get_availability') {
                            const aid = parseInt(args.agenda_id);
                            const sid = parseInt(args.service_id);

                            if (isNaN(aid) || isNaN(sid)) {
                                result = "Error: Faltan IDs de agenda o servicio.";
                            } else {
                                const { data, error } = await supabaseServer.rpc('get_ai_availability', {
                                    p_agenda_id: aid,
                                    p_service_id: sid,
                                    p_date: args.date
                                });
                                result = error ? "Error en base de datos: " + error.message : (data || "No hay horarios para esta fecha.");
                            }
                        }
                        else if (funcName === 'create_appointment') {
                            const { data, error } = await supabaseServer.from('citas').insert({
                                clinic_id: config.clinic_id,
                                agenda_id: parseInt(args.agenda_id),
                                paciente: args.name,
                                telefono: args.phone,
                                fecha: args.date,
                                hora: args.time,
                                servicio_id: parseInt(args.service_id),
                                vendedor: "Agente IA Meta",
                                estado: "Por Confirmar",
                                observaciones: args.notes || ""
                            }).select().single();
                            result = error ? "Error al crear cita: " + error.message : "Cita creada con éxito. ID: " + data.id;
                        }

                        messagesForAI.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            name: funcName,
                            content: JSON.stringify(result)
                        });
                    }
                    retryCount++;
                    continue;
                }

                if (currentMessage.content) {
                    aiResponse = currentMessage.content;
                }
                break;
            }
        } // Cierre del else (isHumanReply)

        if (isTest) {
            return new Response(JSON.stringify({ aiResponse }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            })
        }

        // Envío a Meta y Guardado (WhatsApp real) - Soporte para doble mensaje
        const messageParts = aiResponse.split('||').map(p => p.trim()).filter(p => p.length > 0);

        for (const part of messageParts) {
            if (platform === 'whatsapp' && config.meta_access_token) {
                await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${config.meta_access_token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messaging_product: "whatsapp", to: externalUserId, text: { body: part } })
                })
            } else if ((platform === 'messenger' || platform === 'instagram') && (pageAccessToken || config.meta_access_token)) {
                const token = pageAccessToken || config.meta_access_token;
                await fetch(`https://graph.facebook.com/v17.0/me/messages?access_token=${token}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recipient: { id: externalUserId },
                        message: { text: part }
                    })
                })
            }

            await supabaseServer.from('meta_messages').upsert({
                conversation_id: conversationId,
                sender_type: isHumanReply ? 'human' : 'ai',
                content: part,
                platform: platform,
                clinic_id: clinicId || config.clinic_id,
                external_id: `out_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
            }, { onConflict: 'external_id' });

            // Actualizamos reporte de tiempo
            await supabaseServer.from('meta_conversations').update({
                last_message_at: new Date().toISOString()
            }).eq('id', conversationId);

            // Notificar cambio
            await notifyRealtime(clinicId || config.clinic_id, conversationId);

            // Pequeño delay de 1 segundo entre mensajes para simular escritura natural
            if (messageParts.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        })
    }
})
