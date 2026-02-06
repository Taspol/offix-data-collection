# System Architecture: Multi-View Posture Data Collection Platform

## Overview
Web-based platform for synchronized recording of desktop (front view) and mobile (side view) cameras to collect labeled posture analysis datasets.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
├──────────────────────────┬──────────────────────────────────┤
│  Desktop Browser         │  Mobile Browser                   │
│  - Next.js App           │  - Next.js App (same)             │
│  - Front Camera          │  - Side Camera                    │
│  - MediaRecorder         │  - MediaRecorder                  │
│  - Socket.io Client      │  - Socket.io Client               │
└──────────┬───────────────┴─────────────────┬────────────────┘
           │                                  │
           │         WebSocket + REST         │
           │                                  │
┌──────────┴──────────────────────────────────┴────────────────┐
│                      Backend Layer                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              NestJS API Server                          │ │
│  │  - REST API Controllers                                 │ │
│  │  - Socket.io Gateway (sync events)                      │ │
│  │  - Session Management Service                           │ │
│  │  - Recording Service                                    │ │
│  │  - Storage Service (presigned URLs)                     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────┬────────────────────────────────────┬──────────────┘
           │                                    │
    ┌──────┴──────┐                    ┌───────┴────────┐
    │  PostgreSQL │                    │  S3/Supabase   │
    │  Database   │                    │  Storage       │
    └─────────────┘                    └────────────────┘
```

## Key Design Decisions

### 1. Local Recording + Upload Pattern
**Decision**: Record videos locally on each device, then upload after recording.

**Rationale**:
- Avoids WebRTC peer-to-peer complexity
- Reduces network bandwidth during recording
- No video quality loss from streaming
- Simpler error handling
- Better mobile support

### 2. WebSocket Synchronization
**Decision**: Use Socket.io for real-time command synchronization.

**Events Flow**:
```
Backend → Clients: START_RECORDING { timestamp, postureLabel }
Clients record locally based on shared timestamp
Backend → Clients: STOP_RECORDING { timestamp }
Clients stop, then upload
```

### 3. Session State Machine
```
CREATED → WAITING_FOR_MOBILE → READY → RECORDING → UPLOADING → COMPLETED
```

**States**:
- `CREATED`: Desktop created session, waiting for mobile
- `WAITING_FOR_MOBILE`: Desktop ready, mobile not joined
- `READY`: Both devices connected and ready
- `RECORDING`: Active recording in progress
- `UPLOADING`: Recording stopped, uploading videos
- `COMPLETED`: All uploads finished

### 4. Presigned Upload URLs
**Decision**: Backend generates presigned URLs for direct client-to-storage upload.

**Benefits**:
- Videos never pass through backend server
- Reduces backend load
- Faster upload speeds
- Scalable architecture

## Data Flow

### Session Creation Flow
1. Desktop opens app → Creates session
2. Backend generates session ID + QR code
3. Mobile scans QR → Joins session
4. Both devices connect via WebSocket
5. Backend validates: 1 desktop + 1 mobile = READY

### Recording Flow
1. User starts posture step workflow
2. Backend sends `START_RECORDING` event with:
   - Posture label
   - Sync timestamp
   - Expected duration
3. Both devices start MediaRecorder at same time
4. After duration, backend sends `STOP_RECORDING`
5. Devices stop recording → Request upload URLs
6. Upload videos in parallel
7. Backend saves metadata

### Synchronization Mechanism
```typescript
// Backend sends with server timestamp
socket.emit('START_RECORDING', {
  sessionId: 'xxx',
  postureLabel: 'sit_straight',
  timestamp: Date.now(),
  duration: 10000
});

// Clients calculate time delta and align
const timeDelta = Date.now() - event.timestamp;
await new Promise(r => setTimeout(r, Math.max(0, -timeDelta)));
startRecording();
```

## Component Breakdown

### Backend Components

#### 1. Session Module
- Create/join/validate sessions
- Generate QR codes
- Manage session state

#### 2. WebSocket Gateway
- Handle device connections
- Broadcast sync events
- Track connected devices per session

#### 3. Storage Module
- Generate presigned upload URLs (S3/Supabase)
- Handle upload confirmations
- Manage file paths

#### 4. Recording Module
- Manage posture step workflow
- Store video metadata
- Query dataset

### Frontend Components

#### 1. Session Manager
- Create/join session UI
- QR code display/scanner
- Connection status

#### 2. Camera Handler
- Request camera permissions
- Initialize MediaRecorder
- Handle recording state

#### 3. Sync Controller
- Listen to WebSocket events
- Synchronize recording start/stop
- Handle timestamps

#### 4. Upload Handler
- Request presigned URLs
- Upload video blobs
- Report upload status

#### 5. Posture Workflow
- Display current posture instruction
- Show countdown timer
- Track progress through steps

## Security Considerations

1. **Session Validation**: Verify session ID and device type on join
2. **Rate Limiting**: Prevent session spam
3. **Presigned URL Expiry**: Short-lived URLs (5 minutes)
4. **CORS**: Configure for frontend domain only
5. **File Size Limits**: Validate video size before upload
6. **Authentication** (future): Add user auth for production

## Scalability Notes

- **Horizontal scaling**: Stateless REST API scales easily
- **WebSocket scaling**: Use Redis adapter for multi-instance Socket.io
- **Storage**: S3 handles any dataset size
- **Database**: Index on session_id, created_at for fast queries

## Technology Choices Summary

| Layer | Technology | Reason |
|-------|-----------|--------|
| Frontend | Next.js + TypeScript | SSR, great DX, TypeScript safety |
| Styling | Tailwind CSS | Fast development, responsive |
| Real-time | Socket.io | Reliable, auto-reconnect, rooms |
| Backend | NestJS | Modular, TypeScript, production-ready |
| Database | PostgreSQL | Relational data, strong consistency |
| Storage | S3/Supabase | Scalable object storage |
| Video | MediaRecorder API | Native browser support |

## Future Enhancements

1. Add authentication (NextAuth.js)
2. Dataset export tools (CSV metadata + zip videos)
3. Real-time preview thumbnails
4. Retry failed uploads
5. Recording quality settings
6. Multiple posture sequences
7. Analytics dashboard
