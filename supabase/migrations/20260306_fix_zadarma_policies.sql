-- Fix RLS policies for zadarma_configs and zadarma_calls to support clinic owners
-- Owners often have clinic_id = NULL in their profile, so we need to check both clinic_id and the user's own ID.

DROP POLICY IF EXISTS "Users can view their own clinic zadarma config" ON zadarma_configs;
CREATE POLICY "Users can view their own clinic zadarma config"
    ON zadarma_configs FOR SELECT
    USING (
        clinic_id = auth.uid() 
        OR 
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can update their own clinic zadarma config" ON zadarma_configs;
CREATE POLICY "Users can update their own clinic zadarma config"
    ON zadarma_configs FOR UPDATE
    USING (
        clinic_id = auth.uid() 
        OR 
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can insert their own clinic zadarma config" ON zadarma_configs;
CREATE POLICY "Users can insert their own clinic zadarma config"
    ON zadarma_configs FOR INSERT
    WITH CHECK (
        clinic_id = auth.uid() 
        OR 
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

-- Fix zadarma_calls policies as well
DROP POLICY IF EXISTS "Users can view their own clinic calls" ON zadarma_calls;
CREATE POLICY "Users can view their own clinic calls"
    ON zadarma_calls FOR SELECT
    USING (
        clinic_id = auth.uid() 
        OR 
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );
