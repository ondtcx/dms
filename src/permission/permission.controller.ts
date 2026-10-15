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
  Patch,
  Query,
  ValidationPipe,
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
import { ManageDocumentSharingDto, DocumentVisibilityDto, LegacyDocumentShareDto } from './dto/manage-document-sharing.dto';
import { SearchSharingRecipientsDto } from './dto/search-sharing-recipients.dto';

const sharingValidation = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

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

  @Get('documents/:id/sharing')
  getSharing(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.permissionService.getSharing(id, req.user.id);
  }

  @Get('documents/:id/sharing/recipients')
  searchRecipients(@Param('id', ParseIntPipe) id: number, @Request() req, @Query(sharingValidation) query: SearchSharingRecipientsDto) {
    return this.permissionService.searchRecipients(id, req.user.id, query);
  }

  @Post('documents/:id/sharing')
  grantRead(@Param('id', ParseIntPipe) id: number, @Request() req, @Body(sharingValidation) dto: ManageDocumentSharingDto) {
    return this.permissionService.grantRead(id, req.user.id, dto);
  }

  @Delete('documents/:id/sharing/recipients/:userId')
  revokeRead(@Param('id', ParseIntPipe) id: number, @Param('userId') userId: string, @Request() req) {
    return this.permissionService.revokeRead(id, req.user.id, userId);
  }

  @Patch('documents/:id/sharing/visibility')
  setVisibility(@Param('id', ParseIntPipe) id: number, @Request() req, @Body(sharingValidation) dto: DocumentVisibilityDto) {
    return this.permissionService.setVisibility(id, req.user.id, dto);
  }

  @Delete('documents/:id/sharing/grants/:grantId')
  revokeSharingGrant(@Param('id', ParseIntPipe) id: number, @Param('grantId', ParseIntPipe) grantId: number, @Request() req) {
    return this.permissionService.revokeSharingGrant(id, grantId, req.user.id);
  }

  // ============ Permisos de Documentos ============

  @Post('documents/:id/grant')
  @ApiOperation({ summary: 'Otorgar permisos específicos sobre un documento' })
  @ApiResponse({ status: 201, description: 'Permiso otorgado exitosamente' })
  @ApiResponse({
    status: 404,
    description: 'Documento o usuario no encontrado',
  })
  grantDocumentPermission(
    @Param('id', ParseIntPipe) documentId: number,
    @Request() req,
    @Body(sharingValidation) grantDto: GrantDocumentPermissionDto,
  ) {
    return this.permissionService.grantDocumentPermission(
      documentId,
      req.user.id,
      grantDto,
    );
  }

  @Post('documents/:id/share')
  @ApiOperation({ summary: 'Compartir un documento con un usuario específico' })
  createDocumentShare(
    @Param('id', ParseIntPipe) documentId: number,
    @Request() req,
    @Body(sharingValidation) shareDto: LegacyDocumentShareDto,
  ) {
    return this.permissionService.createDocumentShare(documentId, req.user.id, shareDto);
  }

  @Delete('documents/permissions/:id')
  @ApiOperation({ summary: 'Revocar permiso específico de documento' })
  @ApiResponse({ status: 200, description: 'Permiso revocado exitosamente' })
  @ApiResponse({ status: 404, description: 'Permiso no encontrado' })
  revokeDocumentPermission(@Param('id', ParseIntPipe) permissionId: number, @Request() req) {
    return this.permissionService.revokeDocumentPermission(permissionId, req.user.id);
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Obtener todos los permisos de un documento' })
  @ApiResponse({ status: 200, description: 'Lista de permisos del documento' })
  getDocumentPermissions(@Param('id', ParseIntPipe) documentId: number, @Request() req) {
    return this.permissionService.getDocumentPermissions(documentId, req.user.id);
  }

  @Post('explain')
  @Roles(UserRole.ADMIN, UserRole.RECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Explicar por qué un usuario tiene (o no) acceso a un documento' })
  @ApiResponse({ status: 200, description: 'Análisis detallado de permisos del usuario sobre el documento' })
  @ApiResponse({ status: 404, description: 'Documento o usuario no encontrado' })
  explainPermission(@Body() explainDto: ExplainPermissionDto, @Request() req) {
    return this.permissionService.explainPermission(explainDto, req.user.id);
  }

  @Get('documents/:id/effective-access')
  @Roles(UserRole.ADMIN, UserRole.RECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Listar usuarios con acceso efectivo al documento' })
  getEffectiveAccess(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Query('cursor') cursor?: string,
  ) {
    return this.permissionService.getEffectiveAccess(id, req.user.id, cursor);
  }
}
