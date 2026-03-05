import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import twilio from "npm:twilio"

const { VoiceResponse } = twilio.twiml;

serve(async (req) => {
    try {
        const formData = await req.formData();
        const To = formData.get('To') || formData.get('number');
        const callSid = formData.get('CallSid')?.toString();

        const url = new URL(req.url);
        const clinicId = url.searchParams.get('clinic_id');

        if (!clinicId) {
            const resp = new VoiceResponse();
            resp.say("Error: ID de clínica no encontrado en la URL de voz.");
            return new Response(resp.toString(), { headers: { 'Content-Type': 'text/xml' } });
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { data: config } = await supabaseAdmin
            .from('twilio_configs')
            .select('twilio_number')
            .eq('clinic_id', clinicId)
            .single();

        // Log the call initiation
        if (callSid) {
            await supabaseAdmin.from('twilio_calls').upsert({
                clinic_id: clinicId,
                call_sid: callSid,
                from_number: config?.twilio_number || formData.get('From')?.toString(),
                to_number: To?.toString(),
                direction: 'outbound',
                status: 'initiated'
            }, { onConflict: 'call_sid' });
        }

        const response = new VoiceResponse();

        if (To) {
            const dial = response.dial({
                callerId: config?.twilio_number || '',
                record: 'record-from-answer',
                action: `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-voice-status?clinic_id=${clinicId}`
            });
            dial.number(To.toString());
        } else {
            response.say("Por favor ingrese un número de destino.");
        }

        return new Response(response.toString(), {
            headers: { 'Content-Type': 'text/xml' },
        })
    } catch (err) {
        console.error(err);
        const resp = new VoiceResponse();
        resp.say("Ocurrió un error al procesar la llamada.");
        return new Response(resp.toString(), { headers: { 'Content-Type': 'text/xml' } });
    }
})
