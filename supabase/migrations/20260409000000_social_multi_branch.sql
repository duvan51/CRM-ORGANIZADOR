
-- Añadir soporte para multi-sedes (agendas) en el Social Hub
-- Corregido: agenda_id debe ser BIGINT para coincidir con el ID de la tabla agendas
ALTER TABLE public.social_platforms ADD COLUMN IF NOT EXISTS agenda_id BIGINT REFERENCES public.agendas(id) ON DELETE CASCADE;
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS agenda_id BIGINT REFERENCES public.agendas(id) ON DELETE CASCADE;

-- Actualizar RLS para permitir acceso basado en agendas asignadas
DROP POLICY IF EXISTS "Users can manage their own social platforms" ON public.social_platforms;
CREATE POLICY "Users can manage their own social platforms" 
ON public.social_platforms FOR ALL 
USING (
    profile_id = auth.uid() OR 
    agenda_id IN (SELECT agenda_id FROM public.agenda_users WHERE user_id = auth.uid()) OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superuser'
);

DROP POLICY IF EXISTS "Users can manage their own social posts" ON public.social_posts;
CREATE POLICY "Users can manage their own social posts" 
ON public.social_posts FOR ALL 
USING (
    profile_id = auth.uid() OR 
    agenda_id IN (SELECT agenda_id FROM public.agenda_users WHERE user_id = auth.uid()) OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superuser'
);
