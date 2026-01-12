import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PermissionService } from './permission.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto';
import { GrantDocumentPermissionDto } from './dto/grant-document-permission.dto';
import { CheckPermissionDto } from './dto/check-permission.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  // ============ Gestión de Permisos ============

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear un nuevo permiso (solo admin)' })
  @ApiResponse({ status: 201, description: 'Permiso creado exitosamente' })
  @ApiResponse({ status: 409, description: 'Ya existe un permiso con ese nombre' })
  create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionService.createPermission(createPermissionDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Listar todos los permisos' })
  @ApiResponse({ status: 200, description: 'Lista de permisos' })
  findAll() {
    return this.permissionService.findAllPermissions();
  }

  @Get('roles/:role')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Obtener permisos de un rol específico' })
  @ApiResponse({ status: 200, description: 'Lista de permisos del rol' })
  findByRole(@Param('role') role: UserRole) {
    return this.permissionService.findPermissionsByRole(role);
  }

  // ============ Asignación de Permisos a Roles ============

  @Post('assign')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Asignar permiso a un rol (solo admin)' })
  @ApiResponse({ status: 201, description: 'Permiso asignado exitosamente' })
  @ApiResponse({ status: 409, description: 'El permiso ya está asignado al rol' })
  assignToRole(@Body() assignPermissionDto: AssignPermissionDto) {
    return this.permissionService.assignPermissionToRole(assignPermissionDto);
  }

  @Delete('roles/:role/permissions/:permissionId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Remover permiso de un rol (solo admin)' })
  @ApiResponse({ status: 200, description: 'Permiso removido exitosamente' })
  @ApiResponse({ status: 404, description: 'El permiso no está asignado al rol' })
  removeFromRole(
    @Param('role') role: UserRole,
    @Param('permissionId', ParseIntPipe) permissionId: number,
  ) {
    return this.permissionService.removePermissionFromRole(role, permissionId);
  }

  // ============ Permisos de Documentos ============

  @Post('documents/:id/grant')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Otorgar permisos específicos sobre un documento' })
  @ApiResponse({ status: 201, description: 'Permiso otorgado exitosamente' })
  @ApiResponse({ status: 404, description: 'Documento o usuario no encontrado' })
  grantDocumentPermission(
    @Param('id', ParseIntPipe) documentId: number,
    @Request() req,
    @Body() grantDto: GrantDocumentPermissionDto,
  ) {
    return this.permissionService.grantDocumentPermission(
      documentId,
      req.user.id,
      grantDto,
    );
  }

  @Delete('documents/permissions/:id')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Revocar permiso específico de documento' })
  @ApiResponse({ status: 200, description: 'Permiso revocado exitosamente' })
  @ApiResponse({ status: 404, description: 'Permiso no encontrado' })
  revokeDocumentPermission(@Param('id', ParseIntPipe) permissionId: number) {
    return this.permissionService.revokeDocumentPermission(permissionId);
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Obtener todos los permisos de un documento' })
  @ApiResponse({ status: 200, description: 'Lista de permisos del documento' })
  getDocumentPermissions(@Param('id', ParseIntPipe) documentId: number) {
    return this.permissionService.getDocumentPermissions(documentId);
  }

  // ============ Verificación de Permisos ============

  @Post('check')
  @ApiOperation({ summary: 'Verificar si el usuario actual tiene un permiso' })
  @ApiResponse({ status: 200, description: 'Resultado de la verificación' })
  async checkPermission(@Request() req, @Body() checkDto: CheckPermissionDto) {
    const hasPermission = await this.permissionService.checkUserHasPermission(
      req.user.id,
      checkDto.permissionName,
    );

    return {
      hasPermission,
      permissionName: checkDto.permissionName,
      userId: req.user.id,
    };
  }
}
