import { Module } from '@nestjs/common';
import { OnlyofficeController } from './onlyoffice.controller';
import { OnlyofficeService } from './onlyoffice.service';
import { DocumentModule } from '../document/document.module';
import { StorageModule } from '../storage/storage.module';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from '../storage/storage.service';

@Module({
  imports: [ConfigModule, DocumentModule, StorageModule],
  controllers: [OnlyofficeController],
  providers: [OnlyofficeService, PrismaService, StorageService],
})
export class OnlyofficeModule {}
