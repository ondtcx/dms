import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule } from '../settings/settings.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [SettingsModule],
  controllers: [NotificationController],
  providers: [PrismaService, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
