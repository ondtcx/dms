// src/documents/documents.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseIntPipe,
  Query,
  Res,
  StreamableFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { createReadStream, promises as fsPromises } from 'fs';
import { DocumentService } from './document.service';
import { ThumbnailService } from './thumbnail.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/role.enum';
import { multerConfig, allFilesFilter } from './config/multer.config';
import { CreateDocumentFromTemplateDto } from '../document-template/dto/create-document-from-template.dto';
import { UpdateDocumentFromTemplateDto } from '../document-template/dto/update-document-from-template.dto';
import { CreateBatchFromTemplateDto } from '../document-template/dto/create-batch-from-template.dto';
import { DocumentTemplateService } from '../document-template/document-template.service';
import { SettingsService } from '../settings/settings.service';

@ApiTags('documents')
@Controller('documents')
@ApiBearerAuth('JWT-auth')
export class DocumentController {
  constructor(
    private readonly documentsService: DocumentService,
    private readonly documentTemplateService: DocumentTemplateService,
    private readonly thumbnailService: ThumbnailService,
    private readonly settingsService: SettingsService,
  ) {}

  @Post('from-template')
  @ApiOperation({
    summary: 'Crear documento desde una plantilla',
    description:
      'Genera un nuevo documento a partir de un formulario basado en una plantilla existente. El sistema valida que todos los campos requeridos estén presentes y genera un archivo JSON estructurado.',
  })
  @ApiBody({
    type: CreateDocumentFromTemplateDto,
    description: 'Datos del formulario según la plantilla seleccionada',
    examples: {
      'Acta de Reunión': {
        value: {
          templateId: 1,
          formData: {
            titulo: 'Reunión de planificación Q1 2024',
            fecha: '2024-01-15',
            hora_inicio: '09:00',
            hora_fin: '11:30',
            lugar: 'Sala de conferencias',
            participantes: 'Juan, María, Carlos',
            agenda: 'Revisión de objetivos',
            desarrollo: 'Se discutieron los objetivos del trimestre',
            acuerdos: 'Implementar mejoras en el proceso',
          },
          filename: 'acta-reunion-2024-01-15.json',
          description: 'Acta de reunión de planificación',
          isPublic: false,
        },
      },
      'Certificado de Trabajo': {
        value: {
          templateId: 2,
          formData: {
            nombre_empleado: 'Juan Pérez García',
            identificacion: '12345678-9',
            cargo: 'Desarrollador Senior',
            fecha_ingreso: '2020-03-15',
            funciones: 'Desarrollo de aplicaciones web',
          },
          description: 'Certificado laboral',
          isPublic: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Documento creado desde plantilla exitosamente',
    schema: {
      example: {
        id: 42,
        filename: 'acta-reunion-2024-01-15.json',
        storedName: '1737800123456-acta-reunion-2024-01-15.json',
        mimetype: 'application/json',
        size: 1024,
        path: '/path/to/uploads/1737800123456-acta-reunion-2024-01-15.json',
        description: 'Acta de reunión de planificación trimestral',
        isPublic: false,
        uploadedById: 'cmhtlluz80000eba0by5adzbj',
        templateId: 1,
        formData: {
          titulo: 'Reunión de planificación Q1 2024',
          fecha: '2024-01-15',
        },
        createdAt: '2024-01-25T14:32:03.456Z',
        updatedAt: '2024-01-25T14:32:03.456Z',
        uploadedBy: {
          id: 'cmhtlluz80000eba0by5adzbj',
          name: 'Administrador',
          email: 'admin@example.com',
        },
        template: {
          id: 1,
          name: 'Acta de Reunión',
          type: 'acta',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Plantilla inactiva o campos requeridos faltantes',
    schema: {
      examples: {
        'Plantilla inactiva': {
          value: {
            statusCode: 400,
            message: 'La plantilla no está activa',
            error: 'Bad Request',
          },
        },
        'Campos faltantes': {
          value: {
            statusCode: 400,
            message: 'Faltan campos requeridos: titulo, fecha, participantes',
            error: 'Bad Request',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Plantilla no encontrada',
    schema: {
      example: {
        statusCode: 404,
        message: 'Plantilla no encontrada',
        error: 'Not Found',
      },
    },
  })
  createFromTemplate(
    @Body() createDocumentFromTemplateDto: CreateDocumentFromTemplateDto,
    @CurrentUser() user: any,
  ) {
    return this.documentTemplateService.createDocumentFromTemplate(
      createDocumentFromTemplateDto,
      user.id,
      user.role,
    );
  }

  @Post('batch-from-template')
  @ApiOperation({ summary: 'Generar documentos en lote desde una plantilla' })
  @ApiResponse({ status: 201, description: 'Lote creado exitosamente' })
  @ApiResponse({
    status: 400,
    description: 'Sin filas válidas o plantilla inactiva',
  })
  @ApiResponse({ status: 404, description: 'Plantilla no encontrada' })
  createBatchFromTemplate(
    @Body() dto: CreateBatchFromTemplateDto,
    @CurrentUser() user: any,
  ) {
    return this.documentTemplateService.createBatchFromTemplate(
      dto,
      user.id,
      user.role,
    );
  }

  @Post('upload')
  @ApiOperation({ summary: 'Subir un documento' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        description: { type: 'string' },
        isPublic: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Documento subido exitosamente' })
  @UseInterceptors(
    FileInterceptor('file', {
      ...multerConfig,
      fileFilter: allFilesFilter,
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDocumentDto: UploadDocumentDto,
    @CurrentUser() user: any,
  ) {
    await this.validateFile(file);
    return this.documentsService.upload(file, uploadDocumentDto, user.id);
  }

  @Post('upload-multiple')
  @ApiOperation({ summary: 'Subir múltiples documentos' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
        description: { type: 'string' },
        isPublic: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Documentos subidos exitosamente' })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      ...multerConfig,
      fileFilter: allFilesFilter,
    }),
  )
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() uploadDocumentDto: UploadDocumentDto,
    @CurrentUser() user: any,
  ) {
    for (const file of files) {
      await this.validateFile(file);
    }
    return this.documentsService.uploadMultiple(
      files,
      uploadDocumentDto,
      user.id,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Listar documentos con filtros y paginación' })
  @ApiResponse({ status: 200, description: 'Lista de documentos' })
  findAll(@Query() query: QueryDocumentDto, @CurrentUser() user: any) {
    return this.documentsService.findAll(query, user.id, user.role);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de documentos' })
  @ApiResponse({ status: 200, description: 'Estadísticas' })
  getStats(@CurrentUser() user: any) {
    return this.documentsService.getStats(user.id, user.role);
  }

  @Get('archive/stats')
  @ApiOperation({ summary: 'Obtener estadísticas del archivo histórico' })
  @ApiResponse({
    status: 200,
    description: 'Total archivados y distribución por categoría',
  })
  getArchiveStats(@CurrentUser() user: any) {
    return this.documentsService.getArchiveStats(user.id, user.role);
  }

  @Get('archive')
  @ApiOperation({ summary: 'Listar documentos archivados' })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de documentos archivados',
  })
  findArchived(@Query() query: QueryDocumentDto, @CurrentUser() user: any) {
    return this.documentsService.findArchived(query, user.id, user.role);
  }

  @Post(':id/restore-from-archive')
  @ApiOperation({
    summary: 'Restaurar documento desde el archivo histórico al activo',
  })
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiResponse({ status: 200, description: 'Documento restaurado al activo' })
  @ApiResponse({ status: 400, description: 'El documento no está archivado' })
  @ApiResponse({ status: 403, description: 'Sin permiso para restaurar' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  restoreFromArchive(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.restoreFromArchive(id, user.id, user.role);
  }

  @Get('calendar')
  @ApiOperation({
    summary: 'Obtener documentos agrupados por fecha para vista de calendario',
  })
  @ApiResponse({
    status: 200,
    description: 'Documentos agrupados por fecha',
    schema: {
      example: {
        documents: [],
        groupedByDate: {
          '2026-01-07': [
            {
              id: 1,
              filename: 'documento.pdf',
              createdAt: '2026-01-07T10:30:00Z',
              uploadedBy: { name: 'Juan Pérez' },
              category: { name: 'Académico', color: '#3b82f6' },
              section: { name: 'Calendario', color: '#10b981' },
            },
          ],
        },
        totalDocuments: 1,
      },
    },
  })
  getDocumentsByDate(
    @Query() query: CalendarQueryDto,
    @CurrentUser() user: any,
  ) {
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    return this.documentsService.getDocumentsByDate(
      user.id,
      user.role,
      startDate,
      endDate,
      query.categoryId,
      query.sectionId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener información de un documento' })
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiResponse({ status: 200, description: 'Información del documento' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.documentsService.findOne(id, user.id, user.role);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Descargar un documento' })
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiResponse({ status: 200, description: 'Descarga del archivo' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  async download(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { path, filename, mimetype } = await this.documentsService.download(
      id,
      user.id,
      user.role,
    );

    const file = createReadStream(path);

    res.set({
      'Content-Type': mimetype,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(file);
  }

  @Get(':id/view')
  @ApiOperation({ summary: 'Visualizar un documento en el navegador' })
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiResponse({ status: 200, description: 'Vista del documento' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  async view(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { path, filename, mimetype } = await this.documentsService.download(
      id,
      user.id,
      user.role,
    );

    const file = createReadStream(path);

    res.set({
      'Content-Type': mimetype,
      'Content-Disposition': `inline; filename="${filename}"`,
    });

    return new StreamableFile(file);
  }

  @Get(':id/thumbnail')
  @ApiOperation({ summary: 'Obtener thumbnail de un documento' })
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiResponse({ status: 200, description: 'Thumbnail del documento' })
  @ApiResponse({ status: 404, description: 'Thumbnail no disponible' })
  async getThumbnail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Verificar que el usuario tenga acceso al documento
    const doc = await this.documentsService.findOne(id, user.id, user.role);

    // Obtener o generar thumbnail
    let thumbnailPath = this.thumbnailService.getThumbnailPath(id);

    if (thumbnailPath) {
      // Verificar que el thumbnail no sea anterior al documento (puede quedar de un seed/reset anterior)
      const stats = await fsPromises.stat(thumbnailPath);
      const thumbMtime = stats.mtime;
      const docCreatedAt = new Date(doc.createdAt);
      if (thumbMtime < docCreatedAt) {
        thumbnailPath = await this.thumbnailService.regenerateThumbnail(
          doc.versions[0].path,
          id,
          doc.versions[0].mimetype,
        );
      }
    } else {
      // Generar thumbnail si no existe
      thumbnailPath = await this.thumbnailService.generateThumbnail(
        doc.versions[0].path,
        id,
        doc.versions[0].mimetype,
      );
    }

    if (!thumbnailPath) {
      throw new NotFoundException(
        'Thumbnail no disponible para este tipo de archivo',
      );
    }

    const file = createReadStream(thumbnailPath);

    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-cache',
    });

    return new StreamableFile(file);
  }

  @Patch(':id/from-template')
  @ApiOperation({
    summary: 'Regenerar documento desde formulario de plantilla',
  })
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiResponse({
    status: 200,
    description: 'Documento regenerado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Documento sin plantilla o campos inválidos',
  })
  @ApiResponse({ status: 403, description: 'Sin permiso para editar' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  updateFromTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentFromTemplateDto,
    @CurrentUser() user: any,
  ) {
    return this.documentTemplateService.updateDocumentFromTemplate(
      id,
      dto,
      user.id,
      user.role,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar metadata de un documento' })
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiResponse({ status: 200, description: 'Documento actualizado' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDocumentDto: UpdateDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.update(
      id,
      updateDocumentDto,
      user.id,
      user.role,
    );
  }

  @Patch(':id/replace')
  @ApiOperation({ summary: 'Reemplazar el archivo de un documento' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Archivo reemplazado' })
  @UseInterceptors(
    FileInterceptor('file', {
      ...multerConfig,
      fileFilter: allFilesFilter,
    }),
  )
  async replaceFile(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    await this.validateFile(file);
    return this.documentsService.replaceFile(id, file, user.id, user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un documento' })
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiResponse({ status: 200, description: 'Documento eliminado' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.documentsService.remove(id, user.id, user.role);
  }

  @Post('bulk/delete')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar múltiples documentos (Solo ADMIN)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'number' },
          example: [1, 2, 3],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Documentos eliminados' })
  async bulkDelete(@Body('ids') ids: number[], @CurrentUser() user: any) {
    const results = await Promise.all(
      ids.map((id) =>
        this.documentsService.remove(id, user.id, user.role).catch((error) => ({
          id,
          error: error.message,
        })),
      ),
    );

    return {
      message: 'Operación de eliminación masiva completada',
      results,
    };
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restaurar documento desde la papelera' })
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiResponse({ status: 200, description: 'Documento restaurado' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  restore(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.documentsService.restore(id, user.id, user.role);
  }

  @Delete(':id/permanent')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Eliminar permanentemente un documento (Solo ADMIN)',
  })
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiResponse({
    status: 200,
    description: 'Documento eliminado permanentemente',
  })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  permanentDelete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.permanentDelete(id, user.id, user.role);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Obtener historial de versiones de un documento' })
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiResponse({ status: 200, description: 'Historial de versiones' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  getVersions(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.documentsService.getVersions(id, user.id, user.role);
  }

  @Post(':id/versions/:version/restore')
  @ApiOperation({ summary: 'Restaurar una versión anterior del documento' })
  @ApiParam({ name: 'id', description: 'ID del documento' })
  @ApiParam({ name: 'version', description: 'Número de versión a restaurar' })
  @ApiResponse({ status: 200, description: 'Versión restaurada exitosamente' })
  @ApiResponse({
    status: 404,
    description: 'Documento o versión no encontrada',
  })
  restoreVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.restoreVersion(
      id,
      version,
      user.id,
      user.role,
    );
  }

  // ── Validación dinámica de archivos según SystemSettings ─────────────────
  private async validateFile(file: Express.Multer.File): Promise<void> {
    const maxMb = await this.settingsService.getMaxFileSizeMb();
    if (file.size > maxMb * 1024 * 1024) {
      throw new BadRequestException(
        `El archivo supera el tamaño máximo permitido (${maxMb} MB)`,
      );
    }

    const allowedMimeTypes = await this.settingsService.getAllowedMimeTypes();
    if (
      allowedMimeTypes.length > 0 &&
      !allowedMimeTypes.includes(file.mimetype)
    ) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}`,
      );
    }
  }
}
