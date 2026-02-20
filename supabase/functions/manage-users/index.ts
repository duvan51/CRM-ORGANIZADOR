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
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const payload = await req.json()
        console.log("Processing update for user:", payload.userId)
        const { userId, email, password, full_name, username, role } = payload

        if (!userId) {
            throw new Error("User ID is required")
        }

        // 1. Update Auth User if email or password provided
        const updateAuthData: any = {}
        if (email) updateAuthData.email = email
        if (password && password.trim() !== "") updateAuthData.password = password

        if (Object.keys(updateAuthData).length > 0) {
            console.log("Updating Auth data:", Object.keys(updateAuthData))
            const { error: authError } = await supabaseClient.auth.admin.updateUserById(
                userId,
                { ...updateAuthData, email_confirm: true }
            )
            if (authError) {
                console.error("Auth update error:", authError)
                throw new Error(`Auth Error: ${authError.message}`)
            }
        }

        // 2. Update Profile
        console.log("Updating profile table...")
        const { error: profileError } = await supabaseClient
            .from('profiles')
            .update({
                full_name,
                username,
                role
            })
            .eq('id', userId)

        if (profileError) {
            console.error("Profile update error:", profileError)
            throw new Error(`Profile Error: ${profileError.message}`)
        }

        return new Response(JSON.stringify({ success: true, message: "Usuario actualizado correctamente" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    } catch (error: any) {
        console.error("Global Management Error:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
