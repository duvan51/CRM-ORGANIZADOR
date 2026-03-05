-- Create twilio_configs table
CREATE TABLE IF NOT EXISTS twilio_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    account_sid TEXT NOT NULL,
    auth_token TEXT,
    api_key_sid TEXT,
    api_key_secret TEXT,
    twilio_number TEXT,
    twiml_app_sid TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(clinic_id)
);

-- Enable RLS
ALTER TABLE twilio_configs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own clinic twilio config"
    ON twilio_configs FOR SELECT
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their own clinic twilio config"
    ON twilio_configs FOR UPDATE
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert their own clinic twilio config"
    ON twilio_configs FOR INSERT
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- Create twilio_calls table
CREATE TABLE IF NOT EXISTS twilio_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID,
    call_sid TEXT UNIQUE NOT NULL,
    from_number TEXT,
    to_number TEXT,
    status TEXT,
    duration INTEGER,
    direction TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    recording_url TEXT
);

-- Enable RLS
ALTER TABLE twilio_calls ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own clinic calls"
    ON twilio_calls FOR SELECT
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

