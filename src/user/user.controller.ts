import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { DeactivateUserDto } from './dto/deactivate-user.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermission } from '../auth/decorators/permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  //@Public()
  @Get()
  @ApiBearerAuth('JWT-auth')
  @RequireAnyPermission('users.manage', 'roles.manage')
  @ApiOperation({
    summary: 'Listar todos los usuarios (Solo ADMIN)',
    description: 'Obtiene una lista de todos los usuarios registrados',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuarios obtenida exitosamente',
    schema: {
      example: [
        {
          id: 1,
          email: 'admin@example.com',
          name: 'Administrador',
          role: 'admin',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          email: 'user@example.com',
          name: 'Usuario Normal',
          role: 'user',
          createdAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado - Se requiere rol admin',
  })
  async findAll(@Query('status') status?: 'active' | 'inactive' | 'all') {
    return this.userService.findAll(status);
  }

  // Rutas específicas ANTES de rutas con parámetros
  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener mi perfil',
    description: 'Obtiene la información del perfil del usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil obtenido exitosamente',
  })
  async getMyProfile(@CurrentUser() user: any) {
    return this.userService.findById(user.sub);
  }

  // Cualquier usuario autenticado puede actualizar su propio perfil
  @Patch('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Actualizar mi perfil',
    description: 'Actualiza la información del perfil del usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil actualizado exitosamente',
  })
  async updateMyProfile(
    @CurrentUser() user: any,
    @Body() updateUserDto: UpdateMyProfileDto,
  ) {
    return this.userService.update(user.sub, updateUserDto);
  }

  @Get('for-selection')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Listar usuarios para selección (id, name, email)',
    description:
      'Retorna una lista reducida de usuarios para usar en dropdowns y selects',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuarios para selección',
  })
  async findAllForSelection(@CurrentUser() user: any) {
    return this.userService.findAllForSelection(user.sub);
  }

  @Get(':id')
  @ApiBearerAuth('JWT-auth')
  @RequireAnyPermission('users.manage', 'roles.manage')
  @ApiOperation({
    summary: 'Obtener usuario por ID (Solo ADMIN)',
    description: 'Obtiene la información detallada de un usuario específico',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del usuario',
    example: 1,
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario encontrado',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado - Se requiere rol admin',
  })
  async findOne(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Post()
  @ApiBearerAuth('JWT-auth')
  @RequirePermission('users.manage')
  @ApiOperation({
    summary: 'Crear nuevo usuario (Solo ADMIN)',
    description: 'Crea un nuevo usuario en el sistema',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario creado exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado - Se requiere rol admin',
  })
  async create(@CurrentUser() actor: any, @Body() user: CreateUserDto) {
    return this.userService.create(user, actor?.sub);
  }

  @Patch(':id')
  @ApiBearerAuth('JWT-auth')
  @RequirePermission('users.manage')
  @ApiOperation({
    summary: 'Actualizar usuario (Solo ADMIN)',
    description: 'Actualiza la información de un usuario existente',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del usuario a actualizar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario actualizado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado - Se requiere rol admin',
  })
  async update(
    @Param('id') id: string,
    @CurrentUser() actor: any,
    @Body()
    updatedUser: UpdateUserDto,
  ) {
    return this.userService.update(id, updatedUser, actor?.sub);
  }

  @Delete(':id')
  @ApiBearerAuth('JWT-auth')
  @RequirePermission('users.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Desactivar usuario (Solo ADMIN)',
    description: 'Desactiva al usuario sin eliminar su historial. Bloquea su acceso de inmediato.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del usuario a desactivar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario desactivado exitosamente',
    schema: {
      example: {
        message: 'Usuario desactivado exitosamente',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado - Se requiere rol admin',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: any,
    @Body() dto: DeactivateUserDto,
  ) {
    return this.userService.deactivate(id, actor?.sub, dto?.reason);
  }

  @Post(':id/reactivate')
  @ApiBearerAuth('JWT-auth')
  @RequirePermission('users.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reactivar usuario (Solo ADMIN)',
    description: 'Reactiva un usuario desactivado y renueva su autoridad.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del usuario a reactivar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario reactivado exitosamente',
  })
  @ApiResponse({
    status: 409,
    description: 'El usuario ya está activo',
  })
  async reactivate(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.userService.reactivate(id, actor?.sub);
  }

  @Post(':id/anonymize')
  @Roles(UserRole.ADMIN)
  @RequirePermission('users.manage')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Anonimizar usuario (Solo ADMIN)',
    description:
      'Purga los datos personales y credenciales de un usuario desactivado, conservando documentos e historial bajo una identidad genérica. Es irreversible.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del usuario a anonimizar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario anonimizado exitosamente',
  })
  @ApiResponse({
    status: 409,
    description: 'El usuario conserva documentos, transferencias o trabajo activo',
  })
  async anonymize(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.userService.anonymize(id, actor?.sub);
  }
}
