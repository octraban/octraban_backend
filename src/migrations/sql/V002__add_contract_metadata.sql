-- migration: V002
-- description: Add contract metadata to contracts table
-- depends: V001
-- estimated_duration: 15s
-- rollback: ALTER TABLE contracts DROP COLUMN description, DROP COLUMN functions_json;

-- Expand Phase: Add new columns alongside existing ones
ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS functions_json JSONB DEFAULT '[]'::jsonb;
