-- Autobot tokens table for Rick's automation/debugging GHL access
CREATE TABLE IF NOT EXISTS autobot_tokens (
  location_id TEXT PRIMARY KEY,
  company_id TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  needs_reauth BOOLEAN DEFAULT FALSE,
  last_error TEXT
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_autobot_tokens_company ON autobot_tokens(company_id);

-- Enable RLS
ALTER TABLE autobot_tokens ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access" ON autobot_tokens
  FOR ALL
  USING (true)
  WITH CHECK (true);
