import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentModule } from '../document/document.module';
import { DocumentTemplateModule } from '../document-template/document-template.module';
import { SettingsModule } from '../settings/settings.module';
import { AuthoringAssetService } from './authoring-asset.service';
import { AuthoringController } from './authoring.controller';
import { AuthoringDocumentService } from './authoring-document.service';
import { AuthoringRendererService } from './authoring-renderer.service';
import { AuthoringTemplateService } from './authoring-template.service';

@Module({
  imports: [SettingsModule, DocumentTemplateModule, DocumentModule],
  controllers: [AuthoringController],
  providers: [
    AuthoringAssetService,
    AuthoringTemplateService,
    AuthoringDocumentService,
    AuthoringRendererService,
    PrismaService,
  ],
  exports: [
    AuthoringAssetService,
    AuthoringTemplateService,
    AuthoringDocumentService,
  ],
})
export class AuthoringModule {}
