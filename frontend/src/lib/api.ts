const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface Session {
  id: string;
  sessionCode: string;
  qrCode?: string;
  joinUrl?: string;
  status: string;
  desktopConnected: boolean;
  mobileConnected: boolean;
}

export interface PostureStep {
  id: number;
  stepOrder: number;
  postureLabel: string;
  displayName: string;
  instructions: string;
  countdownSeconds: number;
  recordingDurationSeconds: number;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  storagePath: string;
  expiresIn: number;
}

export const api = {
  async createSession(): Promise<Session> {
    const response = await fetch(`${API_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.json();
  },

  async getSessionByCode(sessionCode: string): Promise<Session> {
    const response = await fetch(`${API_URL}/api/sessions/code/${sessionCode}`);
    return response.json();
  },

  async getSession(sessionId: string): Promise<Session> {
    const response = await fetch(`${API_URL}/api/sessions/${sessionId}`);
    return response.json();
  },

  async getAllPostures(): Promise<PostureStep[]> {
    const response = await fetch(`${API_URL}/api/postures`);
    return response.json();
  },

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
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Failed to get upload URL: ${response.status} ${errorText}`);
    }
    
    return response.json();
  },

  async completeUpload(
    recordingId: string,
    data: {
      stopTimestamp: number;
      durationMs: number;
      fileSizeBytes: number;
      metadata?: Record<string, any>;
    },
  ): Promise<void> {
    const response = await fetch(`${API_URL}/api/sessions/recordings/${recordingId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Failed to complete upload: ${response.status} ${errorText}`);
    }
  },

  async uploadVideo(uploadUrl: string, videoBlob: Blob, storagePath?: string): Promise<void> {
    console.log('🚀 Starting upload:', { 
      blobSize: videoBlob.size, 
      blobType: videoBlob.type,
      isLocalStorage: uploadUrl.includes('/api/storage/upload')
    });

    // Create abort controller for timeout - dynamic based on file size
    // Assume 100KB/s upload speed minimum, with 30s base timeout
    const minUploadSpeed = 100 * 1024; // 100 KB/s
    const baseTimeout = 30000; // 30 seconds base
    const estimatedTime = (videoBlob.size / minUploadSpeed) * 1000; // Convert to ms
    const timeoutMs = Math.max(baseTimeout, Math.min(estimatedTime * 2, 180000)); // Min 30s, max 3 minutes
    
    console.log(`⏱️ Upload timeout set to ${Math.round(timeoutMs / 1000)}s for ${Math.round(videoBlob.size / 1024 / 1024 * 100) / 100}MB file`);
    
    const controller = new AbortController();
    const timeoutStart = Date.now();
    const timeout = setTimeout(() => {
      const elapsed = Math.round((Date.now() - timeoutStart) / 1000);
      console.error(`⏰ Upload timeout after ${elapsed}s (limit: ${Math.round(timeoutMs / 1000)}s)`);
      controller.abort();
    }, timeoutMs);

    try {
      // Check if this is a local storage upload (contains /api/storage/upload)
      if (uploadUrl.includes('/api/storage/upload')) {
        // Local storage - use FormData with multipart/form-data
        console.log('📦 Using FormData for local storage');
        const formData = new FormData();
        formData.append('file', videoBlob, 'recording.webm');
        
        const urlWithPath = storagePath 
          ? `${uploadUrl}?path=${encodeURIComponent(storagePath)}`
          : uploadUrl;

        console.log('📤 POSTing to:', urlWithPath);
        const uploadStart = Date.now();
        const response = await fetch(urlWithPath, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        const uploadTime = ((Date.now() - uploadStart) / 1000).toFixed(2);
        console.log(`📥 Response received in ${uploadTime}s - Status: ${response.status}`);
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error('❌ Upload failed:', errorText);
          throw new Error(`Upload failed: ${response.status} ${errorText}`);
        }
        
        // Consume response body to ensure request completes
        try {
          await response.text();
        } catch (e) {
          // Ignore - body might already be consumed or empty
        }
        
        console.log('✅ Local upload successful');
      } else {
        // Cloud storage (S3/Supabase) - use PUT with direct blob
        console.log('☁️ Using PUT for cloud storage');
        const uploadStart = Date.now();
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          body: videoBlob,
          headers: {
            'Content-Type': videoBlob.type || 'video/webm',
          },
          signal: controller.signal,
        });

        const uploadTime = ((Date.now() - uploadStart) / 1000).toFixed(2);
        console.log(`📥 Response received in ${uploadTime}s - Status: ${response.status}`);
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error('❌ Upload failed:', errorText);
          throw new Error(`Upload failed: ${response.status} ${errorText}`);
        }
        console.log('✅ Cloud upload successful');
      }
    } catch (err) {
      clearTimeout(timeout); // Clear timeout immediately on error
      if (err instanceof Error && err.name === 'AbortError') {
        const elapsed = Math.round((Date.now() - timeoutStart) / 1000);
        throw new Error(`Upload timeout after ${elapsed}s - file too large or network too slow`);
      }
      console.error('❌ Upload error:', err);
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },
};
