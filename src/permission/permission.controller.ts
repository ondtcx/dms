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
import { GrantDocumentPermissionDto } from './dto/grant-document-permission.dto';
import { ExplainPermissionDto } from './dto/explain-permission.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';
import { RequirePermission } from '../auth/decorators/permission.decorator';

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get('catalog')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Listar permisos activos del catálogo' })
  getCatalog() {
    return this.permissionService.getCatalog();
  }

  // ============ Permisos de Documentos ============

  @Post('documents/:id/grant')
  @Roles(UserRole.ADMIN, UserRole.RECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Otorgar permisos específicos sobre un documento' })
  @ApiResponse({ status: 201, description: 'Permiso otorgado exitosamente' })
  @ApiResponse({
    status: 404,
    description: 'Documento o usuario no encontrado',
  })
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

  @Post('documents/:id/share')
  @Roles(UserRole.ADMIN, UserRole.RECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Compartir un documento preservando roles legacy y catalogados' })
  createDocumentShare(
    @Param('id', ParseIntPipe) documentId: number,
    @Request() req,
    @Body() shareDto: Record<string, unknown>,
  ) {
    return this.permissionService.createDocumentShare(documentId, req.user.id, shareDto);
  }

  @Delete('documents/permissions/:id')
  @Roles(UserRole.ADMIN, UserRole.RECTOR, UserRole.COORDINADOR)
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

  @Post('explain')
  @Roles(UserRole.ADMIN, UserRole.RECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Explicar por qué un usuario tiene (o no) acceso a un documento' })
  @ApiResponse({ status: 200, description: 'Análisis detallado de permisos del usuario sobre el documento' })
  @ApiResponse({ status: 404, description: 'Documento o usuario no encontrado' })
  explainPermission(@Body() explainDto: ExplainPermissionDto) {
    return this.permissionService.explainPermission(explainDto);
  }
}
