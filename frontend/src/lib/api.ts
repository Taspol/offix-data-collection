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
    try {
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
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Network error: Cannot reach server. Check your internet connection.');
      }
      throw err;
    }
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
    try {
      const response = await fetch(`${API_URL}/api/sessions/recordings/${recordingId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Failed to complete upload: ${response.status} ${errorText}`);
      }
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Network error: Cannot reach server. Check your internet connection.');
      }
      throw err;
    }
  },

  async uploadVideo(
    uploadUrl: string, 
    videoBlob: Blob, 
    storagePath?: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const blobSizeMB = (videoBlob.size / 1024 / 1024).toFixed(2);
    console.log('🚀 Starting upload:', { 
      blobSize: videoBlob.size,
      blobSizeMB: `${blobSizeMB} MB`,
      blobType: videoBlob.type,
      isLocalStorage: uploadUrl.includes('/api/storage/upload')
    });

    try {
      // Check if this is a local storage upload (contains /api/storage/upload)
      if (uploadUrl.includes('/api/storage/upload')) {
        // Local storage - use XMLHttpRequest for progress tracking
        console.log('📦 Using XMLHttpRequest for local storage with progress');
        
        // Determine file extension from MIME type
        let filename = 'recording.webm';
        if (videoBlob.type.includes('mp4')) {
          filename = 'recording.mp4';
        } else if (videoBlob.type.includes('webm')) {
          filename = 'recording.webm';
        }
        
        const formData = new FormData();
        formData.append('file', videoBlob, filename);
        
        const urlWithPath = storagePath 
          ? `${uploadUrl}?path=${encodeURIComponent(storagePath)}`
          : uploadUrl;

        console.log('📤 POSTing to:', urlWithPath);
        const uploadStart = Date.now();
        
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          // No timeout - allow upload to take as long as needed
          xhr.timeout = 0;
          
          // Track upload progress
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
              const percentComplete = (e.loaded / e.total) * 100;
              onProgress(percentComplete);
              console.log(`📊 Upload progress: ${percentComplete.toFixed(1)}%`);
            }
          });
          
          xhr.addEventListener('load', () => {
            const uploadTime = ((Date.now() - uploadStart) / 1000).toFixed(2);
            console.log(`📥 Response received in ${uploadTime}s - Status: ${xhr.status}`);
            
            if (xhr.status >= 200 && xhr.status < 300) {
              console.log('✅ Local upload successful');
              resolve();
            } else {
              console.error('❌ Upload failed:', xhr.responseText);
              reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
            }
          });
          
          xhr.addEventListener('error', (e) => {
            console.error('❌ Upload error event:', e);
            console.error('XHR state:', {
              readyState: xhr.readyState,
              status: xhr.status,
              statusText: xhr.statusText,
              responseText: xhr.responseText
            });
            reject(new Error('Network error during upload. Check connection and try again.'));
          });
          
          xhr.addEventListener('abort', () => {
            console.error('❌ Upload aborted');
            reject(new Error('Upload was aborted'));
          });
          
          xhr.open('POST', urlWithPath);
          xhr.send(formData);
        });
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
      console.error('❌ Upload error:', err);
      throw err;
    }
  },
};
