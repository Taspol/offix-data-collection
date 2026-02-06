'use client';

import { useEffect, useRef, useState } from 'react';
import { useCamera, RecordingData } from '@/hooks/useCamera';
import { usePoseDetection } from '@/hooks/usePoseDetection';
import { useSessionStore } from '@/store/sessionStore';
import { getSocket } from '@/lib/socket';
import { api } from '@/lib/api';

// Helper function to map posture labels to guide video filenames
function getGuideVideoPath(postureLabel: string, distance: string = 'nom'): string {
  const videoMap: Record<string, Record<string, string>> = {
    'sit_straight': {
      'nom': 'sit_straight_nom-1.mov',
      'close': 'sit_straight_close-1.mov',
      'far': 'sit_straight_far-1.mov',
    },
    'left_leaning': {
      'nom': 'left-lean-nom-1.mov',
      'close': 'lean_left-1.mov',
      'far': 'lean_left_far-1.mov',
    },
    'right_leaning': {
      'nom': 'right_lean_nom-1.mov',
      'close': 'lean_right_close-1.mov',
      'far': 'lean_rigth_far-1.mov',
    },
    'forward_head': {
      'nom': 'forward_head_nom-1.mov',
      'close': 'forward_head_close-1.mov',
      'far': 'forward_head_far-1.mov',
    },
    'rounded_shoulders': {
      'nom': 'round_shoulder_nom-1.mov',
      'close': 'round_shoulder_close-1.mov',
      'far': 'round_shoulder_far-1.mov',
    },
    'slouched_posture': {
      'nom': 'slouched_nom-1.mov',
      'close': 'slouched_close-1.mov',
      'far': 'slouched_far-1.mov',
    },
    'freestyle_sitting': {
      'nom': 'free_style-1.mov',
      'close': 'free_style-1.mov',
      'far': 'free_style-1.mov',
    },
  };
  
  return videoMap[postureLabel]?.[distance] || videoMap[postureLabel]?.['nom'] || 'sit_straight_nom-1.mov';
}

export default function RecordingSession() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);
  const recordingIdRef = useRef<string | null>(null);
  const currentStepRef = useRef<any>(null); // Store current step in ref to persist across renders
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [message, setMessage] = useState('');
  const [showPostureGuide, setShowPostureGuide] = useState(false);
  const [showKeypoints, setShowKeypoints] = useState(true);
  const [showRemoteKeypoints, setShowRemoteKeypoints] = useState(true);
  const [remoteStreamActive, setRemoteStreamActive] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [hasSeenGuide, setHasSeenGuide] = useState(false);
  const [currentDistance, setCurrentDistance] = useState<string>('nom');
  const [pendingRecording, setPendingRecording] = useState<RecordingData | null>(null);
  const pendingRecordingRef = useRef<RecordingData | null>(null);
  const previousStepIdRef = useRef<number | null>(null);
  const previousDistanceRef = useRef<string>('nom');

  // Add debug message to UI
  const addDebug = (msg: string) => {
    console.log(msg);
    setDebugInfo(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const {
    stream,
    isRecording,
    error: cameraError,
    requestCamera,
    startRecording,
    stopRecording,
    releaseCamera,
  } = useCamera();

  const {
    sessionId,
    deviceType,
    viewType,
    deviceId,
    currentStep,
    currentDistance: storeDistance,
    isRecording: storeIsRecording,
    isUploading,
    setRecording,
    setUploading,
    setCurrentRecordingId,
    setCurrentStep,
  } = useSessionStore();

  // Show guide modal ONLY when step changes or distance changes
  useEffect(() => {
    const stepChanged = currentStep?.id && currentStep.id !== previousStepIdRef.current;
    const distanceChanged = storeDistance !== previousDistanceRef.current;
    
    if (stepChanged || distanceChanged) {
      console.log('Step or distance changed:', { 
        stepId: currentStep?.id, 
        previousStepId: previousStepIdRef.current,
        distance: storeDistance,
        previousDistance: previousDistanceRef.current 
      });
      
      if (stepChanged) {
        previousStepIdRef.current = currentStep.id;
      }
      if (distanceChanged) {
        previousDistanceRef.current = storeDistance;
        setCurrentDistance(storeDistance);
      }
      
      setShowGuideModal(true);
      setHasSeenGuide(false);
    }
  }, [currentStep?.id, storeDistance]);

  // Initialize pose detection
  const { isReady: isPoseReady, poseValidation, keyLandmarks, postureAngles } = usePoseDetection(
    videoRef.current,
    (viewType || 'front') as 'front' | 'side'
  );

  // Initialize pose detection for remote video (desktop only)
  const { 
    isReady: isRemotePoseReady, 
    poseValidation: remotePoseValidation, 
    keyLandmarks: remoteKeyLandmarks, 
    postureAngles: remotePostureAngles 
  } = usePoseDetection(
    deviceType === 'desktop' ? remoteVideoRef.current : null,
    'side' // Remote is always side view
  );

  // Draw keypoints on canvas
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current || !showKeypoints) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!keyLandmarks || Object.keys(keyLandmarks).length === 0) return;

    // Drawing function
    const drawLandmark = (landmark: any, color: string, label: string) => {
      if (!landmark || landmark.visibility < 0.5) return;
      
      const x = landmark.x * canvas.width;
      const y = landmark.y * canvas.height;
      
      // Draw circle for landmark
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw label
      ctx.font = '12px bold sans-serif';
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 3;
      ctx.strokeText(label, x + 10, y - 10);
      ctx.fillText(label, x + 10, y - 10);
    };

    const drawLine = (point1: any, point2: any, color: string) => {
      if (!point1 || !point2 || point1.visibility < 0.5 || point2.visibility < 0.5) return;
      
      const x1 = point1.x * canvas.width;
      const y1 = point1.y * canvas.height;
      const x2 = point2.x * canvas.width;
      const y2 = point2.y * canvas.height;
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
    };

    // Draw facial features
    drawLandmark(keyLandmarks.nose, '#FF6B6B', 'Nose');
    drawLandmark(keyLandmarks.leftEye, '#4ECDC4', 'L Eye');
    drawLandmark(keyLandmarks.rightEye, '#4ECDC4', 'R Eye');
    drawLandmark(keyLandmarks.leftEar, '#95E1D3', 'L Ear');
    drawLandmark(keyLandmarks.rightEar, '#95E1D3', 'R Ear');
    
    // Draw mouth (both corners)
    if (keyLandmarks.mouth?.left && keyLandmarks.mouth?.right) {
      drawLandmark(keyLandmarks.mouth.left, '#F38181', 'L Mouth');
      drawLandmark(keyLandmarks.mouth.right, '#F38181', 'R Mouth');
      drawLine(keyLandmarks.mouth.left, keyLandmarks.mouth.right, '#F38181');
    }
    
    // Draw shoulders
    drawLandmark(keyLandmarks.leftShoulder, '#FFE66D', 'L Shoulder');
    drawLandmark(keyLandmarks.rightShoulder, '#FFE66D', 'R Shoulder');
    
    // Draw connections
    drawLine(keyLandmarks.leftEye, keyLandmarks.leftEar, '#4ECDC4');
    drawLine(keyLandmarks.rightEye, keyLandmarks.rightEar, '#4ECDC4');
    drawLine(keyLandmarks.leftEar, keyLandmarks.leftShoulder, '#95E1D3');
    drawLine(keyLandmarks.rightEar, keyLandmarks.rightShoulder, '#95E1D3');
    drawLine(keyLandmarks.leftShoulder, keyLandmarks.rightShoulder, '#FFE66D');
    
    // Draw face connections
    drawLine(keyLandmarks.nose, keyLandmarks.leftEye, '#FF6B6B');
    drawLine(keyLandmarks.nose, keyLandmarks.rightEye, '#FF6B6B');
  }, [keyLandmarks, showKeypoints]);

  // Draw keypoints on remote canvas (desktop only)
  useEffect(() => {
    if (!remoteCanvasRef.current || !remoteVideoRef.current || !showRemoteKeypoints || deviceType !== 'desktop') return;
    
    const canvas = remoteCanvasRef.current;
    const video = remoteVideoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!remoteKeyLandmarks || Object.keys(remoteKeyLandmarks).length === 0) return;

    // Drawing function for remote video (with text un-flip)
    const drawLandmark = (landmark: any, color: string, label: string) => {
      if (!landmark || landmark.visibility < 0.5) return;
      
      const x = landmark.x * canvas.width;
      const y = landmark.y * canvas.height;
      
      // Draw circle for landmark
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw label with reverse transform to un-flip text
      ctx.save();
      ctx.scale(-1, 1); // Flip horizontally to counter the canvas transform
      ctx.font = '12px bold sans-serif';
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 3;
      ctx.strokeText(label, -(x + 10), y - 10); // Negate x coordinate
      ctx.fillText(label, -(x + 10), y - 10);
      ctx.restore();
    };

    const drawLine = (point1: any, point2: any, color: string) => {
      if (!point1 || !point2 || point1.visibility < 0.5 || point2.visibility < 0.5) return;
      
      const x1 = point1.x * canvas.width;
      const y1 = point1.y * canvas.height;
      const x2 = point2.x * canvas.width;
      const y2 = point2.y * canvas.height;
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
    };

    // Draw facial features
    drawLandmark(remoteKeyLandmarks.nose, '#FF6B6B', 'Nose');
    drawLandmark(remoteKeyLandmarks.leftEye, '#4ECDC4', 'L Eye');
    drawLandmark(remoteKeyLandmarks.rightEye, '#4ECDC4', 'R Eye');
    drawLandmark(remoteKeyLandmarks.leftEar, '#95E1D3', 'L Ear');
    drawLandmark(remoteKeyLandmarks.rightEar, '#95E1D3', 'R Ear');
    
    // Draw mouth (both corners)
    if (remoteKeyLandmarks.mouth?.left && remoteKeyLandmarks.mouth?.right) {
      drawLandmark(remoteKeyLandmarks.mouth.left, '#F38181', 'L Mouth');
      drawLandmark(remoteKeyLandmarks.mouth.right, '#F38181', 'R Mouth');
      drawLine(remoteKeyLandmarks.mouth.left, remoteKeyLandmarks.mouth.right, '#F38181');
    }
    
    // Draw shoulders
    drawLandmark(remoteKeyLandmarks.leftShoulder, '#FFE66D', 'L Shoulder');
    drawLandmark(remoteKeyLandmarks.rightShoulder, '#FFE66D', 'R Shoulder');
    
    // Draw connections
    drawLine(remoteKeyLandmarks.leftEye, remoteKeyLandmarks.leftEar, '#4ECDC4');
    drawLine(remoteKeyLandmarks.rightEye, remoteKeyLandmarks.rightEar, '#4ECDC4');
    drawLine(remoteKeyLandmarks.leftEar, remoteKeyLandmarks.leftShoulder, '#95E1D3');
    drawLine(remoteKeyLandmarks.rightEar, remoteKeyLandmarks.rightShoulder, '#95E1D3');
    drawLine(remoteKeyLandmarks.leftShoulder, remoteKeyLandmarks.rightShoulder, '#FFE66D');
    
    // Draw face connections
    drawLine(remoteKeyLandmarks.nose, remoteKeyLandmarks.leftEye, '#FF6B6B');
    drawLine(remoteKeyLandmarks.nose, remoteKeyLandmarks.rightEye, '#FF6B6B');
  }, [remoteKeyLandmarks, showRemoteKeypoints, deviceType]);

  // Setup video preview
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Stream video frames to desktop (mobile only)
  useEffect(() => {
    if (deviceType === 'mobile' && videoRef.current && sessionId && !isRecording) {
      const socket = getSocket();
      const video = videoRef.current;
      const canvas = frameCanvasRef.current;
      
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const streamFrames = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = 320; // Lower resolution for streaming
          canvas.height = 180;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Convert to base64 and emit
          const frameData = canvas.toDataURL('image/jpeg', 0.6);
          socket.emit('video_frame', {
            sessionId,
            deviceType: 'mobile',
            frame: frameData
          });
        }
      };

      // Stream at ~10 FPS
      streamIntervalRef.current = setInterval(streamFrames, 100);

      return () => {
        if (streamIntervalRef.current) {
          clearInterval(streamIntervalRef.current);
        }
      };
    }
  }, [deviceType, sessionId, stream, isRecording]);

  // Receive video frames on desktop
  useEffect(() => {
    if (deviceType === 'desktop') {
      const socket = getSocket();
      
      socket.on('video_frame', (data: { deviceType: string; frame: string }) => {
        if (data.deviceType === 'mobile' && remoteVideoRef.current) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx && remoteVideoRef.current) {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
              
              // Draw to video element via canvas stream
              const stream = (canvas as any).captureStream?.(10);
              if (stream) {
                remoteVideoRef.current.srcObject = stream;
                setRemoteStreamActive(true);
              } else {
                // Fallback: use img element
                remoteVideoRef.current.poster = data.frame;
              }
            }
          };
          img.src = data.frame;
          setRemoteStreamActive(true);
        }
      });

      return () => {
        socket.off('video_frame');
      };
    }
  }, [deviceType]);

  // Request camera on mount
  useEffect(() => {
    const facingMode = 'user'; // Always use front camera
    requestCamera(facingMode);

    return () => {
      releaseCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceType]);

  // Listen to WebSocket events
  useEffect(() => {
    const socket = getSocket();

    // Start recording event
    socket.on('start_recording', async (data: {
      postureLabel: string;
      duration: number;
      timestamp: number;
      recordings: Array<{
        recordingId: string;
        deviceId: string;
        deviceType: string;
        viewType: string;
      }>;
    }) => {
      addDebug('📹 START_RECORDING received');
      addDebug(`Device: ${deviceType}/${viewType}`);
      
      try {
        // Find the recording ID for this device
        const myRecording = data.recordings.find(
          r => r.deviceType === deviceType && r.viewType === viewType
        );
        
        if (!myRecording) {
          addDebug('❌ No matching recording!');
          throw new Error('Recording ID not found for this device');
        }
        
        addDebug(`✅ Found recording: ${myRecording.recordingId.slice(0, 8)}`);
        
        // Store the recording ID and current step data for later upload
        recordingIdRef.current = myRecording.recordingId;
        setCurrentRecordingId(myRecording.recordingId);
        
        // Store step data from the event (not from state which might be stale)
        // Use data from currentStep state if available, otherwise use event data with defaults
        const countdownSeconds = currentStep?.countdownSeconds ?? 3; // Default 3 second countdown
        currentStepRef.current = {
          postureLabel: data.postureLabel,
          recordingDurationSeconds: data.duration,
          countdownSeconds: countdownSeconds,
          displayName: currentStep?.displayName || data.postureLabel,
          instructions: currentStep?.instructions || '',
        };
        addDebug(`Step: ${data.postureLabel}`);
        addDebug(`Countdown: ${countdownSeconds}s`);
        
        // Always do countdown (use value from step or default)
        if (countdownSeconds > 0) {
          addDebug(`⏱️ Starting countdown...`);
          for (let i = countdownSeconds; i > 0; i--) {
            setCountdown(i);
            await new Promise((r) => setTimeout(r, 1000));
          }
          setCountdown(null);
          addDebug('✅ Countdown done');
        }

        // Start recording with sync
        addDebug('🎬 Starting recording...');
        await startRecording(data.timestamp);
        addDebug('✅ Recording started');
        setRecording(true);
        setMessage(`Recording: ${data.postureLabel}`);

        // Track duration
        const startTime = Date.now();
        const interval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          setRecordingDuration(elapsed);
        }, 100);

        // Store interval ID to clear later
        (window as any).durationInterval = interval;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        addDebug(`❌ Start error: ${errMsg}`);
        setMessage('Failed to start recording');
      }
    });

    // Stop recording event
    socket.on('stop_recording', async (data: { timestamp: number }) => {
      addDebug('⏹️ STOP_RECORDING received');
      addDebug(`RecID: ${recordingIdRef.current?.slice(0, 8) || 'none'}`);
      
      try {
        // Clear duration tracker
        if ((window as any).durationInterval) {
          clearInterval((window as any).durationInterval);
        }

        // Stop recording
        addDebug('🛑 Stopping recorder...');
        const recordingData: RecordingData = await stopRecording();
        addDebug(`✅ Stopped: ${recordingData.blob.size} bytes`);
        setRecording(false);
        setMessage('Recording complete! Choose action.');

        // Store recording for user confirmation - BOTH devices get the dialog
        setPendingRecording(recordingData);
        pendingRecordingRef.current = recordingData;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        addDebug(`❌ Stop error: ${errMsg}`);
        setMessage('Failed to stop recording');
      }
    });

    // Next step ready
    socket.on('next_step_ready', (data: { step: any }) => {
      console.log('➡️ Next step ready:', data.step);
      setCurrentStep(data.step);
      setMessage(data.step ? `Next: ${data.step.displayName}` : 'All steps completed!');
    });

    // Listen for confirmation to upload from any device
    socket.on('confirm_upload', async () => {
      addDebug('✅ Upload confirmed');
      const recording = pendingRecordingRef.current;
      if (recording) {
        setMessage('Uploading...');
        try {
          // Use the recording ID that was provided in start_recording event
          const recordingId = recordingIdRef.current;
          if (!recordingId) {
            throw new Error('No recording ID found');
          }

          addDebug(`📤 Starting upload for ${recordingId.slice(0, 8)}...`);
          setUploading(true);

          // Stage 1: Get upload URL
          const uploadUrlData = await api.getUploadUrl(
            sessionId!,
            recordingId,
            deviceType || 'desktop',
            viewType || 'front',
            currentStepRef.current?.postureLabel || 'unknown',
          );
          addDebug(`✅ Got upload URL: ${uploadUrlData.storagePath}`);

          // Stage 2: Upload the video
          await api.uploadVideo(
            uploadUrlData.uploadUrl,
            recording.blob,
            uploadUrlData.storagePath,
          );
          addDebug(`✅ Video uploaded`);

          // Stage 3: Complete the upload
          await api.completeUpload(recordingId, {
            stopTimestamp: recording.stopTimestamp,
            durationMs: recording.durationMs,
            fileSizeBytes: recording.blob.size,
          });
          addDebug(`✅ Upload complete`);

          // Notify backend that upload is complete
          const socket = getSocket();
          socket.emit('upload_completed', {
            recordingId,
            fileSizeBytes: recording.blob.size,
          });

          setPendingRecording(null);
          pendingRecordingRef.current = null;
          setMessage('Upload successful!');
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Upload failed';
          addDebug(`❌ Upload error: ${errMsg}`);
          setMessage(`Upload failed: ${errMsg}`);
          console.error('Upload failed:', err);
        } finally {
          setUploading(false);
        }
      }
    });

    // Listen for confirmation to re-record from any device
    socket.on('confirm_rerecord', () => {
      addDebug('🔄 Re-record requested');
      setPendingRecording(null);
      pendingRecordingRef.current = null;
      setMessage('Ready to re-record');
      recordingIdRef.current = null;
      setCurrentRecordingId(null);
    });

    return () => {
      socket.off('start_recording');
      socket.off('stop_recording');
      socket.off('next_step_ready');
      socket.off('confirm_upload');
      socket.off('confirm_rerecord');
    };
  }, [currentStep, startRecording, stopRecording, setRecording, setCurrentStep]);

  // Upload video to storage
  const uploadVideo = async (recordingData: RecordingData) => {
    const recordingId = recordingIdRef.current;
    const step = currentStepRef.current; // Use ref instead of state
    
    addDebug(`Upload: ${recordingData.blob.size}b`);
    console.log('Attempting upload with:', {
      recordingId,
      sessionId,
      deviceType,
      viewType,
      hasCurrentStep: !!step,
      blobSize: recordingData?.blob?.size,
      currentStepLabel: step?.postureLabel,
    });
    
    if (!sessionId || !deviceType || !viewType || !step || !recordingId) {
      const missing = [];
      if (!sessionId) missing.push('sessionId');
      if (!deviceType) missing.push('deviceType');
      if (!viewType) missing.push('viewType');
      if (!step) missing.push('currentStep');
      if (!recordingId) missing.push('recordingId');
      
      addDebug(`❌ Missing: ${missing.join(',')}`);
      console.error('❌ Missing required fields:', missing);
      throw new Error(`Missing session information or recording ID: ${missing.join(', ')}`);
    }

    setUploading(true);

    try {
      const socket = getSocket();
      addDebug('upload_started');
      console.log('Emitting upload_started for recordingId:', recordingId);
      socket.emit('upload_started', { recordingId });

      addDebug('Getting URL...');
      console.log('Requesting upload URL...');
      const uploadInfo = await api.getUploadUrl(
        sessionId,
        recordingId,
        deviceType,
        viewType,
        step.postureLabel,
      );
      addDebug('Got URL');
      console.log('Got upload URL:', uploadInfo.uploadUrl);

      // Upload video
      addDebug('📹 Uploading...');
      console.log('📹 Uploading video blob...');
      try {
        await api.uploadVideo(uploadInfo.uploadUrl, recordingData.blob, uploadInfo.storagePath);
        addDebug('Uploaded');
        console.log('Video uploaded successfully');
      } catch (uploadErr) {
        const uploadErrMsg = uploadErr instanceof Error ? uploadErr.message : 'Upload failed';
        addDebug(`❌Upload failed: ${uploadErrMsg}`);
        console.error('❌ Video upload error:', uploadErr);
        throw new Error(`Video upload failed: ${uploadErrMsg}`);
      }

      // Complete upload
      addDebug('✔️ Completing...');
      console.log('✔️ Completing upload...');
      try {
        await api.completeUpload(recordingId, {
          stopTimestamp: recordingData.stopTimestamp,
          durationMs: recordingData.durationMs,
          fileSizeBytes: recordingData.blob.size,
        });
        addDebug('Done!');
        console.log('✅ Upload completed');
      } catch (completeErr) {
        const completeErrMsg = completeErr instanceof Error ? completeErr.message : 'Complete failed';
        addDebug(`❌ Complete failed: ${completeErrMsg}`);
        console.error('❌ Complete upload error:', completeErr);
        throw new Error(`Complete upload failed: ${completeErrMsg}`);
      }

      socket.emit('upload_completed', {
        recordingId,
        fileSizeBytes: recordingData.blob.size,
      });

      setMessage('Upload completed!');
      setRecordingDuration(0);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addDebug(`❌ Upload err: ${errMsg}`);
      console.error('❌ Upload failed:', err);
      console.error('Error details:', {
        message: errMsg,
        stack: err instanceof Error ? err.stack : undefined,
        recordingId,
        sessionId,
        deviceType,
        viewType,
      });
      setMessage(`Upload failed: ${errMsg}`);
      
      // Force re-throw to ensure error is visible
      throw err;
    } finally {
      console.log('🏁 Upload flow finished - cleaning up');
      setUploading(false);
      setCurrentRecordingId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* Hidden canvas for frame capture (mobile) */}
      <canvas ref={frameCanvasRef} style={{ display: 'none' }} />
      
      <div className="card max-w-6xl w-full">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 bg-gradient-to-br ${
              deviceType === 'desktop' 
                ? 'from-blue-500 to-blue-600' 
                : 'from-green-500 to-green-600'
            } rounded-xl flex items-center justify-center flex-shrink-0`}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {deviceType === 'desktop' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                )}
              </svg>
            </div>
            <h2 className="text-2xl font-bold">
              {deviceType === 'desktop' ? 'Front View Camera' : 'Side View Camera'}
            </h2>
          </div>
          <p className="text-gray-600">
            View: {viewType} | Device ID: {deviceId?.slice(0, 8)}
          </p>
        </div>

        {/* Video Previews Grid */}
        <div className={`grid ${deviceType === 'desktop' ? 'md:grid-cols-2' : 'grid-cols-1'} gap-6 mb-6`}>
          {/* Front View / Current Device Video Preview */}
          <div>
            <h3 className="text-lg font-semibold mb-3">
              {deviceType === 'desktop' ? 'Front View (This Device)' : 'Side View Camera'}
            </h3>
            <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              
              {/* Canvas overlay for keypoints */}
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
                style={{ display: showKeypoints ? 'block' : 'none', transform: 'scaleX(-1)' }}
              />
              
              {/* Keypoints toggle button */}
              <button
                onClick={() => setShowKeypoints(!showKeypoints)}
                className="absolute top-4 left-4 bg-gray-900/80 hover:bg-gray-800/80 text-white px-3 py-2 rounded-lg text-sm backdrop-blur-sm transition-colors flex items-center gap-2 z-30"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showKeypoints ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  )}
                </svg>
                {showKeypoints ? 'Hide' : 'Show'} Keypoints
              </button>
              
              {/* Posture Validation Overlay */}
          {showPostureGuide && isPoseReady && !isRecording && (
            <div className="absolute top-4 right-4 max-w-xs z-30">
              <div className={`p-4 rounded-lg backdrop-blur-sm ${
                poseValidation.isValid 
                  ? 'bg-green-900/80 border-2 border-green-400' 
                  : 'bg-red-900/80 border-2 border-red-400'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {poseValidation.isValid ? (
                    <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="text-white font-bold">
                    {poseValidation.isValid ? 'Good Posture!' : 'Adjust Posture'}
                  </span>
                  <button
                    onClick={() => setShowPostureGuide(false)}
                    className="ml-auto text-white/70 hover:text-white"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                
                {!poseValidation.isValid && poseValidation.issues.length > 0 && (
                  <ul className="text-sm text-white space-y-1">
                    {poseValidation.issues.map((issue, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-red-400 mt-0.5">•</span>
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                )}
                
                {viewType === 'side' && postureAngles.neckAngle && postureAngles.spineAngle && (
                  <div className="mt-3 pt-3 border-t border-white/20 text-xs text-white/80">
                    <div>Neck: {postureAngles.neckAngle.toFixed(0)}°</div>
                    <div>Spine: {postureAngles.spineAngle.toFixed(0)}°</div>
                  </div>
                )}
                
                <div className="mt-2 text-xs text-white/70">
                  Confidence: {(poseValidation.confidence * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          )}

          {!showPostureGuide && !isRecording && (
            <button
              onClick={() => setShowPostureGuide(true)}
              className="absolute top-4 right-4 bg-gray-900/80 hover:bg-gray-800/80 text-white px-3 py-2 rounded-lg text-sm backdrop-blur-sm transition-colors z-30"
            >
              Show Posture Guide
            </button>
          )}
          
          {/* Countdown Overlay */}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
              <div className="text-white text-9xl font-bold animate-pulse">
                {countdown}
              </div>
            </div>
          )}

          {/* Recording Indicator */}
          {isRecording && (
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full z-40">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
              <span className="font-medium">REC {recordingDuration}s</span>
            </div>
          )}

          {/* Upload Indicator */}
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70">
              <div className="text-white text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
                <p className="text-xl">Uploading...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Side View Preview (Desktop Only) */}
      {deviceType === 'desktop' && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Side View (Mobile Device)</h3>
          <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            
            {/* Canvas overlay for remote keypoints */}
            <canvas
              ref={remoteCanvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{ display: showRemoteKeypoints ? 'block' : 'none', transform: 'scaleX(-1)' }}
            />
            
            {/* Remote Keypoints toggle button */}
            {remoteStreamActive && (
              <button
                onClick={() => setShowRemoteKeypoints(!showRemoteKeypoints)}
                className="absolute top-4 left-4 bg-gray-900/80 hover:bg-gray-800/80 text-white px-3 py-2 rounded-lg text-sm backdrop-blur-sm transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showRemoteKeypoints ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  )}
                </svg>
                {showRemoteKeypoints ? 'Hide' : 'Show'} Keypoints
              </button>
            )}
            
            {/* Posture Validation Overlay for Remote */}
            {remoteStreamActive && isRemotePoseReady && !isRecording && (
              <div className="absolute top-4 right-4 max-w-xs">
                <div className={`p-3 rounded-lg backdrop-blur-sm text-xs ${
                  remotePoseValidation.isValid 
                    ? 'bg-green-900/80 border-2 border-green-400' 
                    : 'bg-red-900/80 border-2 border-red-400'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {remotePoseValidation.isValid ? (
                      <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span className="text-white font-bold text-xs">
                      {remotePoseValidation.isValid ? 'Good!' : 'Adjust'}
                    </span>
                  </div>
                  
                  {remotePostureAngles.neckAngle && remotePostureAngles.spineAngle && (
                    <div className="text-white/80 space-y-0.5">
                      <div>Neck: {remotePostureAngles.neckAngle.toFixed(0)}°</div>
                      <div>Spine: {remotePostureAngles.spineAngle.toFixed(0)}°</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* No stream overlay */}
            {!remoteStreamActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <div className="text-center text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">Waiting for side view camera...</p>
                  <p className="text-xs mt-1">Make sure mobile device is connected</p>
                </div>
              </div>
            )}
            
            {/* Recording Indicator */}
            {isRecording && (
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                <span className="font-medium">REC</span>
              </div>
            )}
            
            {/* Stream Status */}
            {remoteStreamActive && (
              <div className="absolute top-4 right-4 flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-full text-xs">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span>Live</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>

        {/* Guide Video Modal */}
        {showGuideModal && currentStep && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4">{currentStep.displayName} - Posture Guide</h2>
                <div className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold mb-4">
                  Distance: {currentDistance.toUpperCase()}
                </div>
                <p className="text-gray-700 mb-4">{currentStep.instructions}</p>
                
                <div className="relative bg-black rounded-lg overflow-hidden mb-6" style={{ aspectRatio: '16/9' }}>
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-contain"
                    key={`${currentStep.postureLabel}-${currentDistance}`}
                    src={`/step_guide/${getGuideVideoPath(currentStep.postureLabel, currentDistance)}`}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-900">
                    <strong>Important:</strong> Please watch the guide video carefully and position yourself according to the demonstration before starting the recording.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowGuideModal(false);
                    setHasSeenGuide(true);
                  }}
                  className="btn-primary w-full text-lg py-3"
                >
                  ✓ I Understand - Start Recording
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Confirmation - Both Devices */}
        {pendingRecording && !isUploading && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full p-6">
              <h2 className="text-2xl font-bold mb-4">📹 Recording Complete!</h2>
              <p className="text-gray-700 mb-2">
                Video recorded successfully ({Math.round(pendingRecording.blob.size / 1024 / 1024 * 100) / 100} MB)
              </p>
              <p className="text-gray-600 text-sm mb-6">
                Duration: {Math.round(pendingRecording.durationMs / 1000)}s
              </p>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-900">
                  <strong>Review your recording:</strong> Was the posture correct? If not, you can re-record.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={async () => {
                    console.log('🔄 Re-recording...');
                    
                    const oldRecordingId = recordingIdRef.current;
                    
                    setPendingRecording(null);
                    pendingRecordingRef.current = null;
                    setMessage('Ready to re-record');
                    // Clear the recording ID
                    recordingIdRef.current = null;
                    setCurrentRecordingId(null);
                    
                    // Broadcast to all devices
                    const socket = getSocket();
                    if (socket && sessionId) {
                      socket.emit('confirm_rerecord', { 
                        sessionId,
                        recordingId: oldRecordingId 
                      });
                    }
                  }}
                  className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  🔄 Re-record
                </button>
                
                <button
                  onClick={async () => {
                    console.log('✓ Uploading...');
                    setMessage('Uploading...');
                    
                    // Broadcast to all devices to start uploading
                    const socket = getSocket();
                    if (socket && sessionId) {
                      socket.emit('confirm_upload', { sessionId });
                    }
                  }}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  ✓ Upload Recording
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Current Step Info */}
        {currentStep && (
          <div className="card bg-primary-50 mb-6">
            <h3 className="text-xl font-bold mb-2">{currentStep.displayName}</h3>
            <p className="text-gray-700">{currentStep.instructions}</p>
            <div className="mt-3 text-sm text-gray-600">
              Duration: {currentStep.recordingDurationSeconds}s
            </div>
          </div>
        )}

        {/* Status Message */}
        {message && (
          <div className="text-center text-lg font-medium text-gray-700 mb-4">
            {message}
          </div>
        )}

        {/* Debug Info Panel (Mobile Only) */}
        {deviceType === 'mobile' && debugInfo.length > 0 && (
          <div className="card bg-gray-100 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold">Debug Log</h3>
              <button
                onClick={() => setDebugInfo([])}
                className="text-xs text-gray-600 hover:text-gray-800"
              >
                Clear
              </button>
            </div>
            <div className="bg-black text-green-400 p-3 rounded text-xs font-mono max-h-48 overflow-y-auto">
              {debugInfo.map((log, i) => (
                <div key={i} className="mb-1">{log}</div>
              ))}
            </div>
          </div>
        )}

        {/* Error Message */}
        {cameraError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <strong>Camera Error:</strong> {cameraError}
          </div>
        )}
      </div>
    </div>
  );
}
