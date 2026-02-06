import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { SessionService } from '../session/session.service';
import { DeviceType, ViewType } from '../entities/device.entity';
import { UploadStatus } from '../entities/recording.entity';
import { SessionStatus } from '../entities/session.entity';

interface JoinSessionPayload {
  sessionId: string;
  deviceType: DeviceType;
  viewType: ViewType;
  userAgent?: string;
}

interface StartRecordingPayload {
  sessionId: string;
  postureLabel: string;
  distance: string;
  duration: number;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SyncGateway.name);
  private deviceSockets: Map<string, { sessionId: string; deviceId: string }> = new Map();

  constructor(private readonly sessionService: SessionService) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    const deviceInfo = this.deviceSockets.get(client.id);
    if (deviceInfo) {
      await this.sessionService.disconnectDevice(deviceInfo.deviceId);
      this.deviceSockets.delete(client.id);
      
      // Notify other devices in the session
      this.server.to(deviceInfo.sessionId).emit('device_disconnected', {
        deviceId: deviceInfo.deviceId,
        timestamp: Date.now(),
      });
    }
  }

  @SubscribeMessage('join_session')
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinSessionPayload,
  ) {
    try {
      const { sessionId, deviceType, viewType, userAgent } = payload;

      // Debug log
      this.logger.log(`Join session request - sessionId: ${sessionId}, deviceType: ${deviceType}, viewType: ${viewType}`);

      if (!sessionId) {
        throw new Error('sessionId is required');
      }

      // Register device and join session
      const device = await this.sessionService.joinSession(
        sessionId,
        deviceType,
        viewType,
        client.id,
        userAgent,
      );

      // Store socket mapping
      this.deviceSockets.set(client.id, {
        sessionId,
        deviceId: device.id,
      });

      // Join socket room for this session
      await client.join(sessionId);

      // Get updated session state
      const session = await this.sessionService.getSession(sessionId);

      // Notify client of successful join
      client.emit('joined_session', {
        success: true,
        deviceId: device.id,
        session: {
          id: session.id,
          sessionCode: session.sessionCode,
          status: session.status,
          desktopConnected: session.desktopConnected,
          mobileConnected: session.mobileConnected,
        },
        timestamp: Date.now(),
      });

      // Notify all devices in session about new device
      this.server.to(sessionId).emit('device_joined', {
        deviceId: device.id,
        deviceType: device.deviceType,
        viewType: device.viewType,
        desktopConnected: session.desktopConnected,
        mobileConnected: session.mobileConnected,
        status: session.status,
        timestamp: Date.now(),
      });

      this.logger.log(
        `Device ${deviceType} joined session ${sessionId} (status: ${session.status})`,
      );
    } catch (error) {
      this.logger.error(`Error joining session: ${error.message}`);
      client.emit('error', {
        message: error.message,
        timestamp: Date.now(),
      });
    }
  }

  @SubscribeMessage('start_recording')
  async handleStartRecording(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: StartRecordingPayload,
  ) {
    try {
      const { sessionId, postureLabel, distance, duration } = payload;

      // Update session status
      await this.sessionService.updateSessionStatus(sessionId, SessionStatus.RECORDING);

      // Create recording metadata for both devices
      const devices = await this.sessionService.getSessionDevices(sessionId);
      const timestamp = Date.now();

      const recordings = [];
      for (const device of devices) {
        const recording = await this.sessionService.createRecording({
          sessionId,
          deviceId: device.id,
          deviceType: device.deviceType,
          viewType: device.viewType,
          postureLabel,
          distance,
          startTimestamp: timestamp,
        });
        recordings.push({
          recordingId: recording.id,
          deviceId: device.id,
          deviceType: device.deviceType,
          viewType: device.viewType,
        });
      }

      // Broadcast start command to all devices in session with recording IDs
      this.server.to(sessionId).emit('start_recording', {
        postureLabel,
        duration,
        timestamp,
        recordings,
      });

      this.logger.log(`Started recording for session ${sessionId}: ${postureLabel}`);
    } catch (error) {
      this.logger.error(`Error starting recording: ${error.message}`);
      client.emit('error', {
        message: error.message,
        timestamp: Date.now(),
      });
    }
  }

  @SubscribeMessage('stop_recording')
  async handleStopRecording(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ) {
    try {
      const { sessionId } = payload;
      const timestamp = Date.now();

      // Update session status
      await this.sessionService.updateSessionStatus(sessionId, SessionStatus.UPLOADING);

      // Broadcast stop command to all devices
      this.server.to(sessionId).emit('stop_recording', {
        timestamp,
      });

      this.logger.log(`Stopped recording for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error stopping recording: ${error.message}`);
      client.emit('error', {
        message: error.message,
        timestamp: Date.now(),
      });
    }
  }

  @SubscribeMessage('upload_started')
  async handleUploadStarted(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { recordingId: string },
  ) {
    try {
      const { recordingId } = payload;
      await this.sessionService.updateRecordingUploadStatus(
        recordingId,
        UploadStatus.UPLOADING,
      );
      this.logger.log(`Upload started for recording ${recordingId}`);
    } catch (error) {
      this.logger.error(`Error updating upload status: ${error.message}`);
    }
  }

  @SubscribeMessage('upload_completed')
  async handleUploadCompleted(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { recordingId: string; fileSizeBytes: number },
  ) {
    try {
      const { recordingId, fileSizeBytes } = payload;
      
      await this.sessionService.updateRecordingUploadStatus(
        recordingId,
        UploadStatus.COMPLETED,
        fileSizeBytes,
      );

      const recording = await this.sessionService.getRecording(recordingId);
      
      // Check if current step recordings are completed
      const { stepComplete, allStepsComplete, postureLabel } = 
        await this.sessionService.checkCurrentStepRecordingsCompleted(recordingId);

      this.logger.log(`Step ${postureLabel}: stepComplete=${stepComplete}, allStepsComplete=${allStepsComplete}`);

      if (stepComplete) {
        // Current step is complete (both devices uploaded)
        this.server.to(recording.sessionId).emit('recording_uploaded', {
          recordingId,
          postureLabel,
          timestamp: Date.now(),
        });

        if (allStepsComplete) {
          // All steps are complete, mark session as completed
          await this.sessionService.updateSessionStatus(
            recording.sessionId,
            SessionStatus.COMPLETED,
          );
          
          this.server.to(recording.sessionId).emit('session_completed', {
            sessionId: recording.sessionId,
            timestamp: Date.now(),
          });
          
          this.logger.log(`All steps completed for session ${recording.sessionId}`);
        }
      }

      this.logger.log(`Upload completed for recording ${recordingId}`);
    } catch (error) {
      this.logger.error(`Error completing upload: ${error.message}`);
    }
  }

  @SubscribeMessage('ready_for_next')
  async handleReadyForNext(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ) {
    try {
      const { sessionId } = payload;
      
      // Update session back to READY state for next posture
      await this.sessionService.updateSessionStatus(sessionId, SessionStatus.READY);
      
      // Get next posture step
      const nextStep = await this.sessionService.getNextPostureStep(sessionId);
      
      this.server.to(sessionId).emit('next_step_ready', {
        step: nextStep,
        timestamp: Date.now(),
      });

      this.logger.log(`Session ${sessionId} ready for next step`);
    } catch (error) {
      this.logger.error(`Error getting next step: ${error.message}`);
    }
  }

  @SubscribeMessage('video_frame')
  handleVideoFrame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; deviceType: string; frame: string },
  ) {
    try {
      const { sessionId, deviceType, frame } = payload;
      
      // Relay frame to other devices in the same session
      client.to(sessionId).emit('video_frame', {
        deviceType,
        frame,
      });
    } catch (error) {
      this.logger.error(`Error relaying video frame: ${error.message}`);
    }
  }

  @SubscribeMessage('confirm_upload')
  handleConfirmUpload(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ) {
    try {
      const { sessionId } = payload;
      
      // Broadcast to all other devices in session
      client.to(sessionId).emit('confirm_upload');
      
      this.logger.log(`Desktop confirmed upload for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error confirming upload: ${error.message}`);
    }
  }

  @SubscribeMessage('confirm_rerecord')
  async handleConfirmRerecord(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; recordingId?: string },
  ) {
    try {
      const { sessionId, recordingId } = payload;
      
      // If recordingId is provided, delete all recordings for that posture+distance
      if (recordingId) {
        const recording = await this.sessionService.getRecording(recordingId);
        await this.sessionService.deleteRecordingsByPostureAndDistance(
          recording.sessionId,
          recording.postureLabel,
          recording.distance,
        );
        this.logger.log(
          `Deleted recordings for ${recording.postureLabel} at ${recording.distance} distance`,
        );
      }
      
      // Broadcast to all other devices in session
      client.to(sessionId).emit('confirm_rerecord');
      
      this.logger.log(`Desktop requested re-record for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error confirming re-record: ${error.message}`);
    }
  }
}
