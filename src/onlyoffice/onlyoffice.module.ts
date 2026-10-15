import { Module } from '@nestjs/common';
import { OnlyofficeController } from './onlyoffice.controller';
import { OnlyofficeService } from './onlyoffice.service';
import { DocumentModule } from '../document/document.module';
import { DirectoryModule } from '../directory/directory.module';
import { StorageModule } from '../storage/storage.module';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from '../storage/storage.service';
import { TextExtractionModule } from '../document/text-extraction/text-extraction.module';

@Module({
  imports: [
    ConfigModule,
    DocumentModule,
    DirectoryModule,
    StorageModule,
    TextExtractionModule,
  ],
  controllers: [OnlyofficeController],
  providers: [OnlyofficeService, PrismaService, StorageService],
})
export class OnlyofficeModule {}
