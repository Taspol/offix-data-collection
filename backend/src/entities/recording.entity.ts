import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Session } from './session.entity';
import { Device } from './device.entity';

export enum UploadStatus {
  PENDING = 'PENDING',
  UPLOADING = 'UPLOADING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('recordings')
export class Recording {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  @Column({ name: 'device_type', type: 'varchar', length: 10 })
  deviceType: string;

  @Column({ name: 'view_type', type: 'varchar', length: 10 })
  viewType: string;

  @Column({ name: 'posture_label', type: 'varchar', length: 50 })
  postureLabel: string;

  @Column({ name: 'distance', type: 'varchar', length: 10, default: 'nom' })
  distance: string; // 'nom', 'close', 'far'

  @Column({ name: 'start_timestamp', type: 'bigint' })
  startTimestamp: number;

  @Column({ name: 'stop_timestamp', type: 'bigint', nullable: true })
  stopTimestamp: number;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs: number;

  @Column({ name: 'storage_path', type: 'varchar', length: 500, nullable: true })
  storagePath: string;

  @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
  fileSizeBytes: number;

  @Column({ name: 'mime_type', type: 'varchar', length: 50, default: 'video/webm' })
  mimeType: string;

  @Column({ name: 'upload_status', type: 'varchar', length: 20, default: UploadStatus.PENDING })
  uploadStatus: UploadStatus;

  @Column({ name: 'upload_started_at', type: 'timestamp with time zone', nullable: true })
  uploadStartedAt: Date;

  @Column({ name: 'upload_completed_at', type: 'timestamp with time zone', nullable: true })
  uploadCompletedAt: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Session, (session) => session.recordings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;
}
