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
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SubjectService } from './subject.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { QuerySubjectDto } from './dto/query-subject.dto';
import { AuthGuard } from '../auth/guards/auth.guard';

import { Permissions } from '../auth/decorators/permissions.decorator';


@ApiTags('subjects')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('subjects')
export class SubjectController {
  constructor(private readonly subjectService: SubjectService) {}

  @Post()
  @Permissions('role:admin', 'role:rector', 'role:coordinador')
  @ApiOperation({ summary: 'Crear una nueva materia' })
  @ApiResponse({ status: 201, description: 'Materia creada exitosamente' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una materia con ese código',
  })
  create(@Body() createSubjectDto: CreateSubjectDto) {
    return this.subjectService.create(createSubjectDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas las materias' })
  @ApiResponse({ status: 200, description: 'Lista de materias' })
  findAll(@Query() query: QuerySubjectDto) {
    return this.subjectService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una materia por ID' })
  @ApiResponse({ status: 200, description: 'Materia encontrada' })
  @ApiResponse({ status: 404, description: 'Materia no encontrada' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.subjectService.findOne(id);
  }

  @Patch(':id')
  @Permissions('role:admin', 'role:rector', 'role:coordinador')
  @ApiOperation({ summary: 'Actualizar una materia' })
  @ApiResponse({ status: 200, description: 'Materia actualizada exitosamente' })
  @ApiResponse({ status: 404, description: 'Materia no encontrada' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe otra materia con ese código',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSubjectDto: UpdateSubjectDto,
  ) {
    return this.subjectService.update(id, updateSubjectDto);
  }

  @Delete(':id')
  @Permissions('role:admin', 'role:rector')
  @ApiOperation({ summary: 'Eliminar una materia' })
  @ApiResponse({ status: 200, description: 'Materia eliminada exitosamente' })
  @ApiResponse({ status: 404, description: 'Materia no encontrada' })
  @ApiResponse({
    status: 400,
    description:
      'No se puede eliminar porque tiene profesores o documentos asociados',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.subjectService.remove(id);
  }

  @Post(':id/assign-teacher')
  @Permissions('role:admin', 'role:rector', 'role:coordinador')
  @ApiOperation({ summary: 'Asignar un profesor a la materia' })
  @ApiResponse({ status: 201, description: 'Profesor asignado exitosamente' })
  @ApiResponse({ status: 404, description: 'Materia o usuario no encontrado' })
  @ApiResponse({
    status: 409,
    description: 'El profesor ya está asignado a esta materia',
  })
  assignTeacher(
    @Param('id', ParseIntPipe) id: number,
    @Body('userId') userId: string,
  ) {
    return this.subjectService.assignTeacher(id, userId);
  }

  @Delete(':id/teachers/:userId')
  @Permissions('role:admin', 'role:rector', 'role:coordinador')
  @ApiOperation({ summary: 'Remover un profesor de la materia' })
  @ApiResponse({ status: 200, description: 'Profesor removido exitosamente' })
  @ApiResponse({
    status: 404,
    description: 'El profesor no está asignado a esta materia',
  })
  removeTeacher(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId') userId: string,
  ) {
    return this.subjectService.removeTeacher(id, userId);
  }
}
