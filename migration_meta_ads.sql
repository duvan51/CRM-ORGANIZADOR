-- Add UTM tracking to citas
ALTER TABLE citas ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS meta_ad_id TEXT;

-- Table to cache Meta Ads performance data
CREATE TABLE IF NOT EXISTS meta_ads_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    campaign_name TEXT,
    campaign_id TEXT,
    ad_account_id TEXT,
    entity_type TEXT DEFAULT 'campaign', -- 'campaign' or 'adset'
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'PAUSED', 'ARCHIVED'
    parent_id TEXT, -- ID of the campaign if this is an adset
    spend NUMERIC DEFAULT 0,
    impressions INT DEFAULT 0,
    clicks INT DEFAULT 0,
    leads_count INT DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(clinic_id, campaign_id, date, entity_type)
);

-- Table for Meta API Configuration per clinic
CREATE TABLE IF NOT EXISTS meta_ads_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
    access_token TEXT,
    business_id TEXT, -- Portfolio ID
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table to manage multiple ad accounts from a portfolio
CREATE TABLE IF NOT EXISTS meta_ads_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    ad_account_id TEXT NOT NULL,
    name TEXT,
    is_sync_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(clinic_id, ad_account_id)
);

CREATE TABLE IF NOT EXISTS meta_ads_agenda_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    meta_entity_id TEXT NOT NULL, -- Campaign ID, Adset ID or Ad ID
    meta_entity_type TEXT CHECK (meta_entity_type IN ('campaign', 'adset', 'ad')),
    ad_account_id TEXT, -- Optional, for better filtering
    agenda_id BIGINT REFERENCES agendas(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(clinic_id, meta_entity_id, agenda_id)
);

-- Enable RLS for all Meta tables
ALTER TABLE meta_ads_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_agenda_mapping ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their clinic ads performance" ON meta_ads_performance;
CREATE POLICY "Users can view their clinic ads performance" ON meta_ads_performance FOR ALL USING (
    clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can manage their clinic ads config" ON meta_ads_config;
CREATE POLICY "Users can manage their clinic ads config" ON meta_ads_config FOR ALL USING (
    clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can manage their clinic ads accounts" ON meta_ads_accounts;
CREATE POLICY "Users can manage their clinic ads accounts" ON meta_ads_accounts FOR ALL USING (
    clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can manage their clinic ads mapping" ON meta_ads_agenda_mapping;
CREATE POLICY "Users can manage their clinic ads mapping" ON meta_ads_agenda_mapping FOR ALL USING (
    clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid())
);
