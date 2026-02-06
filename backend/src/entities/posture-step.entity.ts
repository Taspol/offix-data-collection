import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('posture_steps')
export class PostureStep {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'step_order', type: 'integer' })
  stepOrder: number;

  @Column({ name: 'posture_label', type: 'varchar', length: 50, unique: true })
  postureLabel: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName: string;

  @Column({ type: 'text' })
  instructions: string;

  @Column({ name: 'countdown_seconds', type: 'integer', default: 3 })
  countdownSeconds: number;

  @Column({ name: 'recording_duration_seconds', type: 'integer', default: 10 })
  recordingDurationSeconds: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
