// src/documents/documents.module.ts
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads',
    }),
  ],
  controllers: [DocumentController],
  providers: [DocumentService, PrismaService],
  exports: [DocumentService],
})
export class DocumentModule {}
