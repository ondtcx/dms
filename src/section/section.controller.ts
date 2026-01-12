import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SectionService } from './section.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { QuerySectionDto } from './dto/query-section.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';

@ApiTags('sections')
@Controller('sections')
@ApiBearerAuth('JWT-auth')
export class SectionController {
  constructor(private readonly sectionService: SectionService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Crear una nueva sección',
    description:
      'Crea una nueva sección para organizar documentos. Solo administradores.',
  })
  @ApiResponse({
    status: 201,
    description: 'Sección creada exitosamente',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una sección con ese nombre',
  })
  create(@Body() createSectionDto: CreateSectionDto) {
    return this.sectionService.create(createSectionDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar secciones',
    description: 'Obtiene todas las secciones con filtros opcionales',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de secciones',
  })
  findAll(@Query() query: QuerySectionDto) {
    return this.sectionService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Obtener estadísticas de secciones',
    description:
      'Obtiene un resumen de todas las secciones activas con conteo de documentos',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas de secciones',
  })
  getStats() {
    return this.sectionService.getStats();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener una sección por ID',
    description: 'Retorna los detalles de una sección específica',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la sección',
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Sección encontrada',
  })
  @ApiResponse({
    status: 404,
    description: 'Sección no encontrada',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.sectionService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Actualizar una sección',
    description:
      'Actualiza los datos de una sección existente. Solo administradores.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la sección',
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Sección actualizada',
  })
  @ApiResponse({
    status: 404,
    description: 'Sección no encontrada',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSectionDto: UpdateSectionDto,
  ) {
    return this.sectionService.update(id, updateSectionDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Eliminar una sección',
    description:
      'Elimina una sección. No se puede eliminar si tiene documentos asociados. Solo administradores.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la sección',
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Sección eliminada',
  })
  @ApiResponse({
    status: 404,
    description: 'Sección no encontrada',
  })
  @ApiResponse({
    status: 409,
    description: 'La sección tiene documentos asociados',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.sectionService.remove(id);
  }
}
