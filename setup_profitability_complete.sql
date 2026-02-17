-- ==========================================================
-- SCRIPT DE CONSOLIDACIÓN TOTAL: RENTABILIDAD Y CPA v10.6
-- ==========================================================
-- Este script crea la tabla de rentabilidad desde cero o la actualiza 
-- si ya existe, incluyendo soporte para Sede Global y métrica de CPA.

-- 1. Crear tabla base (si no existe)
CREATE TABLE IF NOT EXISTS manual_performance_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    agenda_id BIGINT REFERENCES agendas(id) ON DELETE CASCADE,
    month INT NOT NULL,
    year INT NOT NULL,
    agendados_cop NUMERIC DEFAULT 0,
    leads_received INT DEFAULT 0,
    agent_stats JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(clinic_id, agenda_id, month, year)
);

-- 2. Asegurar que agenda_id sea opcional (para Sede Global)
ALTER TABLE manual_performance_data ALTER COLUMN agenda_id DROP NOT NULL;

-- 3. Agregar columna de conteo de ventas para CPA (si no existe)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='manual_performance_data' AND column_name='sales_count') THEN
        ALTER TABLE manual_performance_data ADD COLUMN sales_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- 4. Crear índice único para la fila "Global" (donde agenda_id es NULL)
CREATE UNIQUE INDEX IF NOT EXISTS manual_performance_global_unique 
ON manual_performance_data (clinic_id, month, year) 
WHERE agenda_id IS NULL;

-- 5. Configurar Seguridad (RLS)
ALTER TABLE manual_performance_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their clinic manual performance" ON manual_performance_data;
CREATE POLICY "Users can manage their clinic manual performance" ON manual_performance_data 
FOR ALL USING (
    clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid())
);

-- FINALIZADO: La base de datos está lista para Rentabilidad v10.6
