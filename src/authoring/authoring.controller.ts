import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/permission.decorator';
import { AuthoringDocumentService } from './authoring-document.service';
import { AuthoringTemplateService } from './authoring-template.service';
import {
  CreateAuthoringBatchDto,
  CreateAuthoringDocumentDto,
  CreateAuthoringTemplateDto,
  CreateAuthoringTemplateVersionDto,
  ReturnAuthoringDocumentDto,
  ReviewAuthoringDocumentDto,
  SaveAuthoringDraftDto,
  SubmitAuthoringDocumentDto,
  UpdateAuthoringTemplateDto,
} from './dto/authoring.dto';

function sendPdf(
  res: Response,
  buffer: Buffer,
  filename: string,
  disposition: 'inline' | 'attachment',
) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${filename.replace(/["\\]/g, '')}"`,
  );
  return new StreamableFile(buffer);
}

@ApiTags('authoring')
@ApiBearerAuth('JWT-auth')
@Controller('authoring')
export class AuthoringController {
  constructor(
    private readonly templates: AuthoringTemplateService,
    private readonly documents: AuthoringDocumentService,
  ) {}

  @Get('templates')
  @ApiOperation({ summary: 'Listar plantillas de elaboración documental' })
  listTemplates(@Query('includeDrafts') includeDrafts?: string) {
    return this.templates.list(includeDrafts === 'true');
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Consultar una plantilla de elaboración' })
  getTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.templates.get(id);
  }

  @Post('templates')
  @RequirePermission('authoring.templates.manage')
  @ApiOperation({ summary: 'Crear una plantilla de elaboración' })
  createTemplate(
    @Body() dto: CreateAuthoringTemplateDto,
    @CurrentUser() user: any,
  ) {
    return this.templates.create(dto, user.id);
  }

  @Patch('templates/:id')
  @RequirePermission('authoring.templates.manage')
  @ApiOperation({ summary: 'Actualizar metadatos de una plantilla' })
  updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAuthoringTemplateDto,
  ) {
    return this.templates.update(id, dto);
  }

  @Post('templates/:id/versions')
  @RequirePermission('authoring.templates.design')
  @ApiOperation({ summary: 'Crear una versión borrador de la plantilla' })
  createVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAuthoringTemplateVersionDto,
    @CurrentUser() user: any,
  ) {
    return this.templates.createVersion(id, dto, user.id);
  }

  @Post('templates/:id/versions/:versionId/publish')
  @RequirePermission('authoring.templates.publish')
  @ApiOperation({ summary: 'Publicar una versión de plantilla' })
  publishVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
  ) {
    return this.templates.publish(id, versionId);
  }

  @Post('templates/:id/deactivate')
  @RequirePermission('authoring.templates.manage')
  @ApiOperation({ summary: 'Desactivar una plantilla' })
  deactivateTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.templates.deactivate(id);
  }

  @Get('templates/:id/preview')
  @ApiOperation({ summary: 'Previsualizar una plantilla en PDF' })
  async previewTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Query('versionId') versionId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.templates.preview(
      id,
      versionId ? Number(versionId) : undefined,
    );
    return sendPdf(res, result.buffer, result.filename, 'inline');
  }

  @Post('documents')
  @ApiOperation({ summary: 'Crear un borrador desde una versión de plantilla' })
  createDocument(
    @Body() dto: CreateAuthoringDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documents.createDraft(dto, user);
  }

  @Get('documents')
  @ApiOperation({ summary: 'Listar documentos de elaboración' })
  listDocuments(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.documents.list({ status, search, page, limit });
  }

  @Get('documents/pending')
  @ApiOperation({ summary: 'Documentos pendientes de revisión' })
  pendingDocuments() {
    return this.documents.pending();
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Consultar un documento de elaboración' })
  getDocument(@Param('id', ParseIntPipe) id: number) {
    return this.documents.get(id);
  }

  @Put('documents/:id/draft')
  @ApiOperation({ summary: 'Guardar un borrador' })
  saveDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveAuthoringDraftDto,
    @CurrentUser() user: any,
  ) {
    return this.documents.saveDraft(id, dto, user);
  }

  @Post('documents/:id/submit')
  @ApiOperation({ summary: 'Enviar el documento a revisión' })
  submitDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitAuthoringDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documents.submit(id, dto, user);
  }

  @Post('documents/:id/approve')
  @ApiOperation({ summary: 'Aprobar el documento' })
  approveDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewAuthoringDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documents.approve(id, dto, user);
  }

  @Post('documents/:id/return')
  @ApiOperation({ summary: 'Devolver el documento con observaciones' })
  returnDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnAuthoringDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documents.returnDocument(id, dto, user);
  }

  @Post('documents/:id/emit')
  @ApiOperation({ summary: 'Emitir el documento' })
  emitDocument(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.documents.emit(id, user);
  }

  @Post('documents/:id/archive')
  @ApiOperation({ summary: 'Archivar un documento emitido' })
  archiveDocument(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.documents.archive(id, user);
  }

  @Get('documents/:id/preview')
  @ApiOperation({ summary: 'Previsualizar el documento en PDF' })
  async previewDocument(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.documents.preview(id, user);
    return sendPdf(res, result.buffer, result.filename, 'inline');
  }

  @Get('documents/:id/download')
  @ApiOperation({ summary: 'Descargar el PDF actual del documento' })
  async downloadDocument(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.documents.download(id);
    return sendPdf(res, result.buffer, result.filename, 'attachment');
  }

  @Post('documents/batch')
  @ApiOperation({ summary: 'Generar borradores para varios destinatarios' })
  batchDocuments(
    @Body() dto: CreateAuthoringBatchDto,
    @CurrentUser() user: any,
  ) {
    return this.documents.batch(dto, user);
  }

  @Get('users')
  @ApiOperation({ summary: 'Listar usuarios activos para elegir revisor' })
  listUsers() {
    return this.documents.listUsers();
  }
}
