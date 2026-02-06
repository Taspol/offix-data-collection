import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Device } from './device.entity';
import { Recording } from './recording.entity';

export enum SessionStatus {
  CREATED = 'CREATED',
  WAITING_FOR_MOBILE = 'WAITING_FOR_MOBILE',
  READY = 'READY',
  RECORDING = 'RECORDING',
  UPLOADING = 'UPLOADING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_code', type: 'varchar', length: 8, unique: true })
  sessionCode: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: SessionStatus.CREATED,
  })
  status: SessionStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date;

  @Column({ name: 'desktop_connected', default: false })
  desktopConnected: boolean;

  @Column({ name: 'mobile_connected', default: false })
  mobileConnected: boolean;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @OneToMany(() => Device, (device) => device.session)
  devices: Device[];

  @OneToMany(() => Recording, (recording) => recording.session)
  recordings: Recording[];
}
