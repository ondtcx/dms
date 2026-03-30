import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Ip,
  Headers,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ShareService } from './share.service';
import { CreateShareDto } from './dto/create-share.dto';
import { AccessShareDto } from './dto/access-share.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('shares')
@Controller('shares')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Crear un nuevo share de documento',
    description:
      'Comparte un documento con usuarios, roles, departamentos o cursos específicos',
  })
  @ApiResponse({
    status: 201,
    description: 'Share creado exitosamente',
    schema: {
      example: {
        id: 1,
        documentId: 123,
        userId: 'user-id',
        shareToken: 'uuid-token',
        canView: true,
        canDownload: true,
        expiresAt: '2024-12-31T23:59:59.000Z',
        document: {
          id: 123,
          filename: 'documento.pdf',
        },
        sharedBy: {
          id: 'user-id',
          name: 'Juan Pérez',
          email: 'juan@example.com',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permiso para compartir' })
  create(@Body() createShareDto: CreateShareDto, @Request() req: any) {
    return this.shareService.create(createShareDto, req.user.id);
  }

  @Get('received')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener shares recibidos',
    description: 'Lista de documentos compartidos conmigo',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de shares recibidos',
  })
  getReceived(@Request() req: any) {
    return this.shareService.getReceivedShares(req.user.id);
  }

  @Get('sent')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener shares enviados',
    description: 'Lista de documentos que he compartido',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de shares enviados',
  })
  getSent(@Request() req: any) {
    return this.shareService.getSentShares(req.user.id);
  }

  @Get('document/:documentId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'documentId', description: 'ID del documento' })
  @ApiOperation({
    summary: 'Obtener shares de un documento',
    description: 'Lista todos los shares de un documento específico',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de shares del documento',
  })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permiso para ver shares' })
  getDocumentShares(
    @Param('documentId') documentId: string,
    @Request() req: any,
  ) {
    return this.shareService.getDocumentShares(+documentId, req.user.id);
  }

  @Post('token/:shareToken')
  @Public()
  @ApiParam({ name: 'shareToken', description: 'Token del share' })
  @ApiOperation({
    summary: 'Acceder a un share por token',
    description:
      'Permite acceder a un documento compartido usando el token público (no requiere autenticación)',
  })
  @ApiResponse({
    status: 200,
    description: 'Acceso al share exitoso',
  })
  @ApiResponse({ status: 404, description: 'Share no encontrado' })
  @ApiResponse({
    status: 403,
    description: 'Share revocado, expirado o sin acceso',
  })
  @ApiResponse({ status: 400, description: 'Se requiere contraseña' })
  accessByToken(
    @Param('shareToken') shareToken: string,
    @Body() accessDto: AccessShareDto,
    @Request() req: any,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const userId = req.user?.id;
    return this.shareService.accessByToken(
      shareToken,
      accessDto,
      userId,
      ipAddress,
      userAgent,
    );
  }

  @Patch(':id/revoke')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'id', description: 'ID del share' })
  @ApiOperation({
    summary: 'Revocar un share',
    description: 'Revoca un share existente (no se puede acceder más)',
  })
  @ApiResponse({
    status: 200,
    description: 'Share revocado exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Share no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permiso para revocar' })
  revoke(@Param('id') id: string, @Request() req: any) {
    return this.shareService.revoke(+id, req.user.id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'id', description: 'ID del share' })
  @ApiOperation({
    summary: 'Eliminar un share',
    description: 'Elimina permanentemente un share',
  })
  @ApiResponse({
    status: 200,
    description: 'Share eliminado exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Share no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permiso para eliminar' })
  delete(@Param('id') id: string, @Request() req: any) {
    return this.shareService.delete(+id, req.user.id);
  }
}
