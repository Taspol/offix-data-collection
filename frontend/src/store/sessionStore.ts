import { create } from 'zustand';
import { PostureStep } from '@/lib/api';

export type DeviceType = 'desktop' | 'mobile';
export type ViewType = 'front' | 'side';

export interface SessionState {
  // Session info
  sessionId: string | null;
  sessionCode: string | null;
  deviceType: DeviceType | null;
  viewType: ViewType | null;
  deviceId: string | null;
  
  // Connection status
  isConnected: boolean;
  desktopConnected: boolean;
  mobileConnected: boolean;
  sessionStatus: string;
  
  // Recording state
  currentStep: PostureStep | null;
  currentDistance: string;
  isRecording: boolean;
  isUploading: boolean;
  currentRecordingId: string | null;
  
  // Actions
  setSession: (data: {
    sessionId: string;
    sessionCode: string;
    deviceType: DeviceType;
    viewType: ViewType;
  }) => void;
  setDeviceId: (deviceId: string) => void;
  setConnected: (connected: boolean) => void;
  updateConnectionStatus: (desktop: boolean, mobile: boolean) => void;
  setSessionStatus: (status: string) => void;
  setCurrentStep: (step: PostureStep | null) => void;
  setCurrentDistance: (distance: string) => void;
  setRecording: (recording: boolean) => void;
  setUploading: (uploading: boolean) => void;
  setCurrentRecordingId: (id: string | null) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  sessionCode: null,
  deviceType: null,
  viewType: null,
  deviceId: null,
  isConnected: false,
  desktopConnected: false,
  mobileConnected: false,
  sessionStatus: 'CREATED',
  currentStep: null,
  currentDistance: 'nom',
  isRecording: false,
  isUploading: false,
  currentRecordingId: null,

  setSession: (data) =>
    set({
      sessionId: data.sessionId,
      sessionCode: data.sessionCode,
      deviceType: data.deviceType,
      viewType: data.viewType,
    }),

  setDeviceId: (deviceId) => set({ deviceId }),

  setConnected: (connected) => set({ isConnected: connected }),

  updateConnectionStatus: (desktop, mobile) =>
    set({
      desktopConnected: desktop,
      mobileConnected: mobile,
    }),

  setSessionStatus: (status) => set({ sessionStatus: status }),

  setCurrentStep: (step) => set({ currentStep: step }),

  setCurrentDistance: (distance) => set({ currentDistance: distance }),

  setRecording: (recording) => set({ isRecording: recording }),

  setUploading: (uploading) => set({ isUploading: uploading }),

  setCurrentRecordingId: (id) => set({ currentRecordingId: id }),

  reset: () =>
    set({
      sessionId: null,
      sessionCode: null,
      deviceType: null,
      viewType: null,
      deviceId: null,
      isConnected: false,
      desktopConnected: false,
      mobileConnected: false,
      sessionStatus: 'CREATED',
      currentStep: null,
      currentDistance: 'nom',
      isRecording: false,
      isUploading: false,
      currentRecordingId: null,
    }),
}));
