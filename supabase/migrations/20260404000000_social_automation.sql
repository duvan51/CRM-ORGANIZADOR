
-- Tablas para Automatización de Redes Sociales (TikTok & Meta)

-- 1. Cuentas/Plataformas Conectadas
CREATE TABLE IF NOT EXISTS public.social_platforms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    platform_name TEXT NOT NULL, -- 'tiktok', 'instagram', 'facebook'
    platform_user_id TEXT, -- ID del usuario en la red social
    platform_user_name TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb, -- Para Guardar IDs de Business Accounts, etc.
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Publicaciones Programadas
CREATE TABLE IF NOT EXISTS public.social_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    cloudinary_url TEXT NOT NULL,
    cloudinary_public_id TEXT,
    caption TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'published', 'failed'
    platforms TEXT[] DEFAULT '{}', -- ['tiktok', 'instagram']
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ
);

-- RLS (Seguridad por filas)
ALTER TABLE public.social_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own social platforms" 
ON public.social_platforms FOR ALL 
USING (auth.uid() = profile_id);

CREATE POLICY "Users can manage their own social posts" 
ON public.social_posts FOR ALL 
USING (auth.uid() = profile_id);

-- Índices para mejorar rendimiento de la cola de publicación
CREATE INDEX idx_social_posts_status_scheduled ON public.social_posts (status, scheduled_at);
