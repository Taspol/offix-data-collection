# MediaRecorder Usage Example

This document explains how to use the browser's MediaRecorder API for video recording in the posture data collection platform.

## Basic MediaRecorder Setup

```typescript
// Get camera stream
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'user',  // 'user' for front, 'environment' for back
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
});

// Create MediaRecorder
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'video/webm;codecs=vp9',  // VP9 codec for better compression
});

// Store video chunks
const chunks: Blob[] = [];

mediaRecorder.ondataavailable = (event) => {
  if (event.data.size > 0) {
    chunks.push(event.data);
  }
};

// Start recording (collect data every 100ms)
mediaRecorder.start(100);

// Stop recording
mediaRecorder.stop();

// Handle stop event
mediaRecorder.onstop = () => {
  const videoBlob = new Blob(chunks, { type: 'video/webm' });
  // Now you can upload or process the blob
};
```

## Synchronized Recording with Server Timestamp

```typescript
/**
 * Start recording synchronized with other devices
 * @param serverTimestamp - Unix timestamp (ms) from server when START command was sent
 */
async function startRecordingSync(serverTimestamp: number): Promise<void> {
  // Calculate time difference between client and server
  const clientTime = Date.now();
  const timeDelta = clientTime - serverTimestamp;
  
  // If server timestamp is in the future (negative delta), wait
  const delay = Math.max(0, -timeDelta);
  
  if (delay > 0) {
    console.log(`Waiting ${delay}ms to sync...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  // Now start recording - all clients should start at approximately the same time
  const actualStartTime = Date.now();
  mediaRecorder.start(100);
  
  console.log(`Recording started. Sync offset: ${actualStartTime - serverTimestamp}ms`);
}
```

## Complete Recording Hook (React)

```typescript
import { useState, useRef, useCallback } from 'react';

export interface RecordingData {
  blob: Blob;
  startTimestamp: number;
  stopTimestamp: number;
  durationMs: number;
}

export const useCamera = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimestampRef = useRef<number>(0);

  // Request camera access
  const requestCamera = useCallback(async (facingMode: 'user' | 'environment' = 'user') => {
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setError(null);
      return mediaStream;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to access camera';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Start recording with sync
  const startRecording = useCallback(
    async (serverTimestamp: number): Promise<void> => {
      if (!stream) {
        throw new Error('No camera stream available');
      }

      // Sync delay calculation
      const timeDelta = Date.now() - serverTimestamp;
      const delay = Math.max(0, -timeDelta);
      
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Reset chunks and timestamp
      chunksRef.current = [];
      startTimestampRef.current = Date.now();

      // Create and start MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
    },
    [stream],
  );

  // Stop recording and return data
  const stopRecording = useCallback((): Promise<RecordingData> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;

      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        reject(new Error('No active recording'));
        return;
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const stopTimestamp = Date.now();
        const durationMs = stopTimestamp - startTimestampRef.current;

        setIsRecording(false);
        
        resolve({
          blob,
          startTimestamp: startTimestampRef.current,
          stopTimestamp,
          durationMs,
        });
      };

      mediaRecorder.stop();
    });
  }, []);

  // Release camera resources
  const releaseCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, [stream]);

  return {
    stream,
    isRecording,
    error,
    requestCamera,
    startRecording,
    stopRecording,
    releaseCamera,
  };
};
```

## Usage in Component

```typescript
import { useCamera } from '@/hooks/useCamera';
import { useEffect, useRef } from 'react';

function RecordingComponent() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    stream,
    isRecording,
    requestCamera,
    startRecording,
    stopRecording,
    releaseCamera,
  } = useCamera();

  // Setup video preview
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Request camera on mount
  useEffect(() => {
    requestCamera('user');
    return () => releaseCamera();
  }, []);

  // Handle WebSocket start event
  useEffect(() => {
    socket.on('start_recording', async (data: { timestamp: number }) => {
      await startRecording(data.timestamp);
    });

    socket.on('stop_recording', async () => {
      const recordingData = await stopRecording();
      // Upload recordingData.blob
    });

    return () => {
      socket.off('start_recording');
      socket.off('stop_recording');
    };
  }, [startRecording, stopRecording]);

  return (
    <div>
      <video ref={videoRef} autoPlay playsInline muted />
      {isRecording && <div>Recording...</div>}
    </div>
  );
}
```

## Supported Formats

Different browsers support different codecs:

```typescript
// Check supported MIME types
const mimeTypes = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

for (const mimeType of mimeTypes) {
  if (MediaRecorder.isTypeSupported(mimeType)) {
    console.log(`✓ Supported: ${mimeType}`);
  }
}
```

**Recommendations:**
- **Chrome/Edge**: `video/webm;codecs=vp9` (best compression)
- **Firefox**: `video/webm;codecs=vp8`
- **Safari**: `video/mp4` (H.264)

## Common Issues and Solutions

### Issue: Permission Denied
```typescript
try {
  await requestCamera();
} catch (err) {
  if (err.name === 'NotAllowedError') {
    alert('Please allow camera access in browser settings');
  }
}
```

### Issue: HTTPS Required
MediaRecorder requires HTTPS in production (localhost works with HTTP).

### Issue: Safari Compatibility
Safari has limited codec support. Use fallback:

```typescript
let mimeType = 'video/webm;codecs=vp9';
if (!MediaRecorder.isTypeSupported(mimeType)) {
  mimeType = 'video/mp4';
}
const mediaRecorder = new MediaRecorder(stream, { mimeType });
```

## Performance Tips

1. **Chunk Collection**: Use `start(timeslice)` to collect data periodically
   ```typescript
   mediaRecorder.start(100); // Collect every 100ms
   ```

2. **Video Constraints**: Balance quality and file size
   ```typescript
   video: {
     width: { ideal: 1280 },  // Good balance
     height: { ideal: 720 },
     frameRate: { ideal: 30 }, // Standard framerate
   }
   ```

3. **Memory Management**: Release camera when not needed
   ```typescript
   stream.getTracks().forEach(track => track.stop());
   ```

## Testing Synchronization

Log timestamps to verify sync:

```typescript
mediaRecorder.onstart = () => {
  console.log(`Recording started at: ${Date.now()}`);
};

mediaRecorder.onstop = () => {
  const duration = Date.now() - startTimestamp;
  console.log(`Recording stopped. Duration: ${duration}ms`);
};
```

Compare logs across devices to check sync accuracy (should be within ~50-100ms).
