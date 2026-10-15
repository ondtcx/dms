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
  UnauthorizedException,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateBlankDocumentDto } from './dto/create-blank-document.dto';
import { OnlyofficeService } from './onlyoffice.service';
import { DocumentService } from '../document/document.service';
import { PrismaService } from '../prisma/prisma.service';
import { extname } from 'path';
import { createReadStream } from 'fs';
import { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';

@Controller('onlyoffice')
export class OnlyofficeController {
  constructor(
    private onlyofficeService: OnlyofficeService,
    private documentService: DocumentService,
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
    const canEdit = await this.documentService.canEditDocument(
      document,
      user.sub,
      user.role,
    );
    return this.onlyofficeService.generateEditorConfig(
      {
        id: document.id,
        title: document.versions?.[0]?.filename,
        fileType,
        callbackHost: '',
      },
      { id: user.sub, name: user.name },
      canEdit,
    );
  }

  // Endpoint público para que OnlyOffice descargue el archivo. El token de
  // emisión liga al actor y se revalida contra la política vigente.
  @Public()
  @Get('file/:documentId')
  async getFile(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Query('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const access = await this.onlyofficeService.resolveFileAccess(
      documentId,
      token,
    );
    if (!access) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const { version } = access;
    const file = createReadStream(version.path);
    res.set({
      'Content-Type': version.mimetype,
      'Content-Disposition': `inline; filename="${version.filename}"`,
    });

    return new StreamableFile(file);
  }

  @Public()
  @Post('callback/:documentId')
  @HttpCode(200)
  async handleCallback(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() body: any,
    @Req() req?: any,
    @Res() response?: Response,
    @Query('issuance') issuance?: string,
  ) {
    try {
      const res = response || req;
      const result = await this.onlyofficeService.handleCallback(
        documentId,
        body,
        req?.headers?.authorization,
        issuance,
      );
      return res.json({ error: result?.error === 0 ? 0 : 1 });
    } catch {
      return (response || req).json({ error: 1 });
    }
  }
}
