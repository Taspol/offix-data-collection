'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function SetupPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/')}
            className="text-primary-600 hover:text-primary-700 mb-4 flex items-center gap-2 font-medium transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </button>
          <h1 className="text-4xl font-bold mb-3">Camera Setup Instructions</h1>
          <p className="text-lg text-gray-600">
            Follow these instructions to properly position your cameras for accurate posture data collection
          </p>
        </div>

        {/* Setup Image */}
        <div className="card mb-8">
          <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
            <Image
              src="/setup_img.png"
              alt="Camera setup diagram"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Front View Camera */}
          <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-blue-900">Front View Camera</h2>
            </div>
            <div className="space-y-3 text-gray-700">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-1">•</span>
                <div>
                  <p className="font-semibold text-blue-900">Device:</p>
                  <p>Your laptop's built-in webcam</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-1">•</span>
                <div>
                  <p className="font-semibold text-blue-900">Position:</p>
                  <p>Place your laptop at a comfortable distance for normal use</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-1">•</span>
                <div>
                  <p className="font-semibold text-blue-900">Height:</p>
                  <p>At or slightly below eye level (typical laptop position)</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-1">•</span>
                <div>
                  <p className="font-semibold text-blue-900">Angle:</p>
                  <p>Camera should face you directly from the front</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-1">•</span>
                <div>
                  <p className="font-semibold text-blue-900">Purpose:</p>
                  <p>Captures frontal view of your posture and upper body</p>
                </div>
              </div>
            </div>
          </div>

          {/* Side View Camera */}
          <div className="card bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-green-900">Side View Camera</h2>
            </div>
            <div className="space-y-3 text-gray-700">
              <div className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-1">•</span>
                <div>
                  <p className="font-semibold text-green-900">Device:</p>
                  <p>Your mobile phone or tablet</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-1">•</span>
                <div>
                  <p className="font-semibold text-green-900">Distance:</p>
                  <p className="font-bold">1 meter (approximately 3.3 feet) from your left side</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-1">•</span>
                <div>
                  <p className="font-semibold text-green-900">Height:</p>
                  <p className="font-bold">At eye level when you're sitting</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-1">•</span>
                <div>
                  <p className="font-semibold text-green-900">Angle:</p>
                  <p>Camera should face you perpendicular to your left side (90° angle)</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-1">•</span>
                <div>
                  <p className="font-semibold text-green-900">Purpose:</p>
                  <p>Captures side profile to measure spinal alignment and head position</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tips Section */}
        <div className="card mt-6 bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-300 shadow-lg">
          <h3 className="text-xl font-bold text-amber-900 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            Setup Tips
          </h3>
          <ul className="space-y-3 text-gray-700">
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Ensure both cameras have a clear, unobstructed view of you</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Use a phone stand or tripod to keep the mobile camera stable at the correct height</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Test the camera angles before starting the recording session</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Make sure you have good lighting so your posture is clearly visible</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Avoid sitting too close to walls or backgrounds that might obscure your profile</span>
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => router.push('/desktop')}
            className="btn-primary px-8 py-3"
          >
            Start Desktop Session
          </button>
          <button
            onClick={() => router.push('/mobile')}
            className="btn-primary px-8 py-3"
          >
            Join as Mobile
          </button>
        </div>
      </div>
    </div>
  );
}
