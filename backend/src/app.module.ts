import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionModule } from './session/session.module';
import { SyncModule } from './sync/sync.module';
import { StorageModule } from './storage/storage.module';
import { PostureModule } from './posture/posture.module';
import { Session } from './entities/session.entity';
import { Device } from './entities/device.entity';
import { Recording } from './entities/recording.entity';
import { PostureStep } from './entities/posture-step.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST'),
        port: configService.get<number>('DATABASE_PORT'),
        username: configService.get('DATABASE_USER'),
        password: configService.get('DATABASE_PASSWORD'),
        database: configService.get('DATABASE_NAME'),
        entities: [Session, Device, Recording, PostureStep],
        synchronize: false, // Use migrations in production
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    SessionModule,
    SyncModule,
    StorageModule,
    PostureModule,
  ],
})
export class AppModule {}
