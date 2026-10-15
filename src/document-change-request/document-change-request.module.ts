import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentModule } from '../document/document.module';
import { SettingsModule } from '../settings/settings.module';
import { DocumentChangeRequestController } from './document-change-request.controller';
import { DocumentChangeRequestService } from './document-change-request.service';

@Module({ imports: [DocumentModule, SettingsModule], controllers: [DocumentChangeRequestController],
  providers: [PrismaService, DocumentChangeRequestService] })
export class DocumentChangeRequestModule {}
