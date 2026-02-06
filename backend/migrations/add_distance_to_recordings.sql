-- Add distance column to recordings table
ALTER TABLE recordings
ADD COLUMN distance VARCHAR(10) DEFAULT 'nom';

-- Add index for faster queries
CREATE INDEX idx_recordings_distance ON recordings(distance);
CREATE INDEX idx_recordings_posture_distance ON recordings(posture_label, distance);

-- Update comment
COMMENT ON COLUMN recordings.distance IS 'Recording distance variant: nom, close, or far';
