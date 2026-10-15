import { Module } from '@nestjs/common';
import { BatchService } from './batch.service';
import { BatchController } from './batch.controller';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule } from '../settings/settings.module';
import { DirectoryModule } from '../directory/directory.module';

@Module({
  imports: [SettingsModule, DirectoryModule],
  controllers: [BatchController],
  providers: [BatchService, PrismaService],
  exports: [BatchService],
})
export class BatchModule {}
