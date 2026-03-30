import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseIntPipe,
  Res,
  StreamableFile,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { DocumentTemplateService } from './document-template.service';
import { CreateDocumentTemplateDto } from './dto/create-document-template.dto';
import { UpdateDocumentTemplateDto } from './dto/update-document-template.dto';
import { QueryDocumentTemplateDto } from './dto/query-document-template.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';

@ApiTags('document-templates')
@Controller('document-templates')
@ApiBearerAuth('JWT-auth')
export class DocumentTemplateController {
  constructor(
    private readonly documentTemplateService: DocumentTemplateService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear una nueva plantilla de documento',
    description:
      'Crea una plantilla personalizada con campos definidos por el usuario. Las plantillas permiten generar documentos estructurados desde formularios.',
  })
  @ApiResponse({
    status: 201,
    description: 'Plantilla creada exitosamente',
    schema: {
      example: {
        id: 1,
        name: 'Acta de Reunión',
        type: 'acta',
        description: 'Plantilla para registrar las actas de reuniones',
        fields: {
          fields: [
            {
              name: 'titulo',
              label: 'Título de la reunión',
              type: 'text',
              required: true,
            },
            {
              name: 'fecha',
              label: 'Fecha de la reunión',
              type: 'date',
              required: true,
            },
          ],
        },
        isActive: true,
        createdById: 'cmhtlluz80000eba0by5adzbj',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
        createdBy: {
          id: 'cmhtlluz80000eba0by5adzbj',
          name: 'Administrador',
          email: 'admin@example.com',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos',
    schema: {
      example: {
        statusCode: 400,
        message: ['name should not be empty', 'type should not be empty'],
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
      },
    },
  })
  create(
    @Body() createDocumentTemplateDto: CreateDocumentTemplateDto,
    @CurrentUser() user: any,
  ) {
    return this.documentTemplateService.create(
      createDocumentTemplateDto,
      user.id,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Listar plantillas con filtros y paginación',
    description:
      'Obtiene una lista paginada de plantillas. Los usuarios normales solo ven plantillas activas o las que crearon. Los administradores ven todas.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Buscar por nombre o tipo',
    example: 'acta',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filtrar por tipo de plantilla',
    example: 'certificado',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    description: 'Filtrar por estado activo',
    example: true,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Número de página',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Elementos por página',
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de plantillas',
    schema: {
      example: {
        data: [
          {
            id: 1,
            name: 'Acta de Reunión',
            type: 'acta',
            description: 'Plantilla para registrar las actas de reuniones',
            fields: {},
            isActive: true,
            createdById: 'cmhtlluz80000eba0by5adzbj',
            createdAt: '2024-01-15T10:00:00.000Z',
            updatedAt: '2024-01-15T10:00:00.000Z',
            createdBy: {
              id: 'cmhtlluz80000eba0by5adzbj',
              name: 'Administrador',
              email: 'admin@example.com',
            },
            _count: {
              documents: 5,
            },
          },
        ],
        meta: {
          total: 8,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      },
    },
  })
  findAll(@Query() query: QueryDocumentTemplateDto, @CurrentUser() user: any) {
    return this.documentTemplateService.findAll(query, user.id, user.role);
  }

  @Get(':id/preview')
  @ApiOperation({
    summary: 'Generar vista previa de una plantilla',
    description:
      'Genera un PDF de ejemplo usando datos de prueba para previsualizar cómo se verá la plantilla',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la plantilla',
    example: 1,
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'PDF de vista previa generado',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Plantilla no encontrada',
  })
  async preview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.documentTemplateService.generatePreview(
      id,
      user.id,
      user.role,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    });

    return new StreamableFile(buffer);
  }

  @Get(':id/thumbnail')
  @ApiOperation({
    summary: 'Obtener thumbnail de una plantilla',
    description:
      'Retorna una imagen en miniatura (200x200px) de la primera página de la plantilla. Se genera automáticamente desde la vista previa.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la plantilla',
    example: 1,
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Thumbnail de la plantilla',
    content: {
      'image/jpeg': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Plantilla no encontrada o thumbnail no disponible',
  })
  async getThumbnail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const thumbnailPath = await this.documentTemplateService.getTemplateThumbnail(
      id,
      user.id,
      user.role,
    );

    if (!thumbnailPath || !existsSync(thumbnailPath)) {
      throw new NotFoundException('Thumbnail no disponible para esta plantilla');
    }

    const file = createReadStream(thumbnailPath);
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-store',
    });

    return new StreamableFile(file);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener información de una plantilla',
    description:
      'Retorna los detalles completos de una plantilla específica por su ID',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la plantilla',
    example: 1,
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Información de la plantilla',
    schema: {
      example: {
        id: 1,
        name: 'Acta de Reunión',
        type: 'acta',
        description: 'Plantilla para registrar las actas de reuniones',
        fields: {
          fields: [
            {
              name: 'titulo',
              label: 'Título de la reunión',
              type: 'text',
              required: true,
            },
          ],
        },
        isActive: true,
        createdById: 'cmhtlluz80000eba0by5adzbj',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
        createdBy: {
          id: 'cmhtlluz80000eba0by5adzbj',
          name: 'Administrador',
          email: 'admin@example.com',
        },
        _count: {
          documents: 5,
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
  @ApiResponse({
    status: 403,
    description: 'Sin permisos para ver esta plantilla',
    schema: {
      example: {
        statusCode: 403,
        message: 'No tienes permiso para ver esta plantilla',
        error: 'Forbidden',
      },
    },
  })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.documentTemplateService.findOne(id, user.id, user.role);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar una plantilla',
    description:
      'Actualiza los datos de una plantilla existente. Solo el creador o un administrador pueden actualizarla.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la plantilla',
    example: 1,
    type: 'number',
  })
  @ApiBody({
    type: UpdateDocumentTemplateDto,
    description: 'Datos a actualizar (todos los campos son opcionales)',
    examples: {
      'Actualizar nombre y descripción': {
        value: {
          name: 'Acta de Reunión Actualizada',
          description: 'Nueva descripción de la plantilla',
        },
      },
      'Desactivar plantilla': {
        value: {
          isActive: false,
        },
      },
      'Actualizar campos': {
        value: {
          fields: {
            fields: [
              {
                name: 'nuevo_campo',
                label: 'Nuevo Campo',
                type: 'text',
                required: false,
              },
            ],
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Plantilla actualizada',
    schema: {
      example: {
        id: 1,
        name: 'Acta de Reunión Actualizada',
        type: 'acta',
        description: 'Nueva descripción',
        fields: {},
        isActive: true,
        createdById: 'cmhtlluz80000eba0by5adzbj',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T11:30:00.000Z',
        createdBy: {
          id: 'cmhtlluz80000eba0by5adzbj',
          name: 'Administrador',
          email: 'admin@example.com',
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos para actualizar esta plantilla',
    schema: {
      example: {
        statusCode: 403,
        message: 'No tienes permiso para actualizar esta plantilla',
        error: 'Forbidden',
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
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDocumentTemplateDto: UpdateDocumentTemplateDto,
    @CurrentUser() user: any,
  ) {
    return this.documentTemplateService.update(
      id,
      updateDocumentTemplateDto,
      user.id,
      user.role,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar una plantilla',
    description:
      'Elimina una plantilla de forma permanente. Solo el creador o un administrador pueden eliminarla. Los documentos creados con esta plantilla se mantendrán.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la plantilla',
    example: 1,
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Plantilla eliminada',
    schema: {
      example: {
        message: 'Plantilla eliminada exitosamente',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos para eliminar esta plantilla',
    schema: {
      example: {
        statusCode: 403,
        message: 'No tienes permiso para eliminar esta plantilla',
        error: 'Forbidden',
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
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.documentTemplateService.remove(id, user.id, user.role);
  }

  // ============ Plantillas Predefinidas ============

  @Get('predefined')
  @ApiOperation({
    summary: 'Obtener todas las plantillas predefinidas',
    description:
      'Retorna todas las plantillas predefinidas del sistema, opcionalmente filtradas por categoría',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Categoría de plantilla: academic, administrative, legal',
    enum: ['academic', 'administrative', 'legal'],
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de plantillas predefinidas',
    schema: {
      example: [
        {
          id: 1,
          name: 'Certificado de Estudios',
          type: 'certificado',
          category: 'academic',
          description: 'Certificado oficial de estudios realizados',
          usageCount: 45,
          fields: [],
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    },
  })
  getPredefined(@Query('categoryId') categoryId?: string) {
    return this.documentTemplateService.getPredefinedTemplates(
      categoryId !== undefined ? parseInt(categoryId, 10) : undefined,
    );
  }

  @Get('gallery')
  @ApiOperation({
    summary: 'Obtener galería de plantillas organizadas por categoría',
    description:
      'Retorna todas las plantillas predefinidas organizadas por categoría para mostrar en una galería',
  })
  @ApiResponse({
    status: 200,
    description: 'Galería de plantillas por categoría',
    schema: {
      example: {
        categories: ['academic', 'administrative', 'legal'],
        templates: {
          academic: [
            {
              id: 1,
              name: 'Certificado de Estudios',
              type: 'certificado',
              category: 'academic',
              description: 'Certificado oficial de estudios',
              usageCount: 45,
            },
          ],
          administrative: [],
          legal: [],
        },
        total: 12,
      },
    },
  })
  getGallery() {
    return this.documentTemplateService.getGallery();
  }

  @Post(':id/duplicate')
  @ApiOperation({
    summary: 'Duplicar una plantilla existente',
    description:
      'Crea una copia de una plantilla existente con un nuevo nombre',
  })
  @ApiResponse({
    status: 201,
    description: 'Plantilla duplicada exitosamente',
    schema: {
      example: {
        id: 13,
        name: 'Certificado de Estudios (Copia)',
        type: 'certificado',
        category: 'academic',
        isPredefined: false,
        usageCount: 0,
        createdBy: {
          id: 'user-id',
          name: 'Usuario',
          email: 'user@example.com',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Plantilla no encontrada',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Nombre para la plantilla duplicada (opcional)',
          example: 'Mi Certificado Personalizado',
        },
      },
    },
  })
  duplicate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body('name') name?: string,
  ) {
    return this.documentTemplateService.duplicate(id, user.id, name);
  }

  @Get('popular')
  @ApiOperation({
    summary: 'Obtener plantillas más populares',
    description:
      'Retorna las plantillas más utilizadas ordenadas por contador de uso',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Número máximo de plantillas a retornar',
    type: Number,
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de plantillas más populares',
    schema: {
      example: [
        {
          id: 1,
          name: 'Certificado de Estudios',
          type: 'certificado',
          category: 'academic',
          description: 'Certificado oficial',
          usageCount: 145,
          isPredefined: true,
        },
      ],
    },
  })
  getPopular(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.documentTemplateService.getPopular(limit);
  }
}
