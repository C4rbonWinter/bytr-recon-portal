-- Add shared_with column to pipeline_opportunities
ALTER TABLE pipeline_opportunities 
ADD COLUMN IF NOT EXISTS shared_with TEXT;

-- Create index for filtering by shared_with
CREATE INDEX IF NOT EXISTS idx_pipeline_opportunities_shared_with 
ON pipeline_opportunities(shared_with);
