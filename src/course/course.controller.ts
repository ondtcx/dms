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
} from '@nestjs/swagger';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { QueryCourseDto } from './dto/query-course.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Crear nuevo curso' })
  @ApiResponse({ status: 201, description: 'Curso creado exitosamente' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un curso con ese código',
  })
  create(@Body() createCourseDto: CreateCourseDto) {
    return this.courseService.create(createCourseDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los cursos' })
  @ApiResponse({ status: 200, description: 'Lista de cursos con paginación' })
  findAll(@Query() query: QueryCourseDto) {
    return this.courseService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un curso por ID' })
  @ApiResponse({ status: 200, description: 'Curso encontrado' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.courseService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Actualizar un curso' })
  @ApiResponse({ status: 200, description: 'Curso actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe otro curso con ese código',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCourseDto: UpdateCourseDto,
  ) {
    return this.courseService.update(id, updateCourseDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Eliminar un curso' })
  @ApiResponse({ status: 200, description: 'Curso eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  @ApiResponse({
    status: 400,
    description: 'No se puede eliminar porque tiene relaciones',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.courseService.remove(id);
  }

  @Get(':id/subjects')
  @ApiOperation({ summary: 'Listar materias de un curso' })
  @ApiResponse({
    status: 200,
    description: 'Lista de materias activas del curso',
  })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  findSubjects(@Param('id', ParseIntPipe) id: number) {
    return this.courseService.findSubjects(id);
  }

  @Post(':id/assign-teacher')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Asignar un profesor a un curso' })
  @ApiResponse({ status: 201, description: 'Profesor asignado exitosamente' })
  @ApiResponse({
    status: 409,
    description: 'El profesor ya está asignado a este curso',
  })
  assignTeacher(
    @Param('id', ParseIntPipe) courseId: number,
    @Body('userId') userId: string,
  ) {
    return this.courseService.assignTeacher(courseId, userId);
  }

  @Delete(':id/teachers/:userId')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Remover un profesor de un curso' })
  @ApiResponse({
    status: 200,
    description: 'Profesor removido del curso exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'El profesor no está asignado a este curso',
  })
  removeTeacher(
    @Param('id', ParseIntPipe) courseId: number,
    @Param('userId') userId: string,
  ) {
    return this.courseService.removeTeacher(courseId, userId);
  }
}
