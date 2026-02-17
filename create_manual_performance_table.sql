-- Create table for manual performance data entry
CREATE TABLE IF NOT EXISTS manual_performance_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    agenda_id BIGINT REFERENCES agendas(id) ON DELETE CASCADE,
    month INT NOT NULL, -- 1 to 12
    year INT NOT NULL,
    agendados_cop NUMERIC DEFAULT 0, -- Manual sales input
    leads_received INT DEFAULT 0, -- Manual leads input
    agent_stats JSONB DEFAULT '{}', -- { "AgentName": { "sales": 500000, "leads": 10 }, ... }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(clinic_id, agenda_id, month, year)
);

-- Enable RLS
ALTER TABLE manual_performance_data ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "Users can manage their clinic manual performance" ON manual_performance_data;
CREATE POLICY "Users can manage their clinic manual performance" ON manual_performance_data 
FOR ALL USING (
    clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid())
);
