# System Overview Diagrams

## 1. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      Browser Clients                            │
├─────────────────────────────┬──────────────────────────────────┤
│     Desktop Browser         │       Mobile Browser              │
│  ┌─────────────────────┐   │    ┌─────────────────────┐       │
│  │  Next.js Frontend   │   │    │  Next.js Frontend   │       │
│  │  - Camera Handler   │   │    │  - Camera Handler   │       │
│  │  - Session Manager  │   │    │  - Session Joiner   │       │
│  │  - WebSocket Client │   │    │  - WebSocket Client │       │
│  │  - Upload Manager   │   │    │  - Upload Manager   │       │
│  └──────────┬──────────┘   │    └──────────┬──────────┘       │
└─────────────┼───────────────┴───────────────┼──────────────────┘
              │                               │
              │        HTTP + WebSocket       │
              │                               │
┌─────────────┴───────────────────────────────┴──────────────────┐
│                     Backend Server                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    NestJS API                             │  │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────┐   │  │
│  │  │  REST API  │  │  Socket.io │  │ Storage Service  │   │  │
│  │  │ Controllers│  │  Gateway   │  │ (Presigned URLs) │   │  │
│  │  └────────────┘  └────────────┘  └──────────────────┘   │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │         Session & Recording Services              │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────┬──────────────────────────────┬────────────────────┘
             │                              │
      ┌──────┴──────┐              ┌───────┴────────┐
      │ PostgreSQL  │              │  S3/Supabase   │
      │  Database   │              │    Storage     │
      │             │              │                │
      │  - Sessions │              │  - Video Files │
      │  - Devices  │              │  (.webm)       │
      │  - Metadata │              │                │
      └─────────────┘              └────────────────┘
```

## 2. Session Creation Flow

```
Desktop Browser                Backend                    Database
      │                          │                           │
      │──── POST /api/sessions ──►│                          │
      │                          │                           │
      │                          │─── INSERT sessions ──────►│
      │                          │                           │
      │                          │◄── session_id + code ─────│
      │                          │                           │
      │                          │ Generate QR code          │
      │◄── Session + QR code ────│                           │
      │                          │                           │
      │ Display QR code          │                           │
      │                          │                           │
      │─── WebSocket connect ────►│                          │
      │                          │                           │
      │─ join_session (desktop) ─►│                          │
      │                          │                           │
      │                          │─── INSERT devices ───────►│
      │                          │                           │
      │◄─── joined_session ──────│                           │
      │                          │                           │
   [Waiting for mobile...]       │                           │
```

## 3. Mobile Join Flow

```
Mobile Browser                Backend                    Database
      │                          │                           │
      │ Scan QR / Enter code     │                           │
      │                          │                           │
      │── GET /api/sessions/code/:code ──►                   │
      │                          │                           │
      │                          │─── SELECT sessions ──────►│
      │                          │                           │
      │◄── Session info ─────────│                           │
      │                          │                           │
      │─── WebSocket connect ────►│                          │
      │                          │                           │
      │─ join_session (mobile) ──►│                          │
      │                          │                           │
      │                          │─── INSERT devices ───────►│
      │                          │                           │
      │                          │─── UPDATE sessions ──────►│
      │                          │     (both connected)      │
      │                          │                           │
      │◄─── joined_session ──────│                           │
      │                          │                           │
      │                          │──► Broadcast to all:      │
      │◄── device_joined ────────│    device_joined          │
      │                          │                           │
Desktop◄─ device_joined ─────────┤                           │
      │                          │                           │
```

## 4. Synchronized Recording Flow

```
Desktop         Backend         Mobile          Database        Storage
   │               │               │                │               │
   │ User clicks   │               │                │               │
   │ "Start"       │               │                │               │
   │               │               │                │               │
   │─ start_rec ──►│               │                │               │
   │  (trigger)    │               │                │               │
   │               │               │                │               │
   │               │─ INSERT recordings (both) ────►│               │
   │               │   with start_timestamp         │               │
   │               │                                │               │
   │               │──► Broadcast to room:          │               │
   │◄─────────────┤   start_recording              │               │
   │               │     timestamp: T               │               │
   │               │────────────────────────────────►│               │
   │               │                                │               │
   │ Countdown:    │               │ Countdown:     │               │
   │ 3, 2, 1...    │               │ 3, 2, 1...     │               │
   │               │               │                │               │
   │ Calculate     │               │ Calculate      │               │
   │ time delta    │               │ time delta     │               │
   │ sync delay    │               │ sync delay     │               │
   │               │               │                │               │
   │ START REC     │               │ START REC      │               │
   │ @ ~T          │               │ @ ~T           │               │
   │═══════════════│               │════════════════│               │
   │ Recording...  │               │ Recording...   │               │
   │═══════════════│               │════════════════│               │
   │               │               │                │               │
   │ [After 10s]   │               │                │               │
   │               │               │                │               │
   │─ stop_rec ───►│               │                │               │
   │               │               │                │               │
   │               │──► Broadcast: stop_recording ──►               │
   │◄─────────────┤                                │               │
   │               │────────────────────────────────►│               │
   │               │               │                │               │
   │ STOP REC      │               │ STOP REC       │               │
   │               │               │                │               │
   │ Generate      │               │ Generate       │               │
   │ Blob          │               │ Blob           │               │
   │               │               │                │               │
```

## 5. Video Upload Flow

```
Client              Backend            Database         Storage
  │                   │                   │                │
  │ Recording blob    │                   │                │
  │ ready             │                   │                │
  │                   │                   │                │
  │─ POST upload-url ►│                   │                │
  │  (recordingId,    │                   │                │
  │   posture, etc)   │                   │                │
  │                   │                   │                │
  │                   │── Generate presigned URL ─────────►│
  │                   │   (5 min expiry)  │                │
  │                   │                   │                │
  │                   │◄─ uploadUrl ──────────────────────┤
  │                   │                   │                │
  │◄── uploadUrl ─────│                   │                │
  │    storagePath    │                   │                │
  │                   │                   │                │
  │─────────────────── PUT video ─────────────────────────►│
  │  (Direct upload, no backend)          │                │
  │                   │                   │                │
  │◄────────────────────────── 200 OK ────────────────────┤
  │                   │                   │                │
  │─ POST complete ──►│                   │                │
  │  (metadata)       │                   │                │
  │                   │                   │                │
  │                   │─ UPDATE recording ►│                │
  │                   │   upload_status = │                │
  │                   │   'COMPLETED'     │                │
  │                   │                   │                │
  │◄── success ───────│                   │                │
  │                   │                   │                │
  │─ upload_complete ─►                   │                │
  │  (WebSocket)      │                   │                │
  │                   │                   │                │
```

## 6. Time Synchronization Diagram

```
Server Time: ═══════════════════════════════════════════════►
            1000        1050        1100        1150        1200 (ms)
                         │
                         │ Sends: timestamp=1100
                         │
                    ┌────┴────┐
                    │         │
            ┌───────▼─┐   ┌───▼────────┐
Desktop:    │ Recv at │   │ Mobile:    │
            │ 1120    │   │ Recv at    │
            │         │   │ 1140       │
            │ Delta:  │   │            │
            │ +20ms   │   │ Delta:     │
            │         │   │ +40ms      │
            │ Delay:  │   │            │
            │ 0ms     │   │ Delay:     │
            │         │   │ 0ms        │
            │ Start   │   │            │
            │ @ 1120  │   │ Start      │
            └─────────┘   │ @ 1140     │
                          └────────────┘

Result: ~20ms difference (acceptable for posture analysis)
```

## 7. State Machine: Session Status

```
                    ┌─────────────┐
                    │   CREATED   │
                    └──────┬──────┘
                           │
                    Desktop joins
                           │
                    ┌──────▼──────────────┐
                    │ WAITING_FOR_MOBILE  │
                    └──────┬──────────────┘
                           │
                    Mobile joins
                           │
                    ┌──────▼──────┐
                    │    READY    │◄───┐
                    └──────┬──────┘    │
                           │           │
                    Start recording    │
                           │           │
                    ┌──────▼──────┐    │
                    │  RECORDING  │    │
                    └──────┬──────┘    │
                           │           │
                    Stop recording     │
                           │           │
                    ┌──────▼──────┐    │
                    │  UPLOADING  │    │
                    └──────┬──────┘    │
                           │           │
                    Videos uploaded    │
                           │           │
                   ┌───────┴────────┐  │
                   │                │  │
             All done?          More steps?
                   │                │  │
                   Yes              No─┘
                   │
            ┌──────▼──────┐
            │  COMPLETED  │
            └─────────────┘
```

## 8. Data Storage Organization

```
PostgreSQL Database
├── sessions
│   ├── id (UUID)
│   ├── session_code
│   ├── status
│   └── timestamps
│
├── devices
│   ├── id (UUID)
│   ├── session_id (FK)
│   ├── device_type
│   └── view_type
│
├── recordings
│   ├── id (UUID)
│   ├── session_id (FK)
│   ├── device_id (FK)
│   ├── posture_label
│   ├── storage_path
│   └── metadata
│
└── posture_steps
    ├── id
    ├── step_order
    ├── posture_label
    └── instructions

Cloud Storage (S3/Supabase)
└── posture-videos/
    └── sessions/
        └── {session-id}/
            ├── desktop-front/
            │   ├── sit_straight/
            │   │   └── {recording-id}.webm
            │   ├── lean_forward/
            │   │   └── {recording-id}.webm
            │   └── ...
            └── mobile-side/
                ├── sit_straight/
                │   └── {recording-id}.webm
                └── ...
```

## 9. Component Interaction: Frontend

```
┌─────────────────────────────────────────────────────────┐
│                      App Pages                          │
├──────────────┬──────────────┬──────────────────────────┤
│    Home      │   Desktop    │        Mobile            │
│    page      │    page      │        page              │
└──────┬───────┴──────┬───────┴──────────┬───────────────┘
       │              │                  │
       │         ┌────┴────────────┬─────┴──────┐
       │         │                 │            │
       │    ┌────▼────────┐   ┌────▼────────┐  │
       │    │  Recording  │   │   QR Code   │  │
       │    │  Session    │   │   Display   │  │
       │    │  Component  │   │  /Scanner   │  │
       │    └────┬────────┘   └─────────────┘  │
       │         │                              │
       │    ┌────┴────────────────────────┐    │
       │    │   useCamera Hook            │    │
       │    │   - requestCamera()         │    │
       │    │   - startRecording()        │    │
       │    │   - stopRecording()         │    │
       │    └────┬────────────────────────┘    │
       │         │                              │
       └─────────┴──────────────────────────────┘
                 │
       ┌─────────┴──────────────────────────────┐
       │     Shared Services                    │
       ├────────────────┬───────────────────────┤
       │  Socket.io     │  API Client           │
       │  - connect()   │  - createSession()    │
       │  - emit()      │  - getUploadUrl()     │
       │  - on()        │  - uploadVideo()      │
       └────────────────┴───────────────────────┘
                 │
       ┌─────────┴──────────────────────────────┐
       │    Zustand Store (State)               │
       │    - sessionId, deviceType             │
       │    - connectionStatus                  │
       │    - currentStep, isRecording          │
       └────────────────────────────────────────┘
```

## 10. Security Flow: Presigned URLs

```
Client                         Backend                      Storage
  │                              │                             │
  │ Need to upload              │                             │
  │                              │                             │
  │──── Request upload URL ─────►│                            │
  │     (session, posture)       │                             │
  │                              │                             │
  │                              │ Generate presigned URL      │
  │                              │ - Random recordingId        │
  │                              │ - Path: sessions/...        │
  │                              │ - Expires: 5 minutes        │
  │                              │ - ContentType: video/webm   │
  │                              │                             │
  │                              │────── Request signed URL ──►│
  │                              │       with permissions      │
  │                              │                             │
  │                              │◄─── Presigned URL ─────────┤
  │                              │     (temporary token)       │
  │                              │                             │
  │◄──── Presigned URL ──────────│                            │
  │      (expires in 5 min)      │                             │
  │                              │                             │
  │──────────────────────── PUT video with URL ───────────────►│
  │  (Direct upload, no credentials needed)                    │
  │                              │                             │
  │◄──────────────────────────────── 200 OK ──────────────────┤
  │                              │                             │
  │                              │                             │
  │──── Confirm upload ─────────►│                            │
  │     (recordingId + size)     │                             │
  │                              │                             │
  │                              │ Save metadata to DB         │
  │                              │                             │
  │◄──── Success ────────────────│                            │
  │                              │                             │

Benefits:
✓ No credentials on client
✓ Limited time access
✓ No backend video traffic
✓ Scalable and secure
```

---

These diagrams illustrate the complete flow of the posture data collection system,
from session creation through synchronized recording to secure video storage.
