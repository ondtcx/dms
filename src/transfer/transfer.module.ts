import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma/prisma.service';
import { TransferController } from './transfer.controller';
import { TransferService } from './transfer.service';

@Module({
  imports: [AuditModule],
  controllers: [TransferController],
  providers: [TransferService, PrismaService],
  exports: [TransferService],
})
export class TransferModule {}
