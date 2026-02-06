# Video Upload with Presigned URLs

This document explains how to upload videos directly to cloud storage (S3/Supabase) using presigned URLs, bypassing the backend server.

## Architecture

```
┌─────────────┐                    ┌─────────────┐                    ┌─────────────┐
│   Client    │ ─── Request URL ──►│   Backend   │                    │             │
│   Browser   │                    │   (NestJS)  │                    │  S3/Storage │
│             │◄── Presigned URL ──│             │                    │             │
│             │                    └─────────────┘                    │             │
│             │                                                       │             │
│             │ ───────────── Upload Video Directly ────────────────►│             │
└─────────────┘                                                       └─────────────┘
```

**Benefits:**
- Videos never pass through backend (reduces server load)
- Faster uploads (direct to storage)
- Scalable (storage handles bandwidth)
- Secure (presigned URLs expire)

## Backend: Storage Service

### Supabase Storage

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface UploadUrlResponse {
  uploadUrl: string;
  storagePath: string;
  expiresIn: number;
}

@Injectable()
export class StorageService {
  private supabase: SupabaseClient;
  private bucket: string;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get('SUPABASE_URL');
    const supabaseKey = this.configService.get('SUPABASE_KEY');
    this.bucket = this.configService.get('SUPABASE_BUCKET');
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async generateUploadUrl(
    sessionId: string,
    deviceType: string,
    viewType: string,
    postureLabel: string,
    recordingId: string,
  ): Promise<UploadUrlResponse> {
    // Generate storage path
    const filename = `${recordingId}.webm`;
    const storagePath = `sessions/${sessionId}/${deviceType}-${viewType}/${postureLabel}/${filename}`;

    // Create presigned upload URL (5 minutes expiry)
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUploadUrl(storagePath);

    if (error) {
      throw new Error(`Failed to generate upload URL: ${error.message}`);
    }

    return {
      uploadUrl: data.signedUrl,
      storagePath,
      expiresIn: 300, // 5 minutes
    };
  }

  async getDownloadUrl(storagePath: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      throw new Error(`Failed to generate download URL: ${error.message}`);
    }

    return data.signedUrl;
  }
}
```

### AWS S3

```typescript
import * as AWS from 'aws-sdk';

export class StorageService {
  private s3: AWS.S3;
  private bucket: string;

  constructor(private configService: ConfigService) {
    this.s3 = new AWS.S3({
      region: this.configService.get('AWS_REGION'),
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
    });
    this.bucket = this.configService.get('S3_BUCKET');
  }

  async generateUploadUrl(
    sessionId: string,
    deviceType: string,
    viewType: string,
    postureLabel: string,
    recordingId: string,
  ): Promise<UploadUrlResponse> {
    const filename = `${recordingId}.webm`;
    const storagePath = `sessions/${sessionId}/${deviceType}-${viewType}/${postureLabel}/${filename}`;

    // Generate presigned PUT URL
    const uploadUrl = await this.s3.getSignedUrlPromise('putObject', {
      Bucket: this.bucket,
      Key: storagePath,
      Expires: 300, // 5 minutes
      ContentType: 'video/webm',
    });

    return {
      uploadUrl,
      storagePath,
      expiresIn: 300,
    };
  }

  async getDownloadUrl(storagePath: string, expiresIn = 3600): Promise<string> {
    return this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucket,
      Key: storagePath,
      Expires: expiresIn,
    });
  }
}
```

## Backend: API Endpoint

```typescript
import { Controller, Post, Param, Body } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { SessionService } from './session.service';

@Controller('api/sessions')
export class SessionController {
  constructor(
    private readonly storageService: StorageService,
    private readonly sessionService: SessionService,
  ) {}

  @Post(':sessionId/upload-url')
  async getUploadUrl(
    @Param('sessionId') sessionId: string,
    @Body() body: {
      recordingId: string;
      deviceType: string;
      viewType: string;
      postureLabel: string;
    },
  ) {
    const { recordingId, deviceType, viewType, postureLabel } = body;

    // Generate presigned URL
    const uploadInfo = await this.storageService.generateUploadUrl(
      sessionId,
      deviceType,
      viewType,
      postureLabel,
      recordingId,
    );

    // Save storage path to database
    await this.sessionService.updateRecordingMetadata(recordingId, {
      storagePath: uploadInfo.storagePath,
    });

    return uploadInfo;
  }

  @Post('recordings/:recordingId/complete')
  async completeUpload(
    @Param('recordingId') recordingId: string,
    @Body() body: {
      stopTimestamp: number;
      durationMs: number;
      fileSizeBytes: number;
    },
  ) {
    await this.sessionService.updateRecordingMetadata(recordingId, {
      stopTimestamp: body.stopTimestamp,
      durationMs: body.durationMs,
    });

    await this.sessionService.updateRecordingUploadStatus(
      recordingId,
      'COMPLETED',
      body.fileSizeBytes,
    );

    return { success: true };
  }
}
```

## Frontend: API Client

```typescript
// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface UploadUrlResponse {
  uploadUrl: string;
  storagePath: string;
  expiresIn: number;
}

export const api = {
  async getUploadUrl(
    sessionId: string,
    recordingId: string,
    deviceType: string,
    viewType: string,
    postureLabel: string,
  ): Promise<UploadUrlResponse> {
    const response = await fetch(`${API_URL}/api/sessions/${sessionId}/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordingId,
        deviceType,
        viewType,
        postureLabel,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to get upload URL');
    }
    
    return response.json();
  },

  async uploadVideo(uploadUrl: string, videoBlob: Blob): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: videoBlob,
      headers: {
        'Content-Type': 'video/webm',
      },
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
  },

  async completeUpload(
    recordingId: string,
    data: {
      stopTimestamp: number;
      durationMs: number;
      fileSizeBytes: number;
    },
  ): Promise<void> {
    await fetch(`${API_URL}/api/sessions/recordings/${recordingId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
};
```

## Frontend: Complete Upload Flow

```typescript
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useCamera, RecordingData } from '@/hooks/useCamera';

async function uploadVideo(
  recordingData: RecordingData,
  sessionId: string,
  deviceType: string,
  viewType: string,
  postureLabel: string,
) {
  const socket = getSocket();

  try {
    // 1. Generate unique recording ID
    const recordingId = crypto.randomUUID();
    
    // 2. Notify backend upload is starting
    socket.emit('upload_started', { recordingId });
    
    // 3. Get presigned upload URL from backend
    console.log('📤 Requesting upload URL...');
    const uploadInfo = await api.getUploadUrl(
      sessionId,
      recordingId,
      deviceType,
      viewType,
      postureLabel,
    );
    
    console.log(`📤 Uploading to: ${uploadInfo.storagePath}`);
    console.log(`📤 URL expires in: ${uploadInfo.expiresIn}s`);
    
    // 4. Upload video directly to storage
    await api.uploadVideo(uploadInfo.uploadUrl, recordingData.blob);
    
    console.log('✅ Upload completed');
    
    // 5. Mark upload as complete in backend
    await api.completeUpload(recordingId, {
      stopTimestamp: recordingData.stopTimestamp,
      durationMs: recordingData.durationMs,
      fileSizeBytes: recordingData.blob.size,
    });
    
    // 6. Notify via WebSocket
    socket.emit('upload_completed', {
      recordingId,
      fileSizeBytes: recordingData.blob.size,
    });
    
    console.log('✅ Upload confirmed');
    
  } catch (error) {
    console.error('❌ Upload failed:', error);
    throw error;
  }
}
```

## Frontend: React Component Integration

```typescript
import { useState, useEffect } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { getSocket } from '@/lib/socket';
import { api } from '@/lib/api';

function RecordingComponent({
  sessionId,
  deviceType,
  viewType,
  currentPosture,
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const { stopRecording } = useCamera();
  const socket = getSocket();

  useEffect(() => {
    socket.on('stop_recording', async () => {
      try {
        // Stop recording
        const recordingData = await stopRecording();
        
        // Upload
        setIsUploading(true);
        await uploadVideo(
          recordingData,
          sessionId,
          deviceType,
          viewType,
          currentPosture.postureLabel,
        );
        setIsUploading(false);
        
      } catch (error) {
        console.error('Upload error:', error);
        setIsUploading(false);
        alert('Upload failed. Please try again.');
      }
    });

    return () => {
      socket.off('stop_recording');
    };
  }, []);

  return (
    <div>
      {isUploading && (
        <div className="upload-overlay">
          <div className="spinner" />
          <p>Uploading video...</p>
        </div>
      )}
    </div>
  );
}
```

## Upload Progress Tracking (Optional)

For large files, you can track upload progress:

```typescript
async function uploadVideoWithProgress(
  uploadUrl: string,
  videoBlob: Blob,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', 'video/webm');
    xhr.send(videoBlob);
  });
}

// Usage
await uploadVideoWithProgress(
  uploadInfo.uploadUrl,
  recordingData.blob,
  (percent) => {
    console.log(`Upload progress: ${percent}%`);
    setUploadProgress(percent);
  },
);
```

## Error Handling

```typescript
async function uploadVideoWithRetry(
  recordingData: RecordingData,
  sessionId: string,
  deviceType: string,
  viewType: string,
  postureLabel: string,
  maxRetries = 3,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await uploadVideo(
        recordingData,
        sessionId,
        deviceType,
        viewType,
        postureLabel,
      );
      return; // Success
    } catch (error) {
      console.error(`Upload attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        throw new Error(`Upload failed after ${maxRetries} attempts`);
      }
      
      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

## Storage Path Structure

Videos are organized in storage:

```
posture-videos/
└── sessions/
    └── {session-id}/
        ├── desktop-front/
        │   ├── sit_straight/
        │   │   └── {recording-id}.webm
        │   ├── lean_forward/
        │   │   └── {recording-id}.webm
        │   └── ...
        └── mobile-side/
            ├── sit_straight/
            │   └── {recording-id}.webm
            ├── lean_forward/
            │   └── {recording-id}.webm
            └── ...
```

## Presigned URL Security

### Expiration

Presigned URLs expire after 5 minutes:

```typescript
Expires: 300 // seconds
```

After expiration, the URL becomes invalid and cannot be used.

### Limited Permissions

Presigned URLs only allow:
- **PUT** for upload (cannot read or delete)
- Specific file path (cannot upload to different location)
- Specific content type (video/webm)

### No Authentication Required

Clients don't need AWS/Supabase credentials - the presigned URL contains temporary permissions.

## Supabase Storage Setup

### 1. Create Bucket

```sql
-- In Supabase SQL Editor
INSERT INTO storage.buckets (id, name, public)
VALUES ('posture-videos', 'posture-videos', false);
```

### 2. Configure Policies

```sql
-- Allow authenticated uploads
CREATE POLICY "Allow uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'posture-videos');

-- Allow authenticated reads
CREATE POLICY "Allow reads"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'posture-videos');
```

## AWS S3 Setup

### 1. Create Bucket

```bash
aws s3 mb s3://posture-videos
```

### 2. Configure CORS

```json
[
  {
    "AllowedOrigins": ["https://yourapp.com"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### 3. IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::posture-videos/*"
    }
  ]
}
```

## Testing Uploads

```typescript
// Test presigned URL generation
const uploadInfo = await api.getUploadUrl(
  'test-session-id',
  'test-recording-id',
  'desktop',
  'front',
  'sit_straight',
);

console.log('Upload URL:', uploadInfo.uploadUrl);
console.log('Storage path:', uploadInfo.storagePath);
console.log('Expires in:', uploadInfo.expiresIn);

// Test upload with dummy video
const testBlob = new Blob(['test video data'], { type: 'video/webm' });
await api.uploadVideo(uploadInfo.uploadUrl, testBlob);

console.log('✅ Upload test successful');
```

## Summary

The presigned URL upload flow:

1. **Backend generates** temporary upload URL with limited permissions
2. **Client uploads** video directly to storage (no backend involved)
3. **Backend confirms** upload by updating database metadata
4. **Storage handles** bandwidth and scaling

This architecture is:
- **Scalable**: Storage handles all video traffic
- **Fast**: No backend bottleneck
- **Secure**: Temporary URLs with expiration
- **Cost-effective**: Reduces backend infrastructure needs
