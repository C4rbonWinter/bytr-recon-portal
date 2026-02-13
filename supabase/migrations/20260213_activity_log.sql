-- Activity log table for tracking all portal actions
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Who did it
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL, -- 'admin', 'salesperson'
  
  -- What they did
  action TEXT NOT NULL, -- 'login', 'deal_move', 'deal_update', 'payment_add', etc.
  entity_type TEXT, -- 'deal', 'payment', 'session'
  entity_id TEXT, -- deal ID, payment ID, etc.
  entity_name TEXT, -- patient name, etc.
  
  -- Details
  details JSONB DEFAULT '{}', -- action-specific data (from_stage, to_stage, amount, etc.)
  clinic TEXT, -- TR01, TR02, TR04
  
  -- Metadata
  ip_address TEXT,
  user_agent TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
