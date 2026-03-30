import { Module } from '@nestjs/common';
import { DocumentTypeService } from './document-type.service';
import { DocumentTypeController } from './document-type.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [DocumentTypeController],
  providers: [DocumentTypeService, PrismaService],
  exports: [DocumentTypeService],
})
export class DocumentTypeModule {}
