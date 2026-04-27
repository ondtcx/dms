import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';


@ApiTags('categories')
@Controller('categories')
@ApiBearerAuth('JWT-auth')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @Permissions('role:admin')
  @ApiOperation({
    summary: 'Crear nueva categoría (Solo ADMIN)',
    description:
      'Crea una nueva categoría para clasificar documentos. El nombre debe ser único.',
  })
  @ApiResponse({
    status: 201,
    description: 'Categoría creada exitosamente',
    schema: {
      example: {
        id: 1,
        name: 'Legales',
        description: 'Documentos relacionados con asuntos legales',
        color: '#3b82f6',
        icon: 'Scale',
        isActive: true,
        createdAt: '2024-01-25T10:00:00.000Z',
        updatedAt: '2024-01-25T10:00:00.000Z',
        _count: {
          documents: 0,
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una categoría con ese nombre',
    schema: {
      example: {
        statusCode: 409,
        message: 'Ya existe una categoría con el nombre "Legales"',
        error: 'Conflict',
      },
    },
  })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(createCategoryDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar todas las categorías',
    description:
      'Obtiene todas las categorías con el conteo de documentos asociados',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de categorías',
    schema: {
      example: [
        {
          id: 1,
          name: 'Legales',
          description: 'Documentos legales',
          color: '#3b82f6',
          icon: 'Scale',
          isActive: true,
          createdAt: '2024-01-25T10:00:00.000Z',
          updatedAt: '2024-01-25T10:00:00.000Z',
          _count: {
            documents: 15,
          },
        },
      ],
    },
  })
  findAll() {
    return this.categoryService.findAll();
  }

  @Get('active')
  @ApiOperation({
    summary: 'Listar categorías activas',
    description: 'Obtiene solo las categorías activas para usar en formularios',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de categorías activas',
  })
  findAllActive() {
    return this.categoryService.findAllActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener información de una categoría' })
  @ApiParam({ name: 'id', description: 'ID de la categoría' })
  @ApiResponse({ status: 200, description: 'Información de la categoría' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoryService.findOne(id);
  }

  @Patch(':id')
  @Permissions('role:admin')
  @ApiOperation({
    summary: 'Actualizar categoría (Solo ADMIN)',
    description: 'Actualiza los datos de una categoría existente',
  })
  @ApiParam({ name: 'id', description: 'ID de la categoría' })
  @ApiResponse({ status: 200, description: 'Categoría actualizada' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una categoría con ese nombre',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @Permissions('role:admin')
  @ApiOperation({
    summary: 'Eliminar categoría (Solo ADMIN)',
    description:
      'Elimina una categoría. No se puede eliminar si tiene documentos asociados.',
  })
  @ApiParam({ name: 'id', description: 'ID de la categoría' })
  @ApiResponse({ status: 200, description: 'Categoría eliminada' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  @ApiResponse({
    status: 400,
    description: 'No se puede eliminar porque tiene documentos asociados',
    schema: {
      example: {
        statusCode: 400,
        message:
          'No se puede eliminar la categoría porque tiene 15 documento(s) asociado(s)',
        error: 'Bad Request',
      },
    },
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoryService.remove(id);
  }
}
