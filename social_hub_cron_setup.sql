--- AUTOMATIZACIÓN DE PUBLICACIONES PROGRAMADAS ---
--- Ejecuta este SQL en el Dashboard de Supabase (SQL Editor) ---

-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Configurar el Job para procesar la cola cada 5 minutos
-- Esto llamará a la Edge Function 'process-social-queue' automáticamente
-- IMPORTANTE: Reemplaza YOUR_SERVICE_ROLE_KEY con tu clave secreta de Supabase (Settings -> API)

SELECT cron.schedule(
    'process-social-queue-job',
    '*/5 * * * *',
    $$
    SELECT
      net.http_post(
        url := 'https://tlezyskwzbhgdudmbfbn.supabase.co/functions/v1/process-social-queue',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
        body := '{}'::jsonb
      ) as request_id;
    $$
);

-- 3. (Opcional) Verificar si el job está corriendo
-- SELECT * FROM cron.job;
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
