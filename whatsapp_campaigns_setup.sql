-- WhatsApp Campaigns Setup
-- Migration to add WhatsApp support to the CRM

-- 1. Add WhatsApp specific config to meta_ads_config
ALTER TABLE meta_ads_config 
ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_business_account_id TEXT;

-- 2. Templates table
CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    meta_template_id TEXT,
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    category TEXT,
    components JSONB,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(clinic_id, meta_template_id)
);

-- 3. Campaigns table
CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    template_id UUID REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'completed', 'failed')),
    total_recipients INT DEFAULT 0,
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Campaign logs table
CREATE TABLE IF NOT EXISTS whatsapp_campaign_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES crm_leads(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    meta_message_id TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Enable RLS
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaign_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
DROP POLICY IF EXISTS "Users can view their clinic templates" ON whatsapp_templates;
CREATE POLICY "Users can view their clinic templates" ON whatsapp_templates FOR ALL USING (
    clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can view their clinic campaigns" ON whatsapp_campaigns;
CREATE POLICY "Users can view their clinic campaigns" ON whatsapp_campaigns FOR ALL USING (
    clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can view their clinic campaign logs" ON whatsapp_campaign_logs;
CREATE POLICY "Users can view their clinic campaign logs" ON whatsapp_campaign_logs FOR ALL USING (
    clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid())
);
