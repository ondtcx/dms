import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleService } from './role.service';

@ApiTags('role')
@Controller('role')
@ApiBearerAuth('JWT-auth')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @Permissions('roles:read')
  @ApiOperation({
    summary: 'Listar roles dinámicos',
    description:
      'Obtiene los roles disponibles junto con sus permisos asociados.',
  })
  @ApiResponse({
    status: 200,
    description: 'Roles obtenidos exitosamente',
  })
  findAll() {
    return this.roleService.findAllRoles();
  }

  @Post()
  @Permissions('roles:write')
  @ApiOperation({
    summary: 'Crear rol dinámico',
    description: 'Crea un nuevo rol y le asigna permisos existentes.',
  })
  @ApiResponse({
    status: 201,
    description: 'Rol creado exitosamente',
  })
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.roleService.createRole(createRoleDto);
  }
}
