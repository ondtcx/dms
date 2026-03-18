import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [
    MulterModule.register({ dest: './uploads/temp' }),
  ],
  controllers: [SettingsController],
  providers: [SettingsService, PrismaService],
  exports: [SettingsService],
})
export class SettingsModule {}
