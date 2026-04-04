-- 1. Añadir columna de créditos predictivos a los perfiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS predictive_credits INTEGER DEFAULT 0;

-- 2. Crear tabla de simulaciones predictivas
CREATE TABLE IF NOT EXISTS predictive_simulations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  campaign_name TEXT,
  payload JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Habilitar RLS para la tabla de simulaciones
ALTER TABLE predictive_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic's simulations" 
ON predictive_simulations FOR SELECT 
USING (auth.uid() IN (SELECT id FROM profiles WHERE clinic_id = predictive_simulations.clinic_id));

CREATE POLICY "Admins can manage simulations" 
ON predictive_simulations FOR ALL 
USING (auth.uid() IN (SELECT id FROM profiles WHERE clinic_id = predictive_simulations.clinic_id AND (role = 'superuser' OR role = 'admin' OR role = 'owner')));

-- 4. Función opcional para recargar créditos (solo para uso de administradores de sistema)
-- Ejemplo: UPDATE profiles SET predictive_credits = 100 WHERE clinic_id = 'ID_DE_LA_CLINICA';
