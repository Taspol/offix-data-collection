import { useEffect, useRef, useState, useCallback } from 'react';
import { PoseLandmarker, FilesetResolver, PoseLandmarkerResult } from '@mediapipe/tasks-vision';

export interface PoseValidation {
  isValid: boolean;
  issues: string[];
  confidence: number;
}

export interface PostureAngles {
  neckAngle?: number;
  spineAngle?: number;
  shoulderAlignment?: number;
  hipAlignment?: number;
}

export interface KeyLandmarks {
  nose?: any;
  leftEye?: any;
  rightEye?: any;
  leftEar?: any;
  rightEar?: any;
  mouth?: any;
  leftShoulder?: any;
  rightShoulder?: any;
}

// MediaPipe Pose Landmark indices
const LANDMARK_INDICES = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
};

export const usePoseDetection = (videoElement: HTMLVideoElement | null, viewType: 'front' | 'side') => {
  const [poseLandmarker, setPoseLandmarker] = useState<PoseLandmarker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [poseValidation, setPoseValidation] = useState<PoseValidation>({
    isValid: false,
    issues: [],
    confidence: 0,
  });
  const [landmarks, setLandmarks] = useState<any>(null);
  const [keyLandmarks, setKeyLandmarks] = useState<KeyLandmarks>({});
  const [postureAngles, setPostureAngles] = useState<PostureAngles>({});
  const animationFrameRef = useRef<number | null>(null);
  const lastDetectionTime = useRef<number>(0);

  // Extract key landmarks we care about
  const extractKeyLandmarks = (allLandmarks: any[]): KeyLandmarks => {
    return {
      nose: allLandmarks[LANDMARK_INDICES.NOSE],
      leftEye: allLandmarks[LANDMARK_INDICES.LEFT_EYE],
      rightEye: allLandmarks[LANDMARK_INDICES.RIGHT_EYE],
      leftEar: allLandmarks[LANDMARK_INDICES.LEFT_EAR],
      rightEar: allLandmarks[LANDMARK_INDICES.RIGHT_EAR],
      mouth: {
        left: allLandmarks[LANDMARK_INDICES.MOUTH_LEFT],
        right: allLandmarks[LANDMARK_INDICES.MOUTH_RIGHT],
      },
      leftShoulder: allLandmarks[LANDMARK_INDICES.LEFT_SHOULDER],
      rightShoulder: allLandmarks[LANDMARK_INDICES.RIGHT_SHOULDER],
    };
  };

  // Initialize MediaPipe Pose Landmarker
  useEffect(() => {
    const initializePoseDetector = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        setPoseLandmarker(landmarker);
        setIsReady(true);
        console.log('MediaPipe Pose Landmarker initialized');
      } catch (error) {
        console.error('Failed to initialize pose detector:', error);
      }
    };

    initializePoseDetector();

    return () => {
      if (poseLandmarker) {
        poseLandmarker.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Calculate angle between three points
  const calculateAngle = (pointA: any, pointB: any, pointC: any): number => {
    const radians = Math.atan2(pointC.y - pointB.y, pointC.x - pointB.x) -
                    Math.atan2(pointA.y - pointB.y, pointA.x - pointB.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    
    if (angle > 180.0) {
      angle = 360 - angle;
    }
    
    return angle;
  };

  // Validate front view posture (frontal alignment)
  const validateFrontViewPosture = (result: PoseLandmarkerResult): PoseValidation => {
    const issues: string[] = [];
    let isValid = true;

    if (!result.landmarks || result.landmarks.length === 0) {
      return { isValid: false, issues: ['No pose detected'], confidence: 0 };
    }

    const landmarks = result.landmarks[0];
    
    // Key landmarks for front view
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const nose = landmarks[0];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];

    // Check if person is centered and facing camera
    const centerX = (leftShoulder.x + rightShoulder.x) / 2;
    if (centerX < 0.3 || centerX > 0.7) {
      issues.push('Position yourself in the center of the frame');
      isValid = false;
    }

    // Check shoulder alignment (should be relatively level)
    const shoulderYDiff = Math.abs(leftShoulder.y - rightShoulder.y);
    const shoulderTilt = shoulderYDiff / Math.abs(leftShoulder.x - rightShoulder.x);
    
    if (shoulderTilt > 0.15) {
      issues.push('Keep shoulders level');
      isValid = false;
    }

    // Check if face is centered
    const faceCenter = (leftEar.x + rightEar.x) / 2;
    if (Math.abs(faceCenter - centerX) > 0.1) {
      issues.push('Keep head centered');
      isValid = false;
    }

    // Check visibility of key landmarks
    const requiredVisibility = 0.5;
    if (leftShoulder.visibility < requiredVisibility || 
        rightShoulder.visibility < requiredVisibility ||
        leftHip.visibility < requiredVisibility || 
        rightHip.visibility < requiredVisibility) {
      issues.push('Ensure full upper body is visible');
      isValid = false;
    }

    // Calculate shoulder alignment angle
    const shoulderAlignment = Math.abs(leftShoulder.y - rightShoulder.y) * 100;
    setPostureAngles(prev => ({ ...prev, shoulderAlignment }));

    const confidence = result.landmarks[0].reduce((sum, lm) => sum + (lm.visibility || 0), 0) / result.landmarks[0].length;

    return { isValid, issues, confidence };
  };

  // Validate side view posture (spinal alignment and head position)
  const validateSideViewPosture = (result: PoseLandmarkerResult): PoseValidation => {
    const issues: string[] = [];
    let isValid = true;

    if (!result.landmarks || result.landmarks.length === 0) {
      return { isValid: false, issues: ['No pose detected'], confidence: 0 };
    }

    const landmarks = result.landmarks[0];
    
    // Key landmarks for side view
    const nose = landmarks[0];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];

    // Use the more visible side
    const shoulder = leftShoulder.visibility > rightShoulder.visibility ? leftShoulder : rightShoulder;
    const hip = leftHip.visibility > rightHip.visibility ? leftHip : rightHip;
    const ear = leftEar.visibility > rightEar.visibility ? leftEar : rightEar;

    // Check if person is in profile view
    const shoulderHipXDiff = Math.abs(shoulder.x - hip.x);
    if (shoulderHipXDiff > 0.15) {
      issues.push('Turn to show your side profile');
      isValid = false;
    }

    // Calculate neck angle (ear to shoulder)
    const neckAngle = calculateAngle(
      { x: ear.x, y: ear.y },
      { x: shoulder.x, y: shoulder.y },
      { x: shoulder.x, y: shoulder.y + 0.1 }
    );
    
    // Ideal neck angle should be close to 180° (straight)
    if (neckAngle < 150 || neckAngle > 190) {
      issues.push('Adjust head position - may be too forward or back');
      isValid = false;
    }

    // Calculate spine angle (shoulder to hip)
    const spineAngle = calculateAngle(
      { x: shoulder.x, y: shoulder.y },
      { x: hip.x, y: hip.y },
      { x: hip.x, y: hip.y + 0.1 }
    );

    // Check for slouching or excessive leaning
    if (spineAngle < 160 || spineAngle > 200) {
      if (spineAngle < 160) {
        issues.push('Sit up straighter - you may be slouching');
      } else {
        issues.push('You may be leaning back too far');
      }
      isValid = false;
    }

    // Check visibility of key landmarks
    const requiredVisibility = 0.5;
    if (shoulder.visibility < requiredVisibility || 
        hip.visibility < requiredVisibility ||
        ear.visibility < requiredVisibility) {
      issues.push('Ensure your profile is clearly visible');
      isValid = false;
    }

    // Store angles for display
    setPostureAngles({
      neckAngle,
      spineAngle,
    });

    const confidence = result.landmarks[0].reduce((sum, lm) => sum + (lm.visibility || 0), 0) / result.landmarks[0].length;

    return { isValid, issues, confidence };
  };

  // Detect pose continuously
  const detectPose = useCallback(async () => {
    if (!poseLandmarker || !videoElement || videoElement.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(detectPose);
      return;
    }

    const now = performance.now();
    if (now - lastDetectionTime.current < 66) {
      animationFrameRef.current = requestAnimationFrame(detectPose);
      return;
    }
    lastDetectionTime.current = now;

    try {
      const result = await poseLandmarker.detectForVideo(videoElement, now);
      
      if (result.landmarks && result.landmarks.length > 0) {
        setLandmarks(result.landmarks[0]);
        
        // Extract key landmarks
        const keyLandmarksData = extractKeyLandmarks(result.landmarks[0]);
        setKeyLandmarks(keyLandmarksData);
        
        // Validate posture based on view type
        const validation = viewType === 'front' 
          ? validateFrontViewPosture(result)
          : validateSideViewPosture(result);
        
        setPoseValidation(validation);
      } else {
        setPoseValidation({
          isValid: false,
          issues: ['No pose detected - ensure you are visible'],
          confidence: 0,
        });
        setLandmarks(null);
        setKeyLandmarks({});
      }
    } catch (error) {
      console.error('Pose detection error:', error);
    }

    animationFrameRef.current = requestAnimationFrame(detectPose);
  }, [poseLandmarker, videoElement, viewType]);

  // Start/stop detection
  useEffect(() => {
    if (isReady && videoElement) {
      detectPose();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isReady, videoElement, detectPose]);

  return {
    isReady,
    poseValidation,
    landmarks,
    keyLandmarks,
    postureAngles,
  };
};
