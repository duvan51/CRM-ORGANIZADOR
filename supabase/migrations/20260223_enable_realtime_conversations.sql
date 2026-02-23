-- Add external_user_name to meta_conversations
ALTER TABLE meta_conversations ADD COLUMN IF NOT EXISTS external_user_name TEXT;

-- Add clinic_id and external_id to meta_messages
ALTER TABLE meta_messages ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE meta_messages ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Add UNIQUE constraint and index to meta_messages
-- First, clean up any null external_ids if they exist (optional but good practice)
-- ALTER TABLE meta_messages ALTER COLUMN external_id SET NOT NULL; -- Wait, might have old data
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_messages_external_id ON meta_messages (external_id);

-- Backfill clinic_id for existing messages if possible (via conversation)
UPDATE meta_messages m
SET clinic_id = c.clinic_id
FROM meta_conversations c
WHERE m.conversation_id = c.id AND m.clinic_id IS NULL;

-- Enable Real-time for Meta tables
-- Check if publication exists, then add tables ONLY if they are not already members
DO $$
BEGIN
    -- Ensure publication exists
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    -- Add meta_conversations if not present
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'meta_conversations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE meta_conversations;
    END IF;

    -- Add meta_messages if not present
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'meta_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE meta_messages;
    END IF;
END $$;

-- Set Replica Identity to FULL to ensure all columns are available for Realtime filters
ALTER TABLE meta_conversations REPLICA IDENTITY FULL;
ALTER TABLE meta_messages REPLICA IDENTITY FULL;

-- Ensure RLS is updated for the new columns if necessary
-- Policy for meta_messages already uses conversation_id, but clinic_id index is better
DROP POLICY IF EXISTS "Users can view their clinic messages" ON meta_messages;
CREATE POLICY "Users can view their clinic messages" ON meta_messages FOR ALL USING (
    clinic_id = (SELECT COALESCE(clinic_id, id) FROM profiles WHERE id = auth.uid())
);
