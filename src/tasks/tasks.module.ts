import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from '../audit/audit.module';
import { CleanupService } from './cleanup.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule } from '../settings/settings.module';
import { AuthoringModule } from '../authoring/authoring.module';

@Module({
  imports: [ScheduleModule.forRoot(), SettingsModule, AuthoringModule, AuditModule],
  providers: [CleanupService, PrismaService],
})
export class TasksModule {}
