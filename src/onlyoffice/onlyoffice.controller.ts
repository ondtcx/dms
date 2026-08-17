// src/onlyoffice/onlyoffice.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  Query,
  ParseIntPipe,
  HttpCode,
  NotFoundException,
  UnauthorizedException,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateBlankDocumentDto } from './dto/create-blank-document.dto';
import { OnlyofficeService } from './onlyoffice.service';
import { DocumentService } from '../document/document.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { extname } from 'path';
import { createReadStream } from 'fs';
import { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import * as jwt from 'jsonwebtoken';

@Controller('onlyoffice')
export class OnlyofficeController {
  constructor(
    private onlyofficeService: OnlyofficeService,
    private documentService: DocumentService,
    private storageService: StorageService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Post('create-blank')
  @ApiOperation({
    summary: 'Create a blank document and open it in the editor',
  })
  async createBlank(
    @Body() dto: CreateBlankDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.onlyofficeService.createBlankDocument(dto, user.sub);
  }

  @Get('health')
  @ApiOperation({ summary: 'Verificar disponibilidad del editor OnlyOffice' })
  async checkHealth() {
    return this.onlyofficeService.checkHealth();
  }

  @Get('config/:documentId')
  async getEditorConfig(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Req() req,
  ) {
    const user = req.user;
    const document = await this.documentService.findOne(
      documentId,
      user.sub,
      user.role,
    );
    const fileType = extname(document.versions?.[0]?.filename || '').replace(
      '.',
      '',
    );
    return this.onlyofficeService.generateEditorConfig(
      {
        id: document.id,
        title: document.versions?.[0]?.filename,
        fileType,
        callbackHost: '',
      },
      { id: user.sub, name: user.name },
    );
  }

  // Endpoint público para que OnlyOffice descargue el archivo
  @Public()
  @Get('file/:documentId')
  async getFile(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Query('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const secret = this.config.get('ONLYOFFICE_SECRET').trim();

    try {
      const decoded = jwt.verify(token, secret) as any;
      const tokenDocumentId = decoded.documentId;

      if (tokenDocumentId !== documentId) {
        throw new UnauthorizedException('Token inválido');
      }
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    if (!document) throw new NotFoundException('Documento no encontrado');

    const file = createReadStream(document.versions[0].path);
    res.set({
      'Content-Type': document.versions[0].mimetype,
      'Content-Disposition': `inline; filename="${document.versions[0].filename}"`,
    });

    return new StreamableFile(file);
  }

  @Public()
  @Post('callback/:documentId')
  @HttpCode(200)
  async handleCallback(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() body: any,
    @Res() res: Response,
  ) {
    try {
      if (body.status === 2) {
        const document = await this.prisma.document.findUnique({
          where: { id: documentId },
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
        });

        if (!document) return res.json({ error: 1 });

        const fileResponse = await fetch(body.url);
        const buffer = Buffer.from(await fileResponse.arrayBuffer());

        const fs = await import('fs');
        fs.writeFileSync(document.versions[0].path, buffer);

        const newChecksum = await this.storageService.calculateFileHash(
          document.versions[0].path,
        );
        const newVersion = document.currentVersion + 1;

        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            currentVersion: newVersion,
          },
        });

        await this.prisma.documentVersion.create({
          data: {
            documentId,
            version: newVersion,
            filename: document.versions[0].filename,
            mimetype: document.versions[0].mimetype,
            storedName: document.versions[0].storedName,
            path: document.versions[0].path,
            size: buffer.length,
            checksumSHA256: newChecksum,
            comment: 'Editado con OnlyOffice',
            createdById: document.uploadedById,
            source: 'REEMPLAZO_MANUAL',
          },
        });
      }

      return res.json({ error: 0 });
    } catch (error) {
      console.error('Error en callback de OnlyOffice:', error);
      return res.json({ error: 1 });
    }
  }
}
