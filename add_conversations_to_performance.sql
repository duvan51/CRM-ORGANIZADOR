-- Agregar columna para el conteo de conversaciones si no existe
ALTER TABLE meta_ads_performance ADD COLUMN IF NOT EXISTS conversations_count INT DEFAULT 0;

-- Comentario informativo
COMMENT ON COLUMN meta_ads_performance.conversations_count IS 'Número de conversaciones iniciadas extraídas de las acciones de Meta Ads (messaging_conversation_started_7d)';
