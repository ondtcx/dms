import { Module } from '@nestjs/common';
import { DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [DirectoryController],
  providers: [DirectoryService, PrismaService],
  exports: [DirectoryService],
})
export class DirectoryModule {}
