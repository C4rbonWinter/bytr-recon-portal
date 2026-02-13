-- Add needs_reauth column to ghl_tokens table
ALTER TABLE ghl_tokens ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN DEFAULT FALSE;
ALTER TABLE ghl_tokens ADD COLUMN IF NOT EXISTS needs_reauth_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ghl_tokens ADD COLUMN IF NOT EXISTS last_error TEXT;
