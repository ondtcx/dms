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
import { createReadStream } from 'fs';
import { DocumentService } from './document.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/role.enum';
import { multerConfig, allFilesFilter } from './config/multer.config';
import { CreateDocumentFromTemplateDto } from '../document-template/dto/create-document-from-template.dto';
import { DocumentTemplateService } from '../document-template/document-template.service';

@ApiTags('documents')
@Controller('documents')
@ApiBearerAuth('JWT-auth')
export class DocumentController {
  constructor(
    private readonly documentsService: DocumentService,
    private readonly documentTemplateService: DocumentTemplateService,
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
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDocumentDto: UploadDocumentDto,
    @CurrentUser() user: any,
  ) {
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
  uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() uploadDocumentDto: UploadDocumentDto,
    @CurrentUser() user: any,
  ) {
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
  replaceFile(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
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

  @Delete('bulk/delete')
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
  @ApiResponse({ status: 200, description: 'Documento eliminado permanentemente' })
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
  @ApiResponse({ status: 404, description: 'Documento o versión no encontrada' })
  restoreVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.restoreVersion(id, version, user.id, user.role);
  }
}
