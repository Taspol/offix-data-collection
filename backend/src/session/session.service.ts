import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session, SessionStatus } from '../entities/session.entity';
import { Device, DeviceType, ViewType } from '../entities/device.entity';
import { Recording, UploadStatus } from '../entities/recording.entity';
import { PostureStep } from '../entities/posture-step.entity';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @InjectRepository(Device)
    private deviceRepository: Repository<Device>,
    @InjectRepository(Recording)
    private recordingRepository: Repository<Recording>,
    @InjectRepository(PostureStep)
    private postureStepRepository: Repository<PostureStep>,
  ) {}

  async createSession(): Promise<Session> {
    const sessionCode = nanoid();
    const session = this.sessionRepository.create({
      sessionCode,
      status: SessionStatus.CREATED,
    });
    return this.sessionRepository.save(session);
  }

  async getSession(sessionId: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['devices', 'recordings'],
    });
    
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    
    return session;
  }

  async getSessionByCode(sessionCode: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { sessionCode },
      relations: ['devices'],
    });
    
    if (!session) {
      throw new NotFoundException(`Session with code ${sessionCode} not found`);
    }
    
    return session;
  }

  async joinSession(
    sessionId: string,
    deviceType: DeviceType,
    viewType: ViewType,
    socketId: string,
    userAgent?: string,
  ): Promise<Device> {
    const session = await this.getSession(sessionId);

    // Use transaction with lock to prevent race conditions
    const queryRunner = this.deviceRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let device = await queryRunner.manager.findOne(Device, {
        where: { sessionId, deviceType },
        lock: { mode: 'pessimistic_write' },
      });

      if (device) {
        // Update existing device with new socket
        device.socketId = socketId;
        device.userAgent = userAgent;
        device.disconnectedAt = null;
        device.connectedAt = new Date();
      } else {
        // Create new device
        device = new Device();
        device.sessionId = sessionId;
        device.deviceType = deviceType;
        device.viewType = viewType;
        device.socketId = socketId;
        device.userAgent = userAgent;
      }

      await queryRunner.manager.save(device);
      await queryRunner.commitTransaction();

      // Update session connection status
      await this.updateDeviceConnection(sessionId, deviceType, true);

      return device;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    const device = await this.deviceRepository.findOne({
      where: { id: deviceId },
    });

    if (!device) return;

    device.disconnectedAt = new Date();
    device.socketId = null;
    await this.deviceRepository.save(device);

    // Update session connection status
    await this.updateDeviceConnection(device.sessionId, device.deviceType, false);
  }

  private async updateDeviceConnection(
    sessionId: string,
    deviceType: DeviceType,
    connected: boolean,
  ): Promise<void> {
    const session = await this.getSession(sessionId);

    if (deviceType === DeviceType.DESKTOP) {
      session.desktopConnected = connected;
    } else {
      session.mobileConnected = connected;
    }

    // Update status based on connections
    if (session.desktopConnected && session.mobileConnected) {
      if (session.status === SessionStatus.CREATED || 
          session.status === SessionStatus.WAITING_FOR_MOBILE) {
        session.status = SessionStatus.READY;
      }
    } else if (session.desktopConnected && !session.mobileConnected) {
      if (session.status === SessionStatus.CREATED) {
        session.status = SessionStatus.WAITING_FOR_MOBILE;
      }
    }

    await this.sessionRepository.save(session);
  }

  async updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    session.status = status;

    if (status === SessionStatus.RECORDING && !session.startedAt) {
      session.startedAt = new Date();
    }

    if (status === SessionStatus.COMPLETED) {
      session.completedAt = new Date();
    }

    await this.sessionRepository.save(session);
  }

  async getSessionDevices(sessionId: string): Promise<Device[]> {
    return this.deviceRepository.find({
      where: { sessionId },
    });
  }

  async createRecording(data: {
    sessionId: string;
    deviceId: string;
    deviceType: string;
    viewType: string;
    postureLabel: string;
    distance: string;
    startTimestamp: number;
  }): Promise<Recording> {
    const recording = this.recordingRepository.create(data);
    return this.recordingRepository.save(recording);
  }

  async getRecording(recordingId: string): Promise<Recording> {
    const recording = await this.recordingRepository.findOne({
      where: { id: recordingId },
    });

    if (!recording) {
      throw new NotFoundException(`Recording ${recordingId} not found`);
    }

    return recording;
  }

  async deleteRecordingsByPostureAndDistance(
    sessionId: string,
    postureLabel: string,
    distance: string,
  ): Promise<void> {
    await this.recordingRepository.delete({
      sessionId,
      postureLabel,
      distance,
    });
  }

  async updateRecordingUploadStatus(
    recordingId: string,
    status: UploadStatus,
    fileSizeBytes?: number,
  ): Promise<void> {
    const recording = await this.getRecording(recordingId);
    recording.uploadStatus = status;

    if (status === UploadStatus.UPLOADING) {
      recording.uploadStartedAt = new Date();
    }

    if (status === UploadStatus.COMPLETED) {
      recording.uploadCompletedAt = new Date();
      if (fileSizeBytes) {
        recording.fileSizeBytes = fileSizeBytes;
      }
    }

    await this.recordingRepository.save(recording);
  }

  async updateRecordingMetadata(
    recordingId: string,
    updates: {
      stopTimestamp?: number;
      durationMs?: number;
      storagePath?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<void> {
    await this.recordingRepository.update(recordingId, updates);
  }

  async checkAllRecordingsCompleted(sessionId: string): Promise<boolean> {
    const recordings = await this.recordingRepository.find({
      where: { sessionId },
    });

    if (recordings.length === 0) return false;

    return recordings.every(
      (r) => r.uploadStatus === UploadStatus.COMPLETED,
    );
  }

  async checkCurrentStepRecordingsCompleted(recordingId: string): Promise<{ stepComplete: boolean; allStepsComplete: boolean; postureLabel: string }> {
    // Get the recording that just completed
    const recording = await this.recordingRepository.findOne({
      where: { id: recordingId },
    });

    if (!recording) {
      throw new Error('Recording not found');
    }

    // Check if all recordings for THIS posture step AND distance are completed
    const stepRecordings = await this.recordingRepository.find({
      where: {
        sessionId: recording.sessionId,
        postureLabel: recording.postureLabel,
        distance: recording.distance,
      },
    });

    const stepComplete = stepRecordings.length === 2 && 
      stepRecordings.every(r => r.uploadStatus === UploadStatus.COMPLETED);

    // Check how many posture-distance combinations have been completed
    const completedCombinations = await this.recordingRepository
      .createQueryBuilder('recording')
      .select(['recording.posture_label', 'recording.distance'])
      .where('recording.session_id = :sessionId', { sessionId: recording.sessionId })
      .andWhere('recording.upload_status = :status', { status: UploadStatus.COMPLETED })
      .groupBy('recording.posture_label, recording.distance')
      .having('COUNT(*) = 2')
      .getRawMany();

    // Get total steps and distances
    // All postures (including freestyle_sitting) × 3 distances = 21 total recordings
    const totalSteps = await this.postureStepRepository.count();
    const totalCombinations = totalSteps * 3;
    const allStepsComplete = completedCombinations.length >= totalCombinations;

    return {
      stepComplete,
      allStepsComplete,
      postureLabel: recording.postureLabel,
    };
  }

  async getNextPostureStep(
    sessionId: string,
    currentPostureLabel?: string,
  ): Promise<{ step: PostureStep | null; distance: string }> {
    console.log(`\n🔍 getNextPostureStep called for session ${sessionId}, currentPostureLabel: ${currentPostureLabel}`);
    
    // Get all completed posture+distance combinations for this session
    // Consider a combination complete if recordings are UPLOADING or COMPLETED
    const completedCombinations = await this.recordingRepository
      .createQueryBuilder('recording')
      .select(['recording.posture_label', 'recording.distance'])
      .where('recording.session_id = :sessionId', { sessionId })
      .andWhere('recording.upload_status IN (:...statuses)', { 
        statuses: [UploadStatus.UPLOADING, UploadStatus.COMPLETED]
      })
      .groupBy('recording.posture_label, recording.distance')
      .having('COUNT(DISTINCT recording.device_type) = 2')
      .getRawMany();

    console.log('📊 Completed combinations:', JSON.stringify(completedCombinations, null, 2));

    // Get the current distance from the most recent recording
    const latestRecording = await this.recordingRepository
      .createQueryBuilder('recording')
      .where('recording.session_id = :sessionId', { sessionId })
      .orderBy('recording.created_at', 'DESC')
      .getOne();

    const currentDistance = latestRecording?.distance || 'nom';
    console.log(`📏 Current distance: ${currentDistance} (from latest recording: ${latestRecording?.postureLabel})`);
    
    // Get all posture steps
    const allSteps = await this.postureStepRepository.find({
      where: { isActive: true },
      order: { stepOrder: 'ASC' },
    });
    
    console.log(`📝 All posture steps: ${allSteps.map(s => s.postureLabel).join(', ')}`);
    
    // Find completed posture labels at current distance
    const completedAtCurrentDistance = completedCombinations
      .filter(c => c.recording_distance === currentDistance)
      .map(c => c.posture_label);
    
    console.log(`✅ Completed at ${currentDistance}: [${completedAtCurrentDistance.join(', ')}]`);
    
    // If current posture is provided, also exclude it from current distance
    const excludedAtCurrentDistance = currentPostureLabel
      ? [...completedAtCurrentDistance, currentPostureLabel]
      : completedAtCurrentDistance;
    
    console.log(`🚫 Excluded at ${currentDistance}: [${excludedAtCurrentDistance.join(', ')}]`);
    
    // Find next step at current distance
    const nextStepAtCurrentDistance = allSteps.find(
      step => !excludedAtCurrentDistance.includes(step.postureLabel)
    );
    
    console.log(`➡️ Next step at ${currentDistance}: ${nextStepAtCurrentDistance?.postureLabel || 'NONE'}`);
    
    if (nextStepAtCurrentDistance) {
      return { step: nextStepAtCurrentDistance, distance: currentDistance };
    }
    
    // No more steps at current distance, move to next distance
    const totalSteps = allSteps.length;
    const completedAtNom = completedCombinations.filter(c => c.recording_distance === 'nom').length;
    const completedAtClose = completedCombinations.filter(c => c.recording_distance === 'close').length;
    const completedAtFar = completedCombinations.filter(c => c.recording_distance === 'far').length;
    
    console.log(`📈 Distance completion - NOM: ${completedAtNom}/${totalSteps}, CLOSE: ${completedAtClose}/${totalSteps}, FAR: ${completedAtFar}/${totalSteps}`);
    
    if (currentDistance === 'nom' && completedAtNom >= totalSteps) {
      // Move to close distance - return first step
      console.log(`🎯 All postures completed at NOM! Moving to CLOSE distance with ${allSteps[0].postureLabel}`);
      return { step: allSteps[0], distance: 'close' };
    }
    
    if (currentDistance === 'close' && completedAtClose >= totalSteps) {
      // Move to far distance - return first step
      console.log(`🎯 All postures completed at CLOSE! Moving to FAR distance with ${allSteps[0].postureLabel}`);
      return { step: allSteps[0], distance: 'far' };
    }
    
    if (currentDistance === 'far' && completedAtFar >= totalSteps) {
      // All steps at all distances complete
      console.log(`🏁 All postures at all distances completed!`);
      return { step: null, distance: currentDistance };
    }
    
    // Fallback: return first step at current distance
    console.log(`⚠️ Fallback: returning ${allSteps[0].postureLabel} at ${currentDistance}`);
    return { step: allSteps[0], distance: currentDistance };
  }

  async getAllPostureSteps(): Promise<PostureStep[]> {
    return this.postureStepRepository.find({
      where: { isActive: true },
      order: { stepOrder: 'ASC' },
    });
  }

  async getSessionRecordings(sessionId: string): Promise<Recording[]> {
    return this.recordingRepository.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  async getPendingRecordingsForSession(sessionId: string): Promise<Recording[]> {
    return this.recordingRepository.find({
      where: { 
        sessionId,
        uploadStatus: UploadStatus.PENDING 
      },
    });
  }

  async getPendingRecordingsForPostureDistance(
    sessionId: string,
    postureLabel: string,
    distance: string,
  ): Promise<Recording[]> {
    return this.recordingRepository.find({
      where: { 
        sessionId,
        postureLabel,
        distance,
        uploadStatus: UploadStatus.PENDING 
      },
    });
  }
}
