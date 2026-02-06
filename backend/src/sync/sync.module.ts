import { Module } from '@nestjs/common';
import { SyncGateway } from './sync.gateway';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  providers: [SyncGateway],
})
export class SyncModule {}
