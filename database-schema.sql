-- Database Schema for Multi-View Posture Data Collection

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions table: tracks recording sessions
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_code VARCHAR(8) UNIQUE NOT NULL, -- Short code for mobile joining
    status VARCHAR(20) NOT NULL DEFAULT 'CREATED', -- CREATED, WAITING_FOR_MOBILE, READY, RECORDING, UPLOADING, COMPLETED, FAILED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE, -- When first recording started
    completed_at TIMESTAMP WITH TIME ZONE, -- When all recordings uploaded
    
    -- Device tracking
    desktop_connected BOOLEAN DEFAULT FALSE,
    mobile_connected BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}', -- For additional session info (user notes, etc.)
    
    CONSTRAINT valid_status CHECK (status IN (
        'CREATED', 
        'WAITING_FOR_MOBILE', 
        'READY', 
        'RECORDING', 
        'UPLOADING', 
        'COMPLETED', 
        'FAILED'
    ))
);

-- Devices table: tracks connected devices in a session
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    device_type VARCHAR(10) NOT NULL, -- 'desktop' or 'mobile'
    view_type VARCHAR(10) NOT NULL, -- 'front' or 'side'
    socket_id VARCHAR(255), -- Current socket connection ID
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    disconnected_at TIMESTAMP WITH TIME ZONE,
    user_agent TEXT,
    
    CONSTRAINT valid_device_type CHECK (device_type IN ('desktop', 'mobile')),
    CONSTRAINT valid_view_type CHECK (view_type IN ('front', 'side')),
    CONSTRAINT unique_device_per_session UNIQUE (session_id, device_type)
);

-- Posture steps: predefined posture labels and instructions
CREATE TABLE posture_steps (
    id SERIAL PRIMARY KEY,
    step_order INTEGER NOT NULL, -- Order in the workflow (1, 2, 3...)
    posture_label VARCHAR(50) NOT NULL UNIQUE, -- e.g., 'sit_straight', 'lean_forward'
    display_name VARCHAR(100) NOT NULL, -- User-friendly name
    instructions TEXT NOT NULL, -- Instructions shown to user
    countdown_seconds INTEGER DEFAULT 3, -- Countdown before recording
    recording_duration_seconds INTEGER DEFAULT 10, -- How long to record
    is_active BOOLEAN DEFAULT TRUE, -- Can be disabled without deleting
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recordings table: metadata for each recorded video
CREATE TABLE recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    
    -- Video identification
    device_type VARCHAR(10) NOT NULL,
    view_type VARCHAR(10) NOT NULL,
    posture_label VARCHAR(50) NOT NULL,
    
    -- Timing information
    start_timestamp BIGINT NOT NULL, -- Unix timestamp (ms) when recording started
    stop_timestamp BIGINT, -- Unix timestamp (ms) when recording stopped
    duration_ms INTEGER, -- Actual recorded duration
    
    -- Storage information
    storage_path VARCHAR(500), -- Path in S3/storage bucket
    file_size_bytes BIGINT,
    mime_type VARCHAR(50) DEFAULT 'video/webm',
    
    -- Upload tracking
    upload_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, UPLOADING, COMPLETED, FAILED
    upload_started_at TIMESTAMP WITH TIME ZONE,
    upload_completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}', -- Additional info (fps, resolution, etc.)
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_upload_status CHECK (upload_status IN (
        'PENDING', 
        'UPLOADING', 
        'COMPLETED', 
        'FAILED'
    ))
);

-- Sync events log: for debugging and analysis
CREATE TABLE sync_events (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- START_RECORDING, STOP_RECORDING, DEVICE_JOINED, etc.
    event_timestamp BIGINT NOT NULL, -- Unix timestamp (ms)
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX idx_sessions_code ON sessions(session_code);

CREATE INDEX idx_devices_session ON devices(session_id);
CREATE INDEX idx_devices_socket ON devices(socket_id);

CREATE INDEX idx_posture_steps_order ON posture_steps(step_order);
CREATE INDEX idx_posture_steps_active ON posture_steps(is_active);

CREATE INDEX idx_recordings_session ON recordings(session_id);
CREATE INDEX idx_recordings_device ON recordings(device_id);
CREATE INDEX idx_recordings_posture ON recordings(posture_label);
CREATE INDEX idx_recordings_status ON recordings(upload_status);
CREATE INDEX idx_recordings_timestamp ON recordings(start_timestamp);

CREATE INDEX idx_sync_events_session ON sync_events(session_id);
CREATE INDEX idx_sync_events_timestamp ON sync_events(event_timestamp DESC);

-- Insert default posture steps
INSERT INTO posture_steps (step_order, posture_label, display_name, instructions, countdown_seconds, recording_duration_seconds) VALUES
(1, 'sit_straight', 'Sit Straight', 'Sit upright with your back straight and shoulders relaxed. Look straight ahead.', 3, 10),
(2, 'left_leaning', 'Left-Leaning', 'Lean your upper body to the left side while keeping your hips stable.', 3, 10),
(3, 'right_leaning', 'Right-Leaning', 'Lean your upper body to the right side while keeping your hips stable.', 3, 10),
(4, 'forward_head', 'Forward Head', 'Push your head forward while keeping your torso upright, creating a forward head posture.', 3, 10),
(5, 'rounded_shoulders', 'Rounded Shoulders', 'Round your shoulders forward and inward while maintaining an otherwise upright position.', 3, 10),
(6, 'slouched_posture', 'Slouched Posture', 'Slouch by rounding your upper back and letting your shoulders drop forward. Allow your spine to curve.', 3, 10);

-- Views for easier querying

-- View: Session summary with device count and recording count
CREATE VIEW session_summary AS
SELECT 
    s.id,
    s.session_code,
    s.status,
    s.created_at,
    s.started_at,
    s.completed_at,
    s.desktop_connected,
    s.mobile_connected,
    COUNT(DISTINCT d.id) as device_count,
    COUNT(DISTINCT r.id) as recording_count,
    COUNT(DISTINCT r.id) FILTER (WHERE r.upload_status = 'COMPLETED') as completed_recordings,
    COUNT(DISTINCT r.posture_label) as unique_postures
FROM sessions s
LEFT JOIN devices d ON s.id = d.session_id
LEFT JOIN recordings r ON s.id = r.session_id
GROUP BY s.id;

-- View: Recording pairs (front + side views for same posture)
CREATE VIEW recording_pairs AS
SELECT 
    r1.session_id,
    r1.posture_label,
    r1.id as front_recording_id,
    r1.storage_path as front_storage_path,
    r1.start_timestamp as front_start_timestamp,
    r2.id as side_recording_id,
    r2.storage_path as side_storage_path,
    r2.start_timestamp as side_start_timestamp,
    ABS(r1.start_timestamp - r2.start_timestamp) as sync_diff_ms
FROM recordings r1
JOIN recordings r2 ON 
    r1.session_id = r2.session_id 
    AND r1.posture_label = r2.posture_label
    AND r1.view_type = 'front'
    AND r2.view_type = 'side'
WHERE 
    r1.upload_status = 'COMPLETED' 
    AND r2.upload_status = 'COMPLETED';

-- Function: Generate unique session code
CREATE OR REPLACE FUNCTION generate_session_code() RETURNS VARCHAR(8) AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Exclude confusing chars
    result VARCHAR(8) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-generate session code if not provided
CREATE OR REPLACE FUNCTION set_session_code() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.session_code IS NULL OR NEW.session_code = '' THEN
        NEW.session_code := generate_session_code();
        -- Ensure uniqueness
        WHILE EXISTS (SELECT 1 FROM sessions WHERE session_code = NEW.session_code) LOOP
            NEW.session_code := generate_session_code();
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_session_code
BEFORE INSERT ON sessions
FOR EACH ROW
EXECUTE FUNCTION set_session_code();

-- Trigger: Update session status based on devices
CREATE OR REPLACE FUNCTION update_session_status() RETURNS TRIGGER AS $$
BEGIN
    -- When both devices are connected, set to READY
    IF NEW.desktop_connected = TRUE AND NEW.mobile_connected = TRUE AND NEW.status = 'WAITING_FOR_MOBILE' THEN
        NEW.status := 'READY';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_session_status
BEFORE UPDATE ON sessions
FOR EACH ROW
EXECUTE FUNCTION update_session_status();

-- Function: Get next posture step for a session
CREATE OR REPLACE FUNCTION get_next_posture_step(p_session_id UUID) 
RETURNS TABLE (
    step_order INTEGER,
    posture_label VARCHAR(50),
    display_name VARCHAR(100),
    instructions TEXT,
    countdown_seconds INTEGER,
    recording_duration_seconds INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ps.step_order,
        ps.posture_label,
        ps.display_name,
        ps.instructions,
        ps.countdown_seconds,
        ps.recording_duration_seconds
    FROM posture_steps ps
    WHERE ps.is_active = TRUE
    AND ps.posture_label NOT IN (
        SELECT DISTINCT r.posture_label 
        FROM recordings r 
        WHERE r.session_id = p_session_id 
        AND r.upload_status = 'COMPLETED'
        GROUP BY r.posture_label, r.session_id
        HAVING COUNT(DISTINCT r.device_type) = 2 -- Both devices completed
    )
    ORDER BY ps.step_order
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE sessions IS 'Tracks recording sessions with two devices';
COMMENT ON TABLE devices IS 'Connected devices (desktop/mobile) in each session';
COMMENT ON TABLE posture_steps IS 'Predefined posture labels and workflow';
COMMENT ON TABLE recordings IS 'Video metadata for each recorded clip';
COMMENT ON TABLE sync_events IS 'Log of synchronization events for debugging';

COMMENT ON COLUMN recordings.start_timestamp IS 'Unix timestamp (ms) from server when recording started';
COMMENT ON COLUMN recordings.stop_timestamp IS 'Unix timestamp (ms) from server when recording stopped';
COMMENT ON COLUMN recordings.duration_ms IS 'Actual recorded duration in milliseconds';
