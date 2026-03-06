-- Create zadarma_configs table
CREATE TABLE IF NOT EXISTS zadarma_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL,
    sip_user TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(clinic_id)
);

-- Enable RLS
ALTER TABLE zadarma_configs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own clinic zadarma config"
    ON zadarma_configs FOR SELECT
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their own clinic zadarma config"
    ON zadarma_configs FOR UPDATE
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert their own clinic zadarma config"
    ON zadarma_configs FOR INSERT
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- Create zadarma_calls table
CREATE TABLE IF NOT EXISTS zadarma_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID,
    call_id TEXT UNIQUE NOT NULL,
    from_number TEXT,
    to_number TEXT,
    status TEXT,
    duration INTEGER,
    direction TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE zadarma_calls ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own clinic calls"
    ON zadarma_calls FOR SELECT
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
