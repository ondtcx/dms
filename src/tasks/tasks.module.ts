import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CleanupService } from './cleanup.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule } from '../settings/settings.module';
import { AuthoringModule } from '../authoring/authoring.module';

@Module({
  imports: [ScheduleModule.forRoot(), SettingsModule, AuthoringModule],
  providers: [CleanupService, PrismaService],
})
export class TasksModule {}
