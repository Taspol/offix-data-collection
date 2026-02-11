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
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [showCameraSelector, setShowCameraSelector] = useState(false);
  const wakeLockRef = useRef<any>(null); // Wake Lock to prevent sleep during uploads
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTasks, setUploadTasks] = useState<Array<{
    id: string;
    postureLabel: string;
    deviceType: string;
    viewType: string;
    progress: number;
    status: 'uploading' | 'completed' | 'failed' | 'queued';
    error?: string;
  }>>([]);
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  // Upload queue system
  const uploadQueueRef = useRef<Array<{
    recording: RecordingData;
    recordingId: string;
    taskId: string;
    postureLabel: string;
  }>>([]);
  const isProcessingUploadRef = useRef(false);

  // Add debug message to UI
  const addDebug = (msg: string) => {
    console.log(msg);
    setDebugInfo(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const {
    stream,
    isRecording,
    error: cameraError,
    availableCameras,
    requestCamera,
    startRecording,
    stopRecording,
    releaseCamera,
    getAvailableCameras,
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
      
      // Show guide modal when step changes (always show for the new step)
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

  // Load available cameras and request default camera on mount
  useEffect(() => {
    const initCamera = async () => {
      const facingMode = 'user'; // Always use front camera
      // Request camera first to get permissions
      await requestCamera(facingMode, selectedCameraId || undefined);
      // Then enumerate cameras (labels will be available after permission granted)
      const cameras = await getAvailableCameras();
      console.log('🎥 Cameras detected:', cameras.length, cameras);
      addDebug(`Cameras: ${cameras.length}`);
    };
    
    initCamera();

    return () => {
      releaseCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceType]);
  
  // Handle camera change
  const handleCameraChange = async (cameraId: string) => {
    setSelectedCameraId(cameraId);
    releaseCamera();
    await requestCamera('user', cameraId);
  };

  // Download video to device
  const downloadVideo = (recording: RecordingData) => {
    const blob = recording.blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Determine file extension from blob type
    let extension = 'webm';
    if (blob.type.includes('mp4')) {
      extension = 'mp4';
    }
    
    // Create filename with timestamp and posture info
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const posture = currentStepRef.current?.postureLabel || 'recording';
    const filename = `${posture}_${deviceType}_${viewType}_${timestamp}.${extension}`;
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('📥 Video downloaded:', filename);
  };

  // Request wake lock to prevent device from sleeping
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator && deviceType === 'mobile') {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('🔒 Wake lock acquired - device will stay awake');
        
        wakeLockRef.current.addEventListener('release', () => {
          console.log('🔓 Wake lock released');
        });
      } catch (err) {
        console.warn('⚠️ Wake lock request failed:', err);
      }
    }
  };

  // Release wake lock
  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('🔓 Wake lock released manually');
      } catch (err) {
        console.warn('⚠️ Wake lock release failed:', err);
      }
    }
  };

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

    // Note: next_step_ready is now handled entirely by desktop/page.tsx
    // to avoid listener conflicts and ensure proper step index updates

    // Listen for guide modal close event from other devices
    socket.on('close_guide_modal', () => {
      console.log('📋 Guide modal close requested');
      setShowGuideModal(false);
      setHasSeenGuide(true);
    });

    // Background upload function
    const uploadInBackground = async (
      recording: RecordingData,
      recordingId: string,
      taskId: string,
      postureLabel: string
    ) => {
      // Acquire wake lock to prevent device from sleeping during upload
      await requestWakeLock();
      
      try {
        addDebug(`📤 Starting background upload for ${recordingId.slice(0, 8)}...`);
        console.log('📤 Upload details:', {
          recordingId,
          blobSize: recording.blob.size,
          blobType: recording.blob.type,
          sessionId,
          deviceType,
          viewType,
          postureLabel
        });

        // Validate recording blob
        if (!recording.blob || recording.blob.size === 0) {
          throw new Error('Invalid recording: blob is empty');
        }

        // Update task progress: 5%
        setUploadTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, progress: 5 } : task
        ));

        // Stage 1: Get upload URL
        const uploadUrlData = await api.getUploadUrl(
          sessionId!,
          recordingId,
          deviceType || 'desktop',
          viewType || 'front',
          postureLabel,
        );
        addDebug(`✅ Got upload URL: ${uploadUrlData.storagePath}`);
        
        // Update task progress: 10%
        setUploadTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, progress: 10 } : task
        ));

        // Stage 2: Upload the video with retry logic
        let uploadAttempts = 0;
        const maxRetries = 3;
        let uploadSuccess = false;
        
        while (!uploadSuccess && uploadAttempts < maxRetries) {
          try {
            uploadAttempts++;
            if (uploadAttempts > 1) {
              addDebug(`🔄 Retry attempt ${uploadAttempts}/${maxRetries}...`);
              // Wait before retry: 2s, 5s, 10s
              const delayMs = uploadAttempts * uploadAttempts * 1000;
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            
            await api.uploadVideo(
              uploadUrlData.uploadUrl,
              recording.blob,
              uploadUrlData.storagePath,
              (progress) => {
                // Map upload progress from 10% to 90%
                const mappedProgress = 10 + (progress * 0.80);
                setUploadTasks(prev => prev.map(task => 
                  task.id === taskId ? { ...task, progress: Math.round(mappedProgress) } : task
                ));
              },
            );
            uploadSuccess = true;
            addDebug(`✅ Video uploaded`);
          } catch (uploadErr) {
            const uploadErrMsg = uploadErr instanceof Error ? uploadErr.message : 'Unknown error';
            addDebug(`❌ Upload attempt ${uploadAttempts} failed: ${uploadErrMsg}`);
            
            if (uploadAttempts >= maxRetries) {
              throw new Error(`Upload failed after ${maxRetries} attempts: ${uploadErrMsg}`);
            }
          }
        }

        // Stage 3: Complete the upload
        await api.completeUpload(recordingId, {
          stopTimestamp: recording.stopTimestamp,
          durationMs: recording.durationMs,
          fileSizeBytes: recording.blob.size,
        });
        addDebug(`✅ Upload complete`);
        
        // Update task to completed
        setUploadTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, progress: 100, status: 'completed' } : task
        ));

        // Notify backend that upload is complete
        const socket = getSocket();
        socket.emit('upload_completed', {
          recordingId,
          fileSizeBytes: recording.blob.size,
        });

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Upload failed';
        addDebug(`❌ Upload error: ${errMsg}`);
        console.error('❌ Background upload failed:', {
          error: err,
          errorMessage: errMsg,
          recordingId,
          taskId,
          postureLabel,
          blobSize: recording.blob.size,
          blobType: recording.blob.type
        });
        
        // Update task to failed
        setUploadTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, status: 'failed', error: errMsg } : task
        ));
      } finally {
        // Release wake lock after upload completes
        await releaseWakeLock();
        
        // Mark processing as complete and process next upload
        isProcessingUploadRef.current = false;
        processUploadQueue();
      }
    };

    // Process upload queue - starts next upload if not already processing
    const processUploadQueue = () => {
      if (isProcessingUploadRef.current || uploadQueueRef.current.length === 0) {
        return;
      }

      // Get next task from queue
      const nextTask = uploadQueueRef.current.shift();
      if (!nextTask) return;

      // Mark as processing
      isProcessingUploadRef.current = true;

      // Update task status from queued to uploading
      setUploadTasks(prev => prev.map(task => 
        task.id === nextTask.taskId ? { ...task, status: 'uploading' } : task
      ));

      // Start upload
      uploadInBackground(
        nextTask.recording,
        nextTask.recordingId,
        nextTask.taskId,
        nextTask.postureLabel
      );
    };

    // Listen for confirmation to upload from any device
    socket.on('confirm_upload', async () => {
      addDebug('✅ Upload confirmed');
      const recording = pendingRecordingRef.current;
      if (recording) {
        // Close the confirmation modal immediately
        setPendingRecording(null);
        pendingRecordingRef.current = null;
        
        const recordingId = recordingIdRef.current;
        if (!recordingId) {
          console.error('No recording ID found');
          return;
        }

        const postureLabel = currentStepRef.current?.postureLabel || 'unknown';
        const taskId = `${recordingId}-${Date.now()}`;
        
        // Add upload task to the queue
        uploadQueueRef.current.push({
          recording,
          recordingId,
          taskId,
          postureLabel,
        });
        
        // Add task to UI with 'queued' status
        setUploadTasks(prev => [...prev, {
          id: taskId,
          postureLabel,
          deviceType: deviceType || 'unknown',
          viewType: viewType || 'unknown',
          progress: 0,
          status: 'queued',
        }]);
        setShowUploadPanel(true);
        
        // Try to process the queue (will only start if not already processing)
        processUploadQueue();
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
      socket.off('close_guide_modal');
      socket.off('confirm_upload');
      socket.off('confirm_rerecord');
    };
  }, [currentStep, startRecording, stopRecording, setRecording, setCurrentStep]);

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
            View: {viewType} | Device ID: {deviceId?.slice(0, 8)} | Cameras: {availableCameras.length}
          </p>
        </div>

        {/* Video Previews Grid */}
        <div className={`grid ${deviceType === 'desktop' ? 'md:grid-cols-2' : 'grid-cols-1'} gap-6 mb-6 landscape:gap-3`}>
          {/* Front View / Current Device Video Preview */}
          <div>
            <h3 className="text-lg font-semibold mb-3 landscape:text-base landscape:mb-2">
              {deviceType === 'desktop' ? 'Front View (This Device)' : 'Side View Camera'}
            </h3>
            <div className="relative bg-black rounded-lg overflow-hidden landscape:rounded" style={{ aspectRatio: '16/9' }}>
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

              {/* Camera selector button */}
              {availableCameras.length >= 1 && (
                <button
                  onClick={() => {
                    console.log('📷 Camera button clicked');
                    setShowCameraSelector(true);
                  }}
                  className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-lg transition-colors flex items-center gap-2 z-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Camera ({availableCameras.length})</span>
                </button>
              )}
              
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
        </div>
      </div>

      {/* Side View Preview (Desktop Only) */}
      {deviceType === 'desktop' && (
        <div>
          <h3 className="text-lg font-semibold mb-1">Side View (Mobile Device)</h3>
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

        {/* Camera Selector Modal */}
        {showCameraSelector && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Select Camera</h2>
                <button
                  onClick={() => setShowCameraSelector(false)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <p className="text-gray-600 mb-4">Choose which camera to use for recording:</p>
              
              <div className="space-y-2">
                {availableCameras.map((camera, index) => {
                  const isSelected = selectedCameraId === camera.deviceId || (!selectedCameraId && index === 0);
                  return (
                    <button
                      key={camera.deviceId}
                      onClick={() => {
                        handleCameraChange(camera.deviceId);
                        setShowCameraSelector(false);
                      }}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        isSelected
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        </svg>
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">
                            {camera.label || `Camera ${index + 1}`}
                          </div>
                          {isSelected && (
                            <div className="text-xs text-primary-600 font-medium mt-1">
                              Currently Active
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <svg className="w-5 h-5 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => setShowCameraSelector(false)}
                className="mt-4 w-full btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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
                    
                    // Broadcast to all devices to close the guide modal
                    const socket = getSocket();
                    if (socket && sessionId) {
                      socket.emit('close_guide_modal', { sessionId });
                    }
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
              <h2 className="text-2xl font-bold mb-4">Recording Complete!</h2>
              <p className="text-gray-700 mb-2">
                Video recorded successfully ({Math.round(pendingRecording.blob.size / 1024 / 1024 * 100) / 100} MB)
              </p>
              <p className="text-gray-600 text-sm mb-6">
                Duration: {Math.round(pendingRecording.durationMs / 1000)}s
              </p>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-900">
                  <strong>Review your recording:</strong> Was the posture correct? You can re-record, save to your device, or upload to server.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
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
                  className="px-4 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors text-sm"
                >
                  Re-record
                </button>
                
                <button
                  onClick={() => {
                    console.log('💾 Saving to device...');
                    downloadVideo(pendingRecording);
                    setMessage('Video saved to device!');
                  }}
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
                >
                  Save to Device
                </button>
                
                <button
                  onClick={async () => {
                    console.log('✓ Uploading...');
                    setMessage('Uploading...');
                    
                    // Broadcast to all devices to start uploading
                    // Backend will automatically send next_step_ready after marking as UPLOADING
                    const socket = getSocket();
                    if (socket && sessionId && currentStep) {
                      socket.emit('confirm_upload', { 
                        sessionId,
                        postureLabel: currentStep.postureLabel,
                        distance: currentDistance
                      });
                    }
                  }}
                  className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors text-sm"
                >
                  Upload
                </button>
              </div>

              <div className="text-center">
                <p className="text-xs text-gray-500">
                  Tip: You can save locally and still upload later
                </p>
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
        {/* {deviceType === 'mobile' && debugInfo.length > 0 && (
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
        )} */}

        {/* Error Message */}
        {cameraError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <strong>Camera Error:</strong> {cameraError}
          </div>
        )}
      </div>

      {/* Upload Tasks Panel */}
      {uploadTasks.length > 0 && (
        <div className={`fixed bottom-2 left-2 right-2 sm:left-auto sm:right-4 sm:bottom-4 landscape:bottom-1 landscape:left-1 landscape:right-auto landscape:max-w-sm bg-white rounded-lg shadow-2xl border border-gray-300 transition-all duration-300 ${
          showUploadPanel ? 'sm:w-96' : 'sm:w-64'
        } max-w-full z-50`}>
          {/* Panel Header */}
          <div className="flex items-center justify-between p-3 sm:p-4 landscape:p-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <h3 className="font-bold text-gray-800 text-sm sm:text-base landscape:text-xs truncate">
                Uploads ({uploadTasks.filter(t => t.status === 'uploading').length})
              </h3>
            </div>
            <button
              onClick={() => setShowUploadPanel(!showUploadPanel)}
              className="text-gray-600 hover:text-gray-800 transition-colors flex-shrink-0 ml-2"
            >
              <svg className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${showUploadPanel ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Panel Content */}
          {showUploadPanel && (
            <div className="max-h-64 sm:max-h-96 landscape:max-h-40 overflow-y-auto">
              {uploadTasks.map((task) => (
                <div key={task.id} className="p-3 sm:p-4 border-b border-gray-100 last:border-b-0">
                  {/* Task Info */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 text-xs sm:text-sm truncate">
                        {task.postureLabel}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {task.deviceType} • {task.viewType}
                      </div>
                    </div>
                    
                    {/* Status Icon */}
                    <div className="flex-shrink-0 ml-2">
                      {task.status === 'queued' && (
                        <div className="w-4 h-4 sm:w-5 sm:h-5">
                          <svg className="text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      )}
                      {task.status === 'uploading' && (
                        <div className="w-4 h-4 sm:w-5 sm:h-5">
                          <svg className="animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </div>
                      )}
                      {task.status === 'completed' && (
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {task.status === 'failed' && (
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {task.status === 'uploading' && (
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Uploading...</span>
                        <span className="font-medium">{task.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2 overflow-hidden">
                        <div
                          className="bg-blue-500 h-1.5 sm:h-2 rounded-full transition-all duration-300"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Queued Message */}
                  {task.status === 'queued' && (
                    <div className="text-xs text-gray-500 font-medium">
                      ⏳ Waiting in queue...
                    </div>
                  )}

                  {/* Completed Message */}
                  {task.status === 'completed' && (
                    <div className="text-xs text-green-600 font-medium">
                      ✓ Upload complete
                    </div>
                  )}

                  {/* Error Message */}
                  {task.status === 'failed' && task.error && (
                    <div className="text-xs text-red-600 mt-1 break-words">
                      Error: {task.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Clear Completed Button */}
          {showUploadPanel && uploadTasks.some(t => t.status === 'completed' || t.status === 'failed') && (
            <div className="p-2 sm:p-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              <button
                onClick={() => setUploadTasks(prev => prev.filter(t => t.status === 'uploading' || t.status === 'queued'))}
                className="w-full text-xs text-gray-600 hover:text-gray-800 font-medium transition-colors py-1"
              >
                Clear Completed Tasks
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
