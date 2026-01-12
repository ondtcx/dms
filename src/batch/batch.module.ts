import { Module } from '@nestjs/common';
import { BatchService } from './batch.service';
import { BatchController } from './batch.controller';
import { PrismaService } from '../prisma/prisma.service';
import { ShareModule } from '../share/share.module';

@Module({
  imports: [ShareModule],
  controllers: [BatchController],
  providers: [BatchService, PrismaService],
  exports: [BatchService],
})
export class BatchModule {}
