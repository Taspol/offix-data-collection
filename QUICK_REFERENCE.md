# Quick Reference Card

## 🚀 Quick Start

```bash
# Backend
cd backend
npm install
cp .env.example .env  # Edit with your credentials
npm run start:dev     # Runs on :3001

# Frontend
cd frontend
npm install
cp .env.local.example .env.local
npm run dev           # Runs on :3000
```

## 📡 API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions/:id` | Get session details |
| GET | `/api/sessions/code/:code` | Get session by code |
| GET | `/api/sessions/:id/recordings` | List recordings |
| POST | `/api/sessions/:id/upload-url` | Get presigned URL |
| POST | `/api/sessions/recordings/:id/complete` | Mark upload done |
| GET | `/api/postures` | List posture steps |

### WebSocket Events

#### Client → Server:
- `join_session` - Join as device
- `start_recording` - Begin recording
- `stop_recording` - Stop recording
- `upload_started` - Upload began
- `upload_completed` - Upload finished
- `ready_for_next` - Ready for next step

#### Server → Client:
- `joined_session` - Join confirmed
- `device_joined` - Device joined
- `device_disconnected` - Device left
- `start_recording` - Start command
- `stop_recording` - Stop command
- `next_step_ready` - Next posture
- `session_completed` - All done
- `error` - Error occurred

## 🗃️ Database Tables

```sql
sessions          -- Recording sessions
devices           -- Connected devices
recordings        -- Video metadata
posture_steps     -- Posture definitions
sync_events       -- Event log
```

### Key Queries

```sql
-- Get session with recordings
SELECT s.*, COUNT(r.id) as recording_count
FROM sessions s
LEFT JOIN recordings r ON s.id = r.session_id
WHERE s.id = 'session-id'
GROUP BY s.id;

-- Check upload status
SELECT 
  session_id,
  posture_label,
  device_type,
  upload_status
FROM recordings
WHERE session_id = 'session-id'
ORDER BY created_at;

-- View sync accuracy
SELECT * FROM recording_pairs
WHERE session_id = 'session-id';
```

## 🎥 MediaRecorder Code

```typescript
// Request camera
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'user', width: 1280, height: 720 },
  audio: false
});

// Create recorder
const recorder = new MediaRecorder(stream, {
  mimeType: 'video/webm;codecs=vp9'
});

// Collect chunks
const chunks = [];
recorder.ondataavailable = (e) => chunks.push(e.data);

// Start/stop
recorder.start(100);
recorder.stop();

// Get blob
recorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'video/webm' });
};
```

## 🔌 Socket.io Code

### Backend

```typescript
@WebSocketGateway()
export class SyncGateway {
  @WebSocketServer() server: Server;
  
  @SubscribeMessage('start_recording')
  handleStart(@MessageBody() data) {
    this.server.to(data.sessionId).emit('start_recording', {
      timestamp: Date.now(),
      ...data
    });
  }
}
```

### Frontend

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

socket.emit('join_session', { sessionId, deviceType });

socket.on('start_recording', (data) => {
  // Start recording
});
```

## 📤 Upload Flow

```typescript
// 1. Get presigned URL
const { uploadUrl, storagePath } = await api.getUploadUrl(
  sessionId, recordingId, deviceType, viewType, postureLabel
);

// 2. Upload directly to storage
await fetch(uploadUrl, {
  method: 'PUT',
  body: videoBlob,
  headers: { 'Content-Type': 'video/webm' }
});

// 3. Mark complete
await api.completeUpload(recordingId, {
  stopTimestamp, durationMs, fileSizeBytes
});
```

## ⚙️ Environment Variables

### Backend (.env)

```bash
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=secret
DATABASE_NAME=posture_data

STORAGE_PROVIDER=supabase  # or 's3'
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-key
SUPABASE_BUCKET=posture-videos

PORT=3001
CORS_ORIGIN=http://localhost:3000
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

## 🧪 Testing Commands

```bash
# Test backend API
curl http://localhost:3001/api/postures

# Test database
psql posture_data -c "SELECT COUNT(*) FROM sessions;"

# Check logs
cd backend && npm run start:dev  # Watch console

# Browser console
# F12 > Console > Check for errors
```

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| Port in use | `lsof -ti:3001 \| xargs kill -9` |
| Camera blocked | Check browser permissions |
| CORS error | Update `CORS_ORIGIN` in backend |
| Upload fails | Check storage credentials |
| DB connection | Verify PostgreSQL running |
| WebSocket fail | Check firewall, verify URL |

## 📁 File Locations

```
Project Structure:
├── backend/              # NestJS API
│   ├── src/
│   │   ├── entities/    # Database models
│   │   ├── session/     # Session logic
│   │   ├── sync/        # WebSocket
│   │   └── storage/     # Storage service
│   └── .env             # Backend config
├── frontend/            # Next.js app
│   ├── src/
│   │   ├── app/        # Pages
│   │   ├── components/ # React components
│   │   ├── hooks/      # Custom hooks
│   │   └── lib/        # Utilities
│   └── .env.local      # Frontend config
└── database-schema.sql # DB setup
```

## 🎨 Key Components

### Backend Services

```typescript
SessionService     // Session CRUD
StorageService     // Presigned URLs
SyncGateway       // WebSocket events
```

### Frontend Hooks

```typescript
useCamera()        // Camera recording
useSessionStore()  // State management
```

### Frontend Pages

```typescript
/                  // Home
/desktop          // Desktop session
/mobile           // Mobile entry
/join/[code]      // Join session
```

## 📊 Posture Steps

Default 6 postures (customizable):

1. **Sit Straight** - Upright posture
2. **Lean Forward** - Forward lean
3. **Slouch** - Rounded back
4. **Tilt Left** - Left side tilt
5. **Tilt Right** - Right side tilt
6. **Lean Back** - Back lean

Each: 3s countdown + 10s recording

## 🔧 Customization

### Add Posture

```sql
INSERT INTO posture_steps (
  step_order, posture_label, display_name, 
  instructions, countdown_seconds, 
  recording_duration_seconds
) VALUES (
  7, 'custom', 'Custom Posture',
  'Your instructions', 3, 10
);
```

### Change Duration

```sql
UPDATE posture_steps 
SET recording_duration_seconds = 15
WHERE posture_label = 'sit_straight';
```

### Modify Video Quality

```typescript
// In useCamera.ts
video: {
  width: { ideal: 1920 },   // Change resolution
  height: { ideal: 1080 },
  frameRate: { ideal: 60 }  // Change FPS
}
```

## 📈 Monitoring

### Check Session Status

```sql
SELECT 
  session_code,
  status,
  desktop_connected,
  mobile_connected,
  created_at
FROM sessions
ORDER BY created_at DESC
LIMIT 10;
```

### Recording Stats

```sql
SELECT 
  posture_label,
  COUNT(*) as total,
  COUNT(CASE WHEN upload_status = 'COMPLETED' THEN 1 END) as completed,
  AVG(file_size_bytes / 1024 / 1024) as avg_mb
FROM recordings
GROUP BY posture_label;
```

## 🚀 Deployment Checklist

- [ ] Set production environment variables
- [ ] Update CORS_ORIGIN to production URL
- [ ] Run database migrations
- [ ] Create storage bucket
- [ ] Test upload with production URLs
- [ ] Enable HTTPS
- [ ] Set up monitoring/logging
- [ ] Configure error reporting
- [ ] Test on real mobile devices
- [ ] Load test with multiple sessions

## 📞 Quick Commands

```bash
# Start everything
cd backend && npm run start:dev &
cd frontend && npm run dev

# Database
psql posture_data
\dt                    # List tables
\d+ sessions          # Table schema

# Logs
tail -f backend/logs/*
# Browser: F12 > Console

# Reset database
psql posture_data < database-schema.sql

# Build for production
cd backend && npm run build
cd frontend && npm run build
```

## 💡 Pro Tips

1. Use Chrome for best WebRTC support
2. Keep browser DevTools open for debugging
3. Check network latency affects sync (~50-200ms normal)
4. Test on real mobile device before production
5. Monitor storage costs if using S3
6. Use Supabase free tier for development
7. Add `console.log` for timestamp debugging
8. Check `sync_events` table for troubleshooting

---

**Need Help?** Check `/docs` folder for detailed guides!
