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
        const { userId, email, password, full_name, username, role, action } = payload
        console.log(`Processing ${action || 'update'} for user/email:`, userId || email)

        // 1. Handle actions that do not require userId
        if (action === 'checkAuth') {
            if (!email) throw new Error("Email is required")
            console.log("Checking Auth user for email:", email)
            const { data: { users }, error: listError } = await supabaseClient.auth.admin.listUsers()
            if (listError) {
                console.error("Error listing users:", listError)
                throw new Error(`List Users Error: ${listError.message}`)
            }
            const foundUser = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
            if (foundUser) {
                return new Response(JSON.stringify({ 
                    exists: true, 
                    user: { id: foundUser.id, email: foundUser.email, created_at: foundUser.created_at } 
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            } else {
                return new Response(JSON.stringify({ exists: false }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            }
        }

        if (action === 'deleteByEmail') {
            if (!email) throw new Error("Email is required")
            console.log("Deleting Auth user by email:", email)
            const { data: { users }, error: listError } = await supabaseClient.auth.admin.listUsers()
            if (listError) {
                console.error("Error listing users for delete:", listError)
                throw new Error(`List Users Error: ${listError.message}`)
            }
            const foundUser = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
            if (!foundUser) throw new Error("User not found in Auth")

            const { error: authError } = await supabaseClient.auth.admin.deleteUser(foundUser.id)
            if (authError) {
                console.error("Auth delete by email error:", authError)
                throw new Error(`Auth Delete Error: ${authError.message}`)
            }

            // Also delete from profiles just in case
            await supabaseClient.from('profiles').delete().eq('id', foundUser.id)

            return new Response(JSON.stringify({ success: true, message: "Usuario eliminado de Auth con éxito" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // Actions below require userId
        if (!userId) {
            throw new Error("User ID is required")
        }

        // 1. Handle Deletion action
        if (action === 'delete') {
            console.log("Deleting user from Auth:", userId)
            const { error: authError } = await supabaseClient.auth.admin.deleteUser(userId)
            if (authError) {
                console.error("Auth delete error:", authError)
                throw new Error(`Auth Delete Error: ${authError.message}`)
            }

            console.log("Deleting user from profiles...")
            const { error: profileError } = await supabaseClient
                .from('profiles')
                .delete()
                .eq('id', userId)

            if (profileError) {
                console.error("Profile delete error:", profileError)
                throw new Error(`Profile Delete Error: ${profileError.message}`)
            }

            return new Response(JSON.stringify({ success: true, message: "Usuario eliminado correctamente" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. Update Auth User if email or password provided
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

        // 3. Update Profile
        console.log("Updating profile table...")
        const { error: profileError } = await supabaseClient
            .from('profiles')
            .update({
                full_name,
                username,
                email,
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
