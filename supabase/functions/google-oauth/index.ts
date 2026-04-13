// supabase/functions/google-oauth/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  
  const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')
  const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  // FORZAMOS LA URI EXACTA PARA EVITAR MISMATCH
  const REDIRECT_URI = `https://tlezyskwzbhgdudmbfbn.supabase.co/functions/v1/google-oauth`

  // 1. INICIAR FLUJO (REDIRECT A GOOGLE)
  if (url.searchParams.has('clinic_id')) {
    const clinic_id = url.searchParams.get('clinic_id')
    const type = url.searchParams.get('type')
    
    if (!clinic_id) return new Response('Missing clinic_id', { status: 400 })

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'openid'
    ]

    if (type === 'youtube') {
      scopes.push('https://www.googleapis.com/auth/youtube.upload')
      scopes.push('https://www.googleapis.com/auth/youtube.readonly')
    } else if (type === 'google_business') {
      scopes.push('https://www.googleapis.com/auth/business.manage')
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID!)
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', scopes.join(' '))
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent select_account')
    authUrl.searchParams.set('state', JSON.stringify({ clinic_id, type }))

    return Response.redirect(authUrl.toString(), 302)
  }

  // 2. CALLBACK (RECIBIR CÓDIGO Y GUARDAR)
  if (url.searchParams.has('code')) {
    const code = url.searchParams.get('code')
    const stateStr = url.searchParams.get('state')
    const { clinic_id, type } = JSON.parse(stateStr || '{}')

    const tokenParams = new URLSearchParams()
    tokenParams.set('code', code!)
    tokenParams.set('client_id', GOOGLE_CLIENT_ID!)
    tokenParams.set('client_secret', GOOGLE_CLIENT_SECRET!)
    tokenParams.set('redirect_uri', REDIRECT_URI)
    tokenParams.set('grant_type', 'authorization_code')

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams,
    })

    const tokens = await tokenResp.json()
    
    if (tokens.error) {
      console.error('Error intercambiando código:', tokens)
      return new Response(JSON.stringify(tokens), { status: 400 })
    }

    const userResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
    })
    const userData = await userResp.json()

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    const { error } = await supabase
        .from('social_platforms')
        .upsert({
            clinic_id,
            platform_name: type || 'youtube',
            platform_user_id: userData.sub,
            platform_user_name: userData.name || userData.email || 'Google User',
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            status: 'active'
        }, { onConflict: 'clinic_id, platform_name, platform_user_id' })

    if (error) {
        console.error('Error guardando tokens:', error)
        return new Response(error.message, { status: 500 })
    }

    return Response.redirect('https://andocrm.cloud/admin?social=success', 302)
  }

  return new Response('Not Found or Missing Parameters', { status: 404 })
})
