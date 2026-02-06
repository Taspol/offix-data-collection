import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { Session } from '../entities/session.entity';
import { Device } from '../entities/device.entity';
import { Recording } from '../entities/recording.entity';
import { PostureStep } from '../entities/posture-step.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, Device, Recording, PostureStep]),
    StorageModule,
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
