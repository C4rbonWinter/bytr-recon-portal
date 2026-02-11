-- Pipeline moves queue for batched GHL sync
CREATE TABLE IF NOT EXISTS pipeline_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id TEXT NOT NULL,
  clinic TEXT NOT NULL,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

-- Index for efficient querying of pending moves
CREATE INDEX IF NOT EXISTS idx_pipeline_moves_status ON pipeline_moves(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_moves_created ON pipeline_moves(created_at);
