import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

serve(async (req) => {
    try {
        const formData = await req.formData();
        const callSid = formData.get('CallSid')?.toString();
        const status = formData.get('CallStatus')?.toString() || formData.get('DialCallStatus')?.toString();
        const duration = formData.get('CallDuration')?.toString() || formData.get('DialCallDuration')?.toString();
        const recordingUrl = formData.get('RecordingUrl')?.toString();

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        if (callSid) {
            await supabaseAdmin.from('twilio_calls').update({
                status: status,
                duration: duration ? parseInt(duration) : null,
                recording_url: recordingUrl || null
            }).eq('call_sid', callSid);
        }

        return new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
    } catch (err) {
        console.error(err);
        return new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
    }
})
