# Multi-View Posture Data Collection Platform

A production-ready web application for collecting synchronized multi-view video data for sitting posture analysis using WebRTC, WebSockets, and cloud storage.

## 🎯 Features

- **Synchronized Recording**: Desktop and mobile cameras start/stop at exactly the same time
- **WebSocket Coordination**: Real-time communication for perfect synchronization
- **Guided Workflow**: Step-by-step posture instructions with countdown timers
- **Cloud Storage**: Automatic upload to S3 or Supabase Storage
- **Session Management**: QR code-based mobile joining
- **Type-Safe**: Full TypeScript implementation
- **Production-Ready**: Clean architecture with error handling

## 📁 Project Structure

```
data_collection/
├── backend/                 # NestJS backend API
│   ├── src/
│   │   ├── entities/       # TypeORM entities
│   │   ├── session/        # Session module
│   │   ├── sync/           # WebSocket gateway
│   │   ├── storage/        # Storage service
│   │   └── posture/        # Posture steps
│   ├── package.json
│   └── tsconfig.json
├── frontend/               # Next.js frontend
│   ├── src/
│   │   ├── app/           # Next.js 14 App Router
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom hooks (camera)
│   │   ├── lib/           # API & Socket utilities
│   │   └── store/         # Zustand state management
│   ├── package.json
│   └── tsconfig.json
├── database-schema.sql     # PostgreSQL schema
└── ARCHITECTURE.md         # System design documentation
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm/yarn
- PostgreSQL 14+
- Supabase account OR AWS S3 bucket

### 1. Database Setup

```bash
# Create PostgreSQL database
createdb posture_data

# Run schema
psql posture_data < database-schema.sql
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database and storage credentials

# Start development server
npm run start:dev
```

Backend will run on `http://localhost:3001`

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local if backend URL differs

# Start development server
npm run dev
```

Frontend will run on `http://localhost:3000`

## 📱 Usage

### Desktop Workflow

1. Open `http://localhost:3000` in a desktop browser
2. Click "Start as Desktop"
3. A session will be created with a QR code
4. Wait for mobile device to join
5. Once both connected, start recording postures
6. Progress through all posture steps
7. Videos upload automatically after each recording

### Mobile Workflow

1. Open `http://localhost:3000` on mobile
2. Click "Join as Mobile"
3. Scan QR code from desktop OR enter session code
4. Position phone for side view
5. Recording starts automatically when desktop triggers it

## 🔧 Configuration

### Backend (.env)

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/posture_data
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=user
DATABASE_PASSWORD=password
DATABASE_NAME=posture_data

# Storage (choose one)
STORAGE_PROVIDER=supabase  # or 's3'

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-key
SUPABASE_BUCKET=posture-videos

# OR AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
S3_BUCKET=posture-videos

# Server
PORT=3001
CORS_ORIGIN=http://localhost:3000
UPLOAD_URL_EXPIRY=300
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

## 🎥 How Synchronization Works

### Time Synchronization Algorithm

```typescript
// Backend broadcasts START_RECORDING with server timestamp
socket.emit('start_recording', {
  postureLabel: 'sit_straight',
  timestamp: Date.now(),  // Server time
  duration: 10000
});

// Client calculates time delta and waits if needed
const timeDelta = Date.now() - serverTimestamp;
const delay = Math.max(0, -timeDelta);
await new Promise(r => setTimeout(r, delay));
startRecording();
```

### Recording Flow

1. **Backend**: Sends `START_RECORDING` event with synchronized timestamp
2. **Clients**: Both desktop and mobile receive event
3. **Sync**: Each client calculates time delta and adjusts start time
4. **Record**: MediaRecorder starts on both devices
5. **Stop**: Backend sends `STOP_RECORDING` after duration
6. **Upload**: Each device uploads video to presigned URL
7. **Complete**: Backend marks recording as completed

## 📊 Database Schema

### Key Tables

- **sessions**: Tracks recording sessions with status and connection info
- **devices**: Connected devices (desktop/mobile) per session
- **posture_steps**: Predefined posture labels and instructions
- **recordings**: Video metadata for each recorded clip
- **sync_events**: Event log for debugging synchronization

### Session State Machine

```
CREATED → WAITING_FOR_MOBILE → READY → RECORDING → UPLOADING → COMPLETED
```

## 🔐 Security Features

- Presigned upload URLs with 5-minute expiry
- CORS configuration for frontend domain
- Session validation on device join
- SQL injection prevention (TypeORM parameterized queries)
- No video data passes through backend (direct to storage)

## 🧪 Testing

### Manual Testing

1. Open desktop in one browser window
2. Open mobile simulator (Chrome DevTools) or real device
3. Create session on desktop
4. Join from mobile using session code
5. Verify both cameras appear
6. Test recording and upload

### Testing Synchronization

- Check browser console for timestamp logs
- Use `sync_events` table to analyze timing
- View `recording_pairs` view for sync accuracy

## 📦 Production Deployment

### Backend (NestJS)

```bash
cd backend
npm run build
npm run start:prod
```

**Deployment options:**
- Docker + Kubernetes
- AWS ECS/Fargate
- Railway, Render, Fly.io
- VPS (DigitalOcean, Linode)

### Frontend (Next.js)

```bash
cd frontend
npm run build
npm run start
```

**Deployment options:**
- Vercel (recommended for Next.js)
- Netlify
- AWS Amplify
- Docker + Nginx

### Database

- Managed PostgreSQL (Supabase, AWS RDS, DigitalOcean)
- Self-hosted with backups

### Storage

- Supabase Storage (easiest)
- AWS S3
- MinIO (self-hosted S3-compatible)

## 🔍 Troubleshooting

### Camera Not Working

- Check browser permissions (Settings > Privacy > Camera)
- HTTPS required in production (HTTP works on localhost)
- Safari: may need special permission prompts

### Connection Issues

- Verify backend is running on port 3001
- Check CORS settings in backend
- Ensure WebSocket ports are open
- Check firewall rules

### Upload Failures

- Verify storage credentials in .env
- Check presigned URL expiry (default 5 min)
- Ensure bucket exists and is accessible
- Check CORS on S3/Supabase bucket

### Sync Issues

- Check system time on both devices
- Verify network latency is reasonable (< 500ms)
- Check sync_events table for timing data

## 🛠️ Development Tips

### Adding New Posture Steps

```sql
INSERT INTO posture_steps (
  step_order, 
  posture_label, 
  display_name, 
  instructions,
  countdown_seconds,
  recording_duration_seconds
) VALUES (
  7,
  'custom_posture',
  'Custom Posture',
  'Your instructions here',
  3,
  10
);
```

### Adjusting Recording Duration

Edit in database:
```sql
UPDATE posture_steps 
SET recording_duration_seconds = 15 
WHERE posture_label = 'sit_straight';
```

### Debugging WebSocket Events

Add logging to frontend:
```typescript
const socket = getSocket();
socket.onAny((event, ...args) => {
  console.log(`Socket Event: ${event}`, args);
});
```

## 📚 API Reference

### REST Endpoints

```
POST   /api/sessions              - Create new session
GET    /api/sessions/:id          - Get session details
GET    /api/sessions/code/:code   - Get session by code
POST   /api/sessions/:id/upload-url - Get presigned upload URL
POST   /api/sessions/recordings/:id/complete - Mark upload complete
GET    /api/postures              - Get all posture steps
```

### WebSocket Events

**Client → Server:**
- `join_session` - Join as device
- `start_recording` - Initiate recording
- `stop_recording` - Stop recording
- `upload_started` - Upload began
- `upload_completed` - Upload finished

**Server → Client:**
- `joined_session` - Join confirmed
- `device_joined` - Another device joined
- `start_recording` - Begin recording
- `stop_recording` - Stop recording
- `next_step_ready` - Next posture available
- `session_completed` - All recordings done

## 📄 License

MIT

## 👥 Support

For questions or issues, please create an issue in the repository.

## 🎓 Learning Resources

- [WebRTC MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Socket.io Documentation](https://socket.io/docs/v4/)
- [NestJS WebSockets](https://docs.nestjs.com/websockets/gateways)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Zustand State Management](https://docs.pmnd.rs/zustand/getting-started/introduction)

---

Built with ❤️ using Next.js, NestJS, PostgreSQL, and Socket.io
