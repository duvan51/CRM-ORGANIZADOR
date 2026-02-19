-- AI Agent Configuration Table
CREATE TABLE IF NOT EXISTS ai_agent_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
    provider TEXT DEFAULT 'openai', -- 'openai' or 'gemini'
    api_key TEXT,
    model TEXT DEFAULT 'gpt-3.5-turbo',
    system_prompt TEXT DEFAULT 'Eres un asistente amable de una clínica médica. Tu objetivo es ayudar a los pacientes a agendar citas y resolver dudas generales sobre los servicios.',
    phone_id TEXT, -- WhatsApp Phone Number ID
    meta_access_token TEXT, -- Token specifically for Meta messaging
    verify_token TEXT, -- Webhook verify token
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Meta Conversations Table
CREATE TABLE IF NOT EXISTS meta_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    external_user_id TEXT NOT NULL, -- WhatsApp ID or Messenger ID
    platform TEXT CHECK (platform IN ('whatsapp', 'messenger', 'instagram')),
    status TEXT DEFAULT 'ai_handling', -- 'ai_handling', 'human_required', 'paused'
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(clinic_id, external_user_id, platform)
);

-- Meta Messages History
CREATE TABLE IF NOT EXISTS meta_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES meta_conversations(id) ON DELETE CASCADE,
    sender_type TEXT CHECK (sender_type IN ('user', 'ai', 'human')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their clinic AI config" ON ai_agent_config FOR ALL USING (
    clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can view their clinic conversations" ON meta_conversations FOR ALL USING (
    clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can view their clinic messages" ON meta_messages FOR ALL USING (
    conversation_id IN (SELECT id FROM meta_conversations WHERE clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid()))
);
