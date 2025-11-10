import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
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
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  //@Public()
  @Get()
  @Roles(UserRole.ADMIN)
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
  async findAll() {
    return this.userService.findAll();
  }

  // Rutas específicas ANTES de rutas con parámetros
  @Get('me')
  getMyProfile(@CurrentUser() user: any) {
    return this.userService.findById(user.sub);
  }

  // Cualquier usuario autenticado puede actualizar su propio perfil
  @Patch('me')
  updateMyProfile(
    @CurrentUser() user: any,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.update(user.sub, updateUserDto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
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
  @Roles(UserRole.ADMIN)
  async create(@Body() user: CreateUserDto) {
    return this.userService.create(user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
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
    @Body()
    updatedUser: UpdateUserDto,
  ) {
    return this.userService.update(id, updatedUser);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar usuario (Solo ADMIN)',
    description: 'Elimina permanentemente un usuario del sistema',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del usuario a eliminar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario eliminado exitosamente',
    schema: {
      example: {
        message: 'Usuario eliminado exitosamente',
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
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
