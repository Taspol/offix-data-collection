import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SessionService } from './session.service';
import { StorageService } from '../storage/storage.service';
import { UploadStatus } from '../entities/recording.entity';
import * as QRCode from 'qrcode';

@Controller('api/sessions')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSession() {
    const session = await this.sessionService.createSession();
    
    // Generate QR code for mobile joining
    const joinUrl = `${process.env.CORS_ORIGIN}/join/${session.sessionCode}`;
    const qrCode = await QRCode.toDataURL(joinUrl);

    return {
      id: session.id,
      sessionCode: session.sessionCode,
      qrCode,
      joinUrl,
      status: session.status,
      createdAt: session.createdAt,
    };
  }

  @Get(':sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const session = await this.sessionService.getSession(sessionId);
    return {
      id: session.id,
      sessionCode: session.sessionCode,
      status: session.status,
      desktopConnected: session.desktopConnected,
      mobileConnected: session.mobileConnected,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    };
  }

  @Get('code/:sessionCode')
  async getSessionByCode(@Param('sessionCode') sessionCode: string) {
    const session = await this.sessionService.getSessionByCode(sessionCode);
    return {
      id: session.id,
      sessionCode: session.sessionCode,
      status: session.status,
      desktopConnected: session.desktopConnected,
      mobileConnected: session.mobileConnected,
    };
  }

  @Get(':sessionId/recordings')
  async getSessionRecordings(@Param('sessionId') sessionId: string) {
    const recordings = await this.sessionService.getSessionRecordings(sessionId);
    return recordings.map((r) => ({
      id: r.id,
      deviceType: r.deviceType,
      viewType: r.viewType,
      postureLabel: r.postureLabel,
      startTimestamp: r.startTimestamp,
      stopTimestamp: r.stopTimestamp,
      durationMs: r.durationMs,
      uploadStatus: r.uploadStatus,
      fileSizeBytes: r.fileSizeBytes,
    }));
  }

  @Post(':sessionId/upload-url')
  async getUploadUrl(
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      recordingId: string;
      deviceType: string;
      viewType: string;
      postureLabel: string;
    },
  ) {
    const { recordingId, deviceType, viewType, postureLabel } = body;

    const uploadInfo = await this.storageService.generateUploadUrl(
      sessionId,
      deviceType,
      viewType,
      postureLabel,
      recordingId,
    );

    // Update recording with storage path
    await this.sessionService.updateRecordingMetadata(recordingId, {
      storagePath: uploadInfo.storagePath,
    });

    return uploadInfo;
  }

  @Post('recordings/:recordingId/complete')
  @HttpCode(HttpStatus.OK)
  async completeUpload(
    @Param('recordingId') recordingId: string,
    @Body()
    body: {
      stopTimestamp: number;
      durationMs: number;
      fileSizeBytes: number;
      metadata?: Record<string, any>;
    },
  ) {
    await this.sessionService.updateRecordingMetadata(recordingId, {
      stopTimestamp: body.stopTimestamp,
      durationMs: body.durationMs,
      metadata: body.metadata,
    });

    await this.sessionService.updateRecordingUploadStatus(
      recordingId,
      UploadStatus.COMPLETED,
      body.fileSizeBytes,
    );

    return { success: true };
  }

  @Get('recordings/:recordingId/download-url')
  async getDownloadUrl(@Param('recordingId') recordingId: string) {
    const recording = await this.sessionService.getRecording(recordingId);
    
    if (!recording.storagePath) {
      return { error: 'Recording not uploaded yet' };
    }

    const downloadUrl = await this.storageService.getDownloadUrl(
      recording.storagePath,
    );

    return { downloadUrl };
  }
}
