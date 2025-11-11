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

@ApiTags('documents')
@Controller('documents')
@ApiBearerAuth('JWT-auth')
export class DocumentController {
  constructor(private readonly documentsService: DocumentService) {}

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
}
