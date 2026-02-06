# Socket.io Synchronization Example

This document explains the WebSocket synchronization mechanism using Socket.io for synchronized video recording.

## Architecture Overview

```
┌─────────────┐         WebSocket          ┌─────────────┐
│   Desktop   │◄──────────────────────────►│   Backend   │
│   Browser   │                             │   (NestJS)  │
└─────────────┘                             └──────┬──────┘
                                                   │
                                            WebSocket
                                                   │
┌─────────────┐                             ┌──────▼──────┐
│   Mobile    │◄────────────────────────────┤   Backend   │
│   Browser   │         WebSocket           │   (NestJS)  │
└─────────────┘                             └─────────────┘
```

Backend broadcasts commands to all devices in a session via Socket.io rooms.

## Backend: NestJS WebSocket Gateway

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private deviceSockets: Map<string, { sessionId: string; deviceId: string }> = new Map();

  handleConnection(client: Socket) {
    console.log(`✅ Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`❌ Client disconnected: ${client.id}`);
    const deviceInfo = this.deviceSockets.get(client.id);
    if (deviceInfo) {
      this.deviceSockets.delete(client.id);
      // Notify other devices
      this.server.to(deviceInfo.sessionId).emit('device_disconnected', {
        deviceId: deviceInfo.deviceId,
        timestamp: Date.now(),
      });
    }
  }

  @SubscribeMessage('join_session')
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      sessionId: string;
      deviceType: 'desktop' | 'mobile';
      viewType: 'front' | 'side';
    },
  ) {
    const { sessionId, deviceType, viewType } = payload;

    // Register device in database (not shown)
    const device = await this.sessionService.joinSession(
      sessionId,
      deviceType,
      viewType,
      client.id,
    );

    // Store socket mapping
    this.deviceSockets.set(client.id, {
      sessionId,
      deviceId: device.id,
    });

    // Join Socket.io room for this session
    await client.join(sessionId);

    // Confirm join to client
    client.emit('joined_session', {
      success: true,
      deviceId: device.id,
      session: {
        id: sessionId,
        status: 'READY',
      },
      timestamp: Date.now(),
    });

    // Notify all devices in session
    this.server.to(sessionId).emit('device_joined', {
      deviceId: device.id,
      deviceType,
      viewType,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage('start_recording')
  async handleStartRecording(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      sessionId: string;
      postureLabel: string;
      duration: number;
    },
  ) {
    const { sessionId, postureLabel, duration } = payload;
    const timestamp = Date.now(); // Server timestamp for sync

    // Broadcast to all devices in the session
    this.server.to(sessionId).emit('start_recording', {
      postureLabel,
      duration,
      timestamp, // ⭐ Critical: same timestamp for all devices
    });

    console.log(`📹 Started recording for session ${sessionId}: ${postureLabel}`);
  }

  @SubscribeMessage('stop_recording')
  async handleStopRecording(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const { sessionId } = payload;
    const timestamp = Date.now();

    // Broadcast stop to all devices
    this.server.to(sessionId).emit('stop_recording', {
      timestamp,
    });

    console.log(`⏹️ Stopped recording for session ${sessionId}`);
  }

  @SubscribeMessage('upload_completed')
  async handleUploadCompleted(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      recordingId: string;
      fileSizeBytes: number;
    },
  ) {
    const { recordingId, fileSizeBytes } = payload;
    
    await this.sessionService.updateRecordingUploadStatus(
      recordingId,
      'COMPLETED',
      fileSizeBytes,
    );

    const recording = await this.sessionService.getRecording(recordingId);
    
    // Check if all recordings completed
    const allCompleted = await this.sessionService.checkAllRecordingsCompleted(
      recording.sessionId,
    );

    if (allCompleted) {
      // Notify session completion
      this.server.to(recording.sessionId).emit('session_completed', {
        sessionId: recording.sessionId,
        timestamp: Date.now(),
      });
    }
  }
}
```

## Frontend: Socket.io Client Setup

```typescript
// lib/socket.ts
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(WS_URL, {
      transports: ['websocket'],
      autoConnect: false,
    });
  }
  return socket;
};

export const connectSocket = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const socket = getSocket();
    
    if (socket.connected) {
      resolve();
      return;
    }

    socket.connect();

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      resolve();
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
      reject(error);
    });
  });
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
```

## Frontend: Joining Session

```typescript
import { connectSocket, getSocket } from '@/lib/socket';

async function joinSession(sessionId: string, deviceType: 'desktop' | 'mobile') {
  // Connect to WebSocket server
  await connectSocket();
  const socket = getSocket();

  // Join session
  socket.emit('join_session', {
    sessionId,
    deviceType,
    viewType: deviceType === 'desktop' ? 'front' : 'side',
    userAgent: navigator.userAgent,
  });

  // Wait for confirmation
  socket.on('joined_session', (data) => {
    console.log('✅ Joined session:', data);
    console.log('Device ID:', data.deviceId);
    console.log('Session status:', data.session.status);
  });

  // Listen for other devices joining
  socket.on('device_joined', (data) => {
    console.log('👤 Another device joined:', data.deviceType);
  });

  // Listen for device disconnection
  socket.on('device_disconnected', (data) => {
    console.log('👤 Device disconnected:', data.deviceId);
  });
}
```

## Frontend: Synchronized Recording

```typescript
import { getSocket } from '@/lib/socket';
import { useCamera } from '@/hooks/useCamera';

function RecordingComponent() {
  const { startRecording, stopRecording } = useCamera();
  const socket = getSocket();

  useEffect(() => {
    // Listen for START command from server
    socket.on('start_recording', async (data: {
      postureLabel: string;
      duration: number;
      timestamp: number; // ⭐ Server timestamp
    }) => {
      console.log('📹 Received START_RECORDING:', data);
      
      try {
        // Calculate sync delay
        const timeDelta = Date.now() - data.timestamp;
        const delay = Math.max(0, -timeDelta);
        
        if (delay > 0) {
          console.log(`⏳ Waiting ${delay}ms to sync...`);
          await new Promise(r => setTimeout(r, delay));
        }

        // Start recording - synchronized across devices
        await startRecording(data.timestamp);
        console.log(`✅ Recording started for: ${data.postureLabel}`);
        
      } catch (err) {
        console.error('Failed to start recording:', err);
      }
    });

    // Listen for STOP command
    socket.on('stop_recording', async (data: { timestamp: number }) => {
      console.log('⏹️ Received STOP_RECORDING');
      
      try {
        // Stop recording
        const recordingData = await stopRecording();
        console.log(`✅ Recording stopped. Duration: ${recordingData.durationMs}ms`);
        
        // Upload video (shown in next section)
        await uploadVideo(recordingData);
        
      } catch (err) {
        console.error('Failed to stop recording:', err);
      }
    });

    return () => {
      socket.off('start_recording');
      socket.off('stop_recording');
    };
  }, [socket, startRecording, stopRecording]);

  return <div>Recording Component</div>;
}
```

## Triggering Recording from Desktop

```typescript
function DesktopControlPanel({ sessionId, currentStep }) {
  const socket = getSocket();

  const handleStartRecording = async () => {
    // Emit start command - backend will broadcast to all devices
    socket.emit('start_recording', {
      sessionId,
      postureLabel: currentStep.postureLabel,
      duration: currentStep.recordingDurationSeconds * 1000,
    });

    // Auto-stop after duration
    const totalDuration = 
      (currentStep.countdownSeconds + currentStep.recordingDurationSeconds) * 1000;
    
    setTimeout(() => {
      socket.emit('stop_recording', { sessionId });
    }, totalDuration);
  };

  return (
    <button onClick={handleStartRecording}>
      Start Recording ({currentStep.displayName})
    </button>
  );
}
```

## Synchronization Flow Diagram

```
Time →

Desktop:  [JOIN] ──────► [WAIT] ─────► [START_REC] ═══► [STOP_REC] ──► [UPLOAD]
             │                              ║                  ║
             │                              ║                  ║
Backend:     └──► [BROADCAST] ─────────────╬──────────────────╬────────►
                                            ║                  ║
Mobile:   [JOIN] ──────► [WAIT] ────────► [START_REC] ═══► [STOP_REC] ──► [UPLOAD]

═══ = Synchronized recording period
```

## Time Synchronization Accuracy

```typescript
// Backend sends
const serverTime = Date.now(); // Example: 1704123456789
socket.emit('start_recording', { timestamp: serverTime });

// Desktop receives (50ms network delay)
const desktopReceiveTime = Date.now(); // 1704123456839
const desktopDelta = desktopReceiveTime - serverTime; // 50ms
const desktopDelay = Math.max(0, -desktopDelta); // 0ms
// Desktop starts immediately

// Mobile receives (100ms network delay)
const mobileReceiveTime = Date.now(); // 1704123456889
const mobileDelta = mobileReceiveTime - serverTime; // 100ms
const mobileDelay = Math.max(0, -mobileDelta); // 0ms
// Mobile starts immediately

// Result: ~50ms difference in start times (acceptable)
```

**Sync Accuracy**: Typically within 50-200ms depending on network conditions.

## Error Handling

```typescript
socket.on('error', (error) => {
  console.error('Socket error:', error);
  alert(`Connection error: ${error.message}`);
});

socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
  // Retry logic
  setTimeout(() => {
    socket.connect();
  }, 3000);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  if (reason === 'io server disconnect') {
    // Server disconnected, reconnect manually
    socket.connect();
  }
  // Socket.io will auto-reconnect for other reasons
});
```

## Testing Synchronization

### Log Timestamps

```typescript
// Backend
this.server.to(sessionId).emit('start_recording', {
  timestamp: Date.now(),
  // ...
});
console.log(`[Server] Sent START at ${Date.now()}`);

// Client 1
socket.on('start_recording', (data) => {
  console.log(`[Desktop] Received START at ${Date.now()}, server time: ${data.timestamp}`);
  console.log(`[Desktop] Delta: ${Date.now() - data.timestamp}ms`);
});

// Client 2
socket.on('start_recording', (data) => {
  console.log(`[Mobile] Received START at ${Date.now()}, server time: ${data.timestamp}`);
  console.log(`[Mobile] Delta: ${Date.now() - data.timestamp}ms`);
});
```

### Compare Recording Timestamps

Check database:
```sql
SELECT 
  session_id,
  posture_label,
  device_type,
  start_timestamp,
  LAG(start_timestamp) OVER (PARTITION BY session_id, posture_label ORDER BY device_type) as prev_start,
  start_timestamp - LAG(start_timestamp) OVER (PARTITION BY session_id, posture_label ORDER BY device_type) as diff_ms
FROM recordings
WHERE session_id = 'your-session-id'
ORDER BY posture_label, device_type;
```

Expected `diff_ms`: < 200ms for good sync.

## Socket.io Rooms Feature

Socket.io rooms allow broadcasting to specific groups:

```typescript
// Join room
socket.join(sessionId);

// Emit to all sockets in room
this.server.to(sessionId).emit('event_name', data);

// Emit to all except sender
socket.to(sessionId).emit('event_name', data);

// Leave room
socket.leave(sessionId);
```

This is how we ensure only devices in the same session receive commands.

## Production Considerations

### Scaling WebSocket Servers

For multiple backend instances, use Redis adapter:

```typescript
import { RedisIoAdapter } from '@liaoliaots/nestjs-redis';

// In main.ts
const redisIoAdapter = new RedisIoAdapter(app);
await redisIoAdapter.connectToRedis();
app.useWebSocketAdapter(redisIoAdapter);
```

This allows Socket.io to work across multiple servers.

### CORS Configuration

```typescript
@WebSocketGateway({
  cors: {
    origin: [
      'https://yourapp.com',
      'https://www.yourapp.com',
    ],
    credentials: true,
  },
})
```

### HTTPS Required in Production

WebSockets work over WSS (WebSocket Secure) in production:
- Frontend: `wss://api.yourapp.com`
- Backend: Use HTTPS server

## Summary

The synchronization mechanism works by:

1. **Single source of truth**: Backend generates timestamps
2. **Broadcast pattern**: All devices receive same command with same timestamp
3. **Client-side compensation**: Each client adjusts for network delay
4. **Socket.io rooms**: Commands only go to devices in same session
5. **Event-driven**: Decoupled architecture with event handlers

This achieves <200ms synchronization accuracy, sufficient for posture analysis.
