import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Session } from './session.entity';

export enum DeviceType {
  DESKTOP = 'desktop',
  MOBILE = 'mobile',
}

export enum ViewType {
  FRONT = 'front',
  SIDE = 'side',
}

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'device_type', type: 'varchar', length: 10 })
  deviceType: DeviceType;

  @Column({ name: 'view_type', type: 'varchar', length: 10 })
  viewType: ViewType;

  @Column({ name: 'socket_id', type: 'varchar', length: 255, nullable: true })
  socketId: string;

  @CreateDateColumn({ name: 'connected_at' })
  connectedAt: Date;

  @Column({ name: 'disconnected_at', type: 'timestamp with time zone', nullable: true })
  disconnectedAt: Date;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string;

  @ManyToOne(() => Session, (session) => session.devices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: Session;
}
