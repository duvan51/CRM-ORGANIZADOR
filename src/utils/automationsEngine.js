import { supabase } from '../supabase';

/**
 * Automations Execution Engine
 * Reads saved rules from the Kanban board and fires the external API endpoints.
 */
export const executeAutomations = async (clinicId, triggerId, payloadData) => {
    try {
        if (!clinicId || !triggerId || !payloadData) return;

        // 1. Fetch all flows for this clinic
        const { data: flows, error } = await supabase
            .from('automation_flows')
            .select('*')
            .eq('clinic_id', clinicId);

        if (error || !flows) {
            console.error("Automations Engine: Could not fetch flows.", error);
            return;
        }

        // 2. Filter flows where the trigger explicitly matches the event that just happened
        const activeFlows = flows.filter(f => f.flow_data?.trigger?.id === triggerId);

        if (activeFlows.length === 0) return;

        // 3. Execute all actions sequentially for all matching flows
        for (const flow of activeFlows) {
            const actions = flow.flow_data?.actions || [];

            for (const action of actions) {
                // A) ACTION: SEND SMS
                if (action.id === 'a_sms') {
                    if (!payloadData.celular) continue;

                    let message = action.template || '';
                    message = message.replace(/{paciente}/g, payloadData.nombres_completos || '');
                    message = message.replace(/{fecha}/g, payloadData.fecha || '');
                    message = message.replace(/{hora}/g, payloadData.hora || '');

                    if (action.provider === 'infobip') {
                        await supabase.functions.invoke('send-sms-infobip', {
                            body: {
                                clinicId: clinicId,
                                phone: payloadData.celular,
                                message: message,
                                patientName: payloadData.nombres_completos
                            }
                        });
                    }
                    // Additional providers (twilio) can be layered here.
                }

                // B) ACTION: SEND EMAIL
                if (action.id === 'a_email') {
                    if (!payloadData.email) continue;

                    let subject = action.subject || 'Notificación CRM';
                    subject = subject.replace(/{paciente}/g, payloadData.nombres_completos || '');
                    subject = subject.replace(/{fecha}/g, payloadData.fecha || '');
                    subject = subject.replace(/{hora}/g, payloadData.hora || '');

                    let message = action.template || '';
                    message = message.replace(/{paciente}/g, payloadData.nombres_completos || '');
                    message = message.replace(/{fecha}/g, payloadData.fecha || '');
                    message = message.replace(/{hora}/g, payloadData.hora || '');

                    if (action.provider === 'hostinger' || action.provider === 'aws_ses') {
                        // Using the existing endpoint signature found in AgendaForm
                        await supabase.functions.invoke('send-email-hostinger', {
                            body: {
                                clinicId: clinicId,
                                to: payloadData.email,
                                subject: subject,
                                body: message,
                                patientName: payloadData.nombres_completos
                            }
                        });
                    }
                }

                // C) ACTION: SEND WHATSAPP
                if (action.id === 'a_whatsapp') {
                    if (!payloadData.celular) continue;

                    let message = action.template || '';
                    message = message.replace(/{paciente}/g, payloadData.nombres_completos || '');
                    message = message.replace(/{fecha}/g, payloadData.fecha || '');
                    message = message.replace(/{hora}/g, payloadData.hora || '');

                    // Call whaticket proxy
                    await supabase.functions.invoke('whaticket-proxy', {
                        body: {
                            clinicId: clinicId,
                            phone: payloadData.celular,
                            message: message
                        }
                    });
                }
            }
        }
    } catch (err) {
        console.error("Critical Execution Engine Error:", err);
    }
};
