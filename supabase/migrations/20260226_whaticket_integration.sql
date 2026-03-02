-- Create whaticket_configs table
CREATE TABLE IF NOT EXISTS whaticket_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    api_key TEXT NOT NULL,
    base_url TEXT NOT NULL,
    whatsapp_id INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(clinic_id)
);

-- Enable RLS for whaticket_configs
ALTER TABLE whaticket_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own whaticket configs" ON whaticket_configs;
CREATE POLICY "Users can manage their own whaticket configs"
    ON whaticket_configs FOR ALL
    USING (auth.uid() = clinic_id);

-- Create whaticket_templates table
CREATE TABLE IF NOT EXISTS whaticket_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(clinic_id, event_type)
);

-- Enable RLS for whaticket_templates
ALTER TABLE whaticket_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own whaticket templates" ON whaticket_templates;
CREATE POLICY "Users can manage their own whaticket templates"
    ON whaticket_templates FOR ALL
    USING (auth.uid() = clinic_id);
