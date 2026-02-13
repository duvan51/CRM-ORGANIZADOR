-- PASO 1: Eliminar la restricción de nombre único actual
-- Buscamos el nombre de la restricción que afecta a 'name'
-- Normalmente se llama 'agendas_name_key' o similar

DO $$ 
BEGIN 
    -- Intentamos eliminar por el nombre estándar
    ALTER TABLE agendas DROP CONSTRAINT IF EXISTS agendas_name_key;
EXCEPTION 
    WHEN OTHERS THEN 
        RAISE NOTICE 'No se pudo eliminar la restricción agendas_name_key automáticamente.';
END $$;

-- PASO 2: Crear la nueva restricción compuesta
-- El nombre de la agenda ahora solo debe ser único DENTRO de la misma clínica
ALTER TABLE agendas ADD CONSTRAINT agendas_clinic_name_unique UNIQUE (clinic_id, name);

-- NOTA: Si ya existen duplicados entre clínicas, esto funcionará de inmediato.
-- Si hay duplicados dentro de la MISMA clínica, el script fallará y deberás renombrar las agendas antes.
