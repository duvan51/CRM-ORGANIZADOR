-- Ajuste para permitir Sede "General" (agenda_id NULL) en manual_performance_data
-- Ejecutar en el SQL Editor de Supabase

-- 1. Asegurar que agenda_id sea opcional
ALTER TABLE manual_performance_data ALTER COLUMN agenda_id DROP NOT NULL;

-- 2. Crear índice único para la fila "General" (donde agenda_id es NULL)
-- Esto garantiza que solo haya UNA fila global por clínica/mes/año
CREATE UNIQUE INDEX IF NOT EXISTS manual_performance_global_unique 
ON manual_performance_data (clinic_id, month, year) 
WHERE agenda_id IS NULL;
