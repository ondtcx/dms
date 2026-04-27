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
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { QueryDepartmentDto } from './dto/query-department.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';


@ApiTags('departments')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Post()
  @Permissions('role:admin', 'role:rector')
  @ApiOperation({ summary: 'Crear nuevo departamento' })
  @ApiResponse({ status: 201, description: 'Departamento creado exitosamente' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un departamento con ese nombre o código',
  })
  create(@Body() createDepartmentDto: CreateDepartmentDto) {
    return this.departmentService.create(createDepartmentDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los departamentos' })
  @ApiResponse({
    status: 200,
    description: 'Lista de departamentos con paginación',
  })
  findAll(@Query() query: QueryDepartmentDto) {
    return this.departmentService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de departamentos' })
  @ApiResponse({ status: 200, description: 'Estadísticas de departamentos' })
  getStats() {
    return this.departmentService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un departamento por ID' })
  @ApiResponse({ status: 200, description: 'Departamento encontrado' })
  @ApiResponse({ status: 404, description: 'Departamento no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.departmentService.findOne(id);
  }

  @Patch(':id')
  @Permissions('role:admin', 'role:rector')
  @ApiOperation({ summary: 'Actualizar un departamento' })
  @ApiResponse({
    status: 200,
    description: 'Departamento actualizado exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Departamento no encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe otro departamento con ese nombre o código',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDepartmentDto: UpdateDepartmentDto,
  ) {
    return this.departmentService.update(id, updateDepartmentDto);
  }

  @Delete(':id')
  @Permissions('role:admin', 'role:rector')
  @ApiOperation({ summary: 'Eliminar un departamento' })
  @ApiResponse({
    status: 200,
    description: 'Departamento eliminado exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Departamento no encontrado' })
  @ApiResponse({
    status: 400,
    description: 'No se puede eliminar porque tiene relaciones',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.departmentService.remove(id);
  }

  @Get(':id/users')
  @ApiOperation({ summary: 'Obtener usuarios de un departamento' })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuarios del departamento',
  })
  @ApiResponse({ status: 404, description: 'Departamento no encontrado' })
  getUsers(@Param('id', ParseIntPipe) id: number) {
    return this.departmentService.getUsers(id);
  }

  @Post(':id/users')
  @Permissions('role:admin', 'role:rector')
  @ApiOperation({ summary: 'Asignar un usuario a un departamento' })
  @ApiResponse({ status: 200, description: 'Usuario asignado exitosamente' })
  @ApiResponse({
    status: 404,
    description: 'Departamento o usuario no encontrado',
  })
  assignUser(
    @Param('id', ParseIntPipe) id: number,
    @Body('userId') userId: string,
  ) {
    return this.departmentService.assignUser(id, userId);
  }

  @Delete(':id/users/:userId')
  @Permissions('role:admin', 'role:rector')
  @ApiOperation({ summary: 'Remover un usuario de un departamento' })
  @ApiResponse({ status: 200, description: 'Usuario removido exitosamente' })
  @ApiResponse({
    status: 404,
    description: 'Departamento o usuario no encontrado',
  })
  removeUser(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId') userId: string,
  ) {
    return this.departmentService.removeUser(id, userId);
  }
}
