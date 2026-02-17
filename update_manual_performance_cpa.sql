-- Agregar columna sales_count a manual_performance_data
-- Ejecutar en el SQL Editor de Supabase

ALTER TABLE manual_performance_data ADD COLUMN IF NOT EXISTS sales_count INTEGER DEFAULT 0;

-- Comentario para desarrolladores:
-- Esta columna permite calcular el CPA (Costo por Venta) dividiendo Inversión / sales_count.
