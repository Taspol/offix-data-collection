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
      // Try exact constraints first
      const exactConstraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { exact: 1280 },
          height: { exact: 720 },
          frameRate: { exact: 30 },
          aspectRatio: { exact: 16/9 },
        },
        audio: false,
      };

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia(exactConstraints);
        setStream(mediaStream);
        setError(null);
        
        // Log actual capabilities achieved
        const videoTrack = mediaStream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        console.log('Camera settings:', {
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
          aspectRatio: settings.aspectRatio,
        });
        
        return mediaStream;
      } catch (exactError) {
        // Fallback to ideal constraints if exact fails
        console.warn('Exact constraints failed, trying ideal constraints:', exactError);
        
        const idealConstraints: MediaStreamConstraints = {
          video: {
            facingMode,
            width: { ideal: 1280, min: 1280 },
            height: { ideal: 720, min: 720 },
            frameRate: { ideal: 30, min: 24 },
            aspectRatio: { ideal: 16/9 },
          },
          audio: false,
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(idealConstraints);
        setStream(mediaStream);
        setError(null);
        
        // Log actual capabilities achieved
        const videoTrack = mediaStream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        console.log('Camera settings (fallback):', {
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
          aspectRatio: settings.aspectRatio,
        });
        
        return mediaStream;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to access camera';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Start recording
  const startRecording = useCallback(
    async (serverTimestamp: number): Promise<void> => {
      if (!stream) {
        throw new Error('No camera stream available');
      }

      // Calculate time delta and wait if needed to sync
      const timeDelta = Date.now() - serverTimestamp;
      const delay = Math.max(0, -timeDelta);
      
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      chunksRef.current = [];
      startTimestampRef.current = Date.now();

      // Try codecs in order of preference
      let options: MediaRecorderOptions | undefined;
      const codecs = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];

      for (const codec of codecs) {
        if (MediaRecorder.isTypeSupported(codec)) {
          options = {
            mimeType: codec,
            videoBitsPerSecond: 2500000, // 2.5 Mbps for consistent quality
          };
          console.log('Using codec:', codec);
          break;
        }
      }

      if (!options) {
        console.warn('No preferred codec supported, using default');
        options = { videoBitsPerSecond: 2500000 };
      }

      try {
        const mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onerror = (event) => {
          console.error('MediaRecorder error:', event);
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100); // Collect data every 100ms
        setIsRecording(true);
        console.log('Recording started successfully');
      } catch (err) {
        console.error('Failed to start MediaRecorder:', err);
        throw err;
      }
    },
    [stream],
  );

  // Stop recording
  const stopRecording = useCallback((): Promise<RecordingData> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;

      if (!mediaRecorder) {
        console.error('No mediaRecorder instance');
        reject(new Error('No active recording - mediaRecorder is null'));
        return;
      }

      if (mediaRecorder.state === 'inactive') {
        console.error('MediaRecorder is already inactive');
        reject(new Error('No active recording - mediaRecorder is inactive'));
        return;
      }

      console.log('Stopping MediaRecorder, current state:', mediaRecorder.state);
      console.log('Chunks collected:', chunksRef.current.length);

      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped event fired');
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'video/webm' });
        const stopTimestamp = Date.now();
        const durationMs = stopTimestamp - startTimestampRef.current;

        console.log('Recording data:', {
          blobSize: blob.size,
          blobType: blob.type,
          durationMs,
          chunks: chunksRef.current.length,
        });

        setIsRecording(false);
        
        resolve({
          blob,
          startTimestamp: startTimestampRef.current,
          stopTimestamp,
          durationMs,
        });
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error during stop:', event);
        reject(new Error('MediaRecorder error during stop'));
      };

      try {
        mediaRecorder.stop();
        console.log('mediaRecorder.stop() called');
      } catch (err) {
        console.error('Error calling mediaRecorder.stop():', err);
        reject(err);
      }
    });
  }, []);

  // Release camera
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
