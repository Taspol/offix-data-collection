'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MobilePage() {
  const router = useRouter();
  const [sessionCode, setSessionCode] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionCode.trim()) {
      router.push(`/join/${sessionCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="card max-w-md w-full shadow-xl">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">Join Session</h1>
          <p className="text-gray-600">
            Enter the session code from your desktop
          </p>
        </div>

        <form onSubmit={handleJoin} className="space-y-6">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
              Session Code
            </label>
            <input
              type="text"
              id="code"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
              placeholder="Enter 8-character code"
              maxLength={8}
              className="w-full px-4 py-3 text-center text-2xl font-mono border-2 border-gray-300 rounded-lg focus:border-primary-600 focus:outline-none uppercase"
              autoComplete="off"
            />
            <p className="mt-2 text-sm text-gray-500 text-center">
              Example: ABC12345
            </p>
          </div>

          <button
            type="submit"
            disabled={sessionCode.length !== 8}
            className="btn-primary w-full"
          >
            Join Session
          </button>
        </form>

        <div className="mt-8 p-4 bg-primary-50 rounded-lg">
          <h3 className="font-semibold mb-2 text-center">Instructions</h3>
          <ol className="text-sm text-gray-700 space-y-2">
            <li>1. Get the session code from your desktop</li>
            <li>2. Enter it above or scan the QR code</li>
            <li>3. Position your phone to capture side view</li>
            <li>4. Recording starts automatically</li>
          </ol>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/')}
            className="text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
