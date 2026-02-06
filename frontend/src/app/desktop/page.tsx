'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { api, PostureStep } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import { useSessionStore } from '@/store/sessionStore';
import RecordingSession from '@/components/RecordingSession';

export default function DesktopPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [allSteps, setAllSteps] = useState<PostureStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [currentDistance, setCurrentDistance] = useState<'nom' | 'close' | 'far'>('nom');
  const stepIndexRef = useRef(0); // Track step index for event handlers
  const distanceRef = useRef<'nom' | 'close' | 'far'>('nom');
  const autoProgressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const distances: Array<'nom' | 'close' | 'far'> = ['nom', 'close', 'far'];

  const {
    sessionId,
    sessionCode,
    isConnected,
    desktopConnected,
    mobileConnected,
    sessionStatus,
    currentStep,
    setSession,
    setDeviceId,
    setConnected,
    updateConnectionStatus,
    setSessionStatus,
    setCurrentStep,
    setCurrentDistance: setStoreDistance,
  } = useSessionStore();

  const bothConnected = desktopConnected && mobileConnected;
  const canStartRecording = bothConnected && sessionStatus === 'READY' && !loading;

  // Create session on mount
  useEffect(() => {
    createSession();
  }, []);

  const createSession = async () => {
    setLoading(true);
    try {
      // Create session via API
      const session = await api.createSession();
      console.log('Created session:', session);
      
      if (!session || !session.id) {
        alert('Failed to create session: Invalid response from server');
        setLoading(false);
        return;
      }
      
      setSession({
        sessionId: session.id,
        sessionCode: session.sessionCode,
        deviceType: 'desktop',
        viewType: 'front',
      });
      
      // Generate correct frontend URL for QR code
      const frontendUrl = window.location.origin;
      const correctJoinUrl = `${frontendUrl}/join/${session.sessionCode}`;
      setQrCode(correctJoinUrl);
      setJoinUrl(correctJoinUrl);

      // Get all posture steps
      const steps = await api.getAllPostures();
      setAllSteps(steps);
      setCurrentStep(steps[0]);

      // Connect to WebSocket
      await connectSocket();
      const socket = getSocket();

      // Join session
      console.log('Emitting join_session with sessionId:', session.id);
      socket.emit('join_session', {
        sessionId: session.id,
        deviceType: 'desktop',
        viewType: 'front',
        userAgent: navigator.userAgent,
      });

      // Listen for join confirmation
      socket.on('joined_session', (data) => {
        console.log('✅ Joined session:', data);
        setDeviceId(data.deviceId);
        setConnected(true);
        updateConnectionStatus(data.session.desktopConnected, data.session.mobileConnected);
        setSessionStatus(data.session.status);
      });

      // Listen for device updates
      socket.on('device_joined', (data) => {
        console.log('👤 Device joined:', data);
        updateConnectionStatus(data.desktopConnected, data.mobileConnected);
        setSessionStatus(data.status);
      });

      socket.on('device_disconnected', (data) => {
        console.log('👤 Device disconnected:', data);
      });

      socket.on('recording_uploaded', (data) => {
        console.log('✅ Recording uploaded:', data);
        // When uploads complete, set status to allow next step
        setSessionStatus('UPLOAD_COMPLETE');
      });

      socket.on('session_completed', () => {
        console.log('✅ Session completed event received - All 6 steps done!');
        console.log('Current step index:', stepIndexRef.current, 'Total steps:', allSteps.length);
        // Backend only emits this when ALL posture steps are complete
        setSessionStatus('COMPLETED');
      });

      socket.on('confirm_rerecord', () => {
        console.log('🔄 Re-record requested, resetting to READY');
        setSessionStatus('READY');
      });

      socket.on('error', (error) => {
        console.error('Socket error:', error);
        alert(error.message);
      });
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const startCurrentStep = async () => {
    if (!currentStep || !sessionId) return;

    setLoading(true);
    try {
      const socket = getSocket();
      
      socket.emit('start_recording', {
        sessionId,
        postureLabel: currentStep.postureLabel,
        distance: distanceRef.current,
        duration: currentStep.recordingDurationSeconds * 1000,
      });

      // Auto-stop after duration + countdown
      const totalDuration = 
        (currentStep.countdownSeconds + currentStep.recordingDurationSeconds) * 1000;
      
      setTimeout(() => {
        socket.emit('stop_recording', { sessionId });
        setLoading(false);
      }, totalDuration);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setLoading(false);
    }
  };

  const moveToNextStep = () => {
    const currentDistanceIndex = distances.indexOf(distanceRef.current);
    
    // New order: all postures at nom, then all at close, then all at far
    const nextIndex = currentStepIndex + 1;
    
    if (nextIndex < allSteps.length) {
      // Move to next posture, keep same distance
      stepIndexRef.current = nextIndex;
      setCurrentStepIndex(nextIndex);
      setCurrentStep(allSteps[nextIndex]);
      setSessionStatus('READY');
      console.log(`Moving to next posture: ${allSteps[nextIndex].displayName} at ${distanceRef.current}`);
    } else {
      // Completed all postures at current distance
      if (currentDistanceIndex < distances.length - 1) {
        // Move to next distance, reset to first posture
        const nextDistance = distances[currentDistanceIndex + 1];
        distanceRef.current = nextDistance;
        setCurrentDistance(nextDistance);
        setStoreDistance(nextDistance);
        
        stepIndexRef.current = 0;
        setCurrentStepIndex(0);
        setCurrentStep(allSteps[0]);
        setSessionStatus('READY');
        console.log(`Completed all postures at ${distances[currentDistanceIndex]}, moving to ${nextDistance} distance`);
      } else {
        // Completed all distances, check for freestyle step
        const freestyleStep = allSteps.find(s => s.postureLabel === 'freestyle_sitting');
        if (freestyleStep && currentStep?.postureLabel !== 'freestyle_sitting') {
          // Move to freestyle sitting
          const freestyleIndex = allSteps.findIndex(s => s.postureLabel === 'freestyle_sitting');
          stepIndexRef.current = freestyleIndex;
          setCurrentStepIndex(freestyleIndex);
          setCurrentStep(freestyleStep);
          distanceRef.current = 'nom';
          setCurrentDistance('nom');
          setStoreDistance('nom');
          setSessionStatus('READY');
          console.log('Moving to freestyle sitting...');
        } else {
          // Completed everything including freestyle
          setCurrentStepIndex(allSteps.length);
          setSessionStatus('COMPLETED');
          setCurrentStep(null);
          console.log('All recordings completed!');
        }
      }
    }
  };

  // Auto-progress to next step when upload completes
  useEffect(() => {
    if (sessionStatus === 'UPLOAD_COMPLETE' && stepIndexRef.current < allSteps.length) {
      // Clear any existing timeout
      if (autoProgressTimeoutRef.current) {
        clearTimeout(autoProgressTimeoutRef.current);
      }
      
      // Automatically move to next step after 2 seconds
      autoProgressTimeoutRef.current = setTimeout(() => {
        console.log('Auto-progressing to next step...');
        moveToNextStep();
      }, 2000);
    }

    return () => {
      if (autoProgressTimeoutRef.current) {
        clearTimeout(autoProgressTimeoutRef.current);
      }
    };
  }, [sessionStatus, allSteps.length]);

  if (!sessionId || !isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-xl text-gray-700">Creating session...</p>
        </div>
      </div>
    );
  }

  if (sessionStatus === 'COMPLETED') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card text-center max-w-2xl">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-3xl font-bold mb-4">Session Completed!</h1>
          <p className="text-gray-700 mb-6">
            All posture recordings have been completed and uploaded successfully.
          </p>
          <button
            onClick={() => router.push('/')}
            className="btn-primary"
          >
            Start New Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Left: Connection Status */}
          <div className="card">
            <h2 className="text-2xl font-bold mb-4">Session Setup</h2>
            
            <div className="mb-6">
              <div className="text-sm text-gray-600 mb-1">Session Code</div>
              <div className="text-3xl font-mono font-bold text-primary-600">
                {sessionCode}
              </div>
            </div>

            {/* QR Code */}
            {!bothConnected && (
              <div className="bg-white p-6 rounded-lg border-2 border-gray-200 mb-6">
                <p className="text-center text-sm text-gray-600 mb-4">
                  Scan with mobile device to join:
                </p>
                <div className="flex justify-center">
                  <QRCodeSVG value={qrCode} size={200} />
                </div>
              </div>
            )}

            {/* Connection Status */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <span className="font-medium">Desktop (Front)</span>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  desktopConnected 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {desktopConnected ? '✓ Connected' : 'Waiting...'}
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <span className="font-medium">Mobile (Side)</span>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  mobileConnected 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-orange-100 text-orange-800'
                }`}>
                  {mobileConnected ? '✓ Connected' : 'Waiting...'}
                </span>
              </div>
            </div>

            {bothConnected && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 font-medium text-center">
                  ✓ Both devices connected! Ready to record.
                </p>
              </div>
            )}
          </div>

          {/* Right: Workflow Controls */}
          <div className="card">
            <h2 className="text-2xl font-bold mb-4">Recording Workflow</h2>
            
            {/* Progress */}
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progress</span>
                <span>
                  {distances.indexOf(currentDistance) * allSteps.length + currentStepIndex + 1} / {allSteps.length * 3}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all"
                  style={{ 
                    width: `${((distances.indexOf(currentDistance) * allSteps.length + currentStepIndex + 1) / (allSteps.length * 3)) * 100}%` 
                  }}
                />
              </div>
            </div>

            {/* Current Step */}
            {currentStep && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-sm text-gray-600">Current Posture</div>
                  <div className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold">
                    {currentDistance.toUpperCase()}
                  </div>
                </div>
                <div className="text-2xl font-bold mb-2">{currentStep.displayName}</div>
                <p className="text-gray-700">{currentStep.instructions}</p>
              </div>
            )}

            {/* Start Button */}
            <button
              onClick={startCurrentStep}
              disabled={!canStartRecording}
              className="btn-primary w-full mb-4"
            >
              {loading ? 'Recording...' : `Start Recording (${currentStep?.recordingDurationSeconds}s)`}
            </button>

            {/* Auto-progressing message (after upload completes) */}
            {sessionStatus === 'UPLOAD_COMPLETE' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-green-800 mb-2">
                  <svg className="w-5 h-5 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">Upload Complete!</span>
                </div>
                <p className="text-sm text-green-700">Moving to next step...</p>
              </div>
            )}

            {/* Steps List */}
            <div className="mt-6">
              <h3 className="font-semibold mb-3">All Steps:</h3>
              <div className="space-y-2">
                {allSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`p-3 rounded-lg text-sm ${
                      index === currentStepIndex
                        ? 'bg-primary-100 border-2 border-primary-600'
                        : index < currentStepIndex
                        ? 'bg-green-50 border border-green-300'
                        : 'bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{step.displayName}</span>
                      {index < currentStepIndex && <span className="text-green-600">✓</span>}
                      {index === currentStepIndex && <span className="text-primary-600">→</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recording View */}
        {bothConnected && <RecordingSession />}
      </div>
    </div>
  );
}
