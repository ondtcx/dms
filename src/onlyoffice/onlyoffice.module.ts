import { Module } from '@nestjs/common';
import { OnlyofficeController } from './onlyoffice.controller';
import { OnlyofficeService } from './onlyoffice.service';
import { DocumentModule } from '../document/document.module';
import { StorageModule } from '../storage/storage.module';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule, DocumentModule, StorageModule],
  controllers: [OnlyofficeController],
  providers: [OnlyofficeService, PrismaService],
})
export class OnlyofficeModule {}
