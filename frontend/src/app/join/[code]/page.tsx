'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import { useSessionStore } from '@/store/sessionStore';
import RecordingSession from '@/components/RecordingSession';

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const hasJoinedRef = useRef(false);

  const {
    sessionId,
    isConnected,
    desktopConnected,
    mobileConnected,
    setSession,
    setDeviceId,
    setConnected,
    updateConnectionStatus,
    setSessionStatus,
    setCurrentStep,
  } = useSessionStore();

  useEffect(() => {
    const sessionCode = params.code as string;
    if (sessionCode && !hasJoinedRef.current) {
      hasJoinedRef.current = true;
      joinSession(sessionCode);
    }
  }, [params.code]);

  const joinSession = async (sessionCode: string) => {
    setLoading(true);
    setError('');

    try {
      // Get session info
      const session = await api.getSessionByCode(sessionCode);
      
      console.log('Session fetched:', session);
      
      if (!session || !session.id) {
        setError('Session not found or invalid');
        setLoading(false);
        return;
      }

      setSession({
        sessionId: session.id,
        sessionCode: session.sessionCode,
        deviceType: 'mobile',
        viewType: 'side',
      });

      // Connect to WebSocket
      await connectSocket();
      const socket = getSocket();

      // Remove any existing listeners to prevent duplicates
      socket.off('joined_session');
      socket.off('device_joined');
      socket.off('next_step_ready');
      socket.off('error');

      // Listen for join confirmation
      socket.once('joined_session', (data) => {
        console.log('Mobile joined session:', data);
        setDeviceId(data.deviceId);
        setConnected(true);
        updateConnectionStatus(data.session.desktopConnected, data.session.mobileConnected);
        setSessionStatus(data.session.status);
        setLoading(false);
      });

      // Listen for device updates
      socket.on('device_joined', (data) => {
        console.log('Device update:', data);
        updateConnectionStatus(data.desktopConnected, data.mobileConnected);
        setSessionStatus(data.status);
      });

      socket.on('next_step_ready', (data) => {
        setCurrentStep(data.step);
      });

      socket.on('error', (error) => {
        console.error('Socket error:', error);
        setError(error.message);
        setLoading(false);
      });

      // Join session as mobile device (only after listeners are set up)
      console.log('Emitting join_session with sessionId:', session.id);
      socket.emit('join_session', {
        sessionId: session.id,
        deviceType: 'mobile',
        viewType: 'side',
        userAgent: navigator.userAgent,
      });

    } catch (err) {
      console.error('Failed to join session:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error details:', errorMessage);
      setError(`Failed to join session: ${errorMessage}. Please check the code and try again.`);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-xl text-gray-700">Joining session...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="card text-center max-w-md shadow-xl">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-4">Connection Error</h1>
          <p className="text-gray-700 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="btn-primary"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-xl text-gray-700">Connecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-4xl mx-auto mb-6">
        <div className="card shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold">Side View Camera</h2>
          </div>
          
          <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-300">
            <span className="font-medium text-green-900">Connection Status</span>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-green-800 font-bold">Connected</span>
            </div>
          </div>

          <p className="mt-4 text-gray-700">
            Hold your phone to capture the side view. Recording will start automatically
            when the desktop operator begins.
          </p>
        </div>
      </div>

      <RecordingSession />
    </div>
  );
}
