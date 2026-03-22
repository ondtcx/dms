import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BatchService } from './batch.service';
import { BatchUpdateDto } from './dto/batch-update.dto';
import { BatchDeleteDto } from './dto/batch-delete.dto';
import { BatchShareDto } from './dto/batch-share.dto';
import { BatchExportDto } from './dto/batch-export.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Response } from 'express';

@ApiTags('batch')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('batch')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Patch('update')
  @ApiOperation({
    summary: 'Actualización masiva de documentos',
    description: 'Actualiza múltiples documentos a la vez (categoría, sección, curso, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Documentos actualizados exitosamente',
    schema: {
      example: {
        success: true,
        updated: 5,
        documentIds: [1, 2, 3, 4, 5],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Algunos documentos no encontrados' })
  @ApiResponse({ status: 403, description: 'Sin permiso para editar algunos documentos' })
  batchUpdate(@Body() batchUpdateDto: BatchUpdateDto, @Request() req: any) {
    return this.batchService.batchUpdate(batchUpdateDto, req.user.id);
  }

  @Delete('delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminación masiva de documentos',
    description: 'Elimina múltiples documentos a la vez (soft delete o permanente)',
  })
  @ApiResponse({
    status: 200,
    description: 'Documentos eliminados exitosamente',
    schema: {
      example: {
        success: true,
        deleted: 5,
        permanent: false,
        documentIds: [1, 2, 3, 4, 5],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Algunos documentos no encontrados' })
  @ApiResponse({ status: 403, description: 'Sin permiso para eliminar algunos documentos' })
  batchDelete(@Body() batchDeleteDto: BatchDeleteDto, @Request() req: any) {
    return this.batchService.batchDelete(batchDeleteDto, req.user.id);
  }

  @Post('share')
  @ApiOperation({
    summary: 'Compartir documentos en lote',
    description: 'Crea shares para múltiples documentos a la vez',
  })
  @ApiResponse({
    status: 201,
    description: 'Documentos compartidos exitosamente',
    schema: {
      example: {
        success: true,
        shared: 5,
        documentIds: [1, 2, 3, 4, 5],
        shares: [
          {
            id: 1,
            documentId: 1,
            shareToken: 'uuid-token',
            canView: true,
            canDownload: true,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Algunos documentos no encontrados' })
  batchShare(@Body() batchShareDto: BatchShareDto, @Request() req: any) {
    return this.batchService.batchShare(batchShareDto, req.user.id);
  }

  @Post('export')
  @ApiOperation({
    summary: 'Exportar documentos a ZIP',
    description: 'Descarga múltiples documentos como un archivo ZIP',
  })
  @ApiResponse({
    status: 200,
    description: 'Archivo ZIP generado exitosamente',
    content: {
      'application/zip': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'No se encontraron documentos' })
  @ApiResponse({ status: 403, description: 'Sin permiso para ver algunos documentos' })
  async batchExport(
    @Body() batchExportDto: BatchExportDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    return this.batchService.batchExport(batchExportDto, req.user.id, res);
  }

  @Patch('restore')
  @ApiOperation({
    summary: 'Restaurar documentos eliminados en lote',
    description: 'Restaura múltiples documentos eliminados (soft delete)',
  })
  @ApiResponse({
    status: 200,
    description: 'Documentos restaurados exitosamente',
    schema: {
      example: {
        success: true,
        restored: 5,
        documentIds: [1, 2, 3, 4, 5],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'No se encontraron documentos eliminados' })
  @ApiResponse({ status: 403, description: 'Sin permiso para restaurar algunos documentos' })
  batchRestore(@Body() body: { documentIds: number[] }, @Request() req: any) {
    return this.batchService.batchRestore(body.documentIds, req.user.id);
  }

  // ============ Gestión de lotes de documentos ============

  @Get('document-batches')
  @ApiOperation({ summary: 'Listar lotes de documentos' })
  @ApiResponse({ status: 200, description: 'Lista de lotes paginada' })
  listBatches(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.batchService.listBatches(user.id, user.role, page, limit);
  }

  @Get('document-batches/:id')
  @ApiOperation({ summary: 'Obtener detalle de un lote' })
  @ApiResponse({ status: 200, description: 'Detalle del lote con documentos' })
  @ApiResponse({ status: 404, description: 'Lote no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permiso para ver este lote' })
  getBatch(@Param('id') id: string, @CurrentUser() user: any) {
    return this.batchService.getBatch(id, user.id, user.role);
  }

  @Delete('document-batches/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar un lote (soft-delete de documentos)' })
  @ApiResponse({ status: 200, description: 'Lote eliminado' })
  @ApiResponse({ status: 404, description: 'Lote no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permiso para eliminar este lote' })
  deleteBatch(@Param('id') id: string, @CurrentUser() user: any) {
    return this.batchService.deleteBatch(id, user.id, user.role);
  }

  @Post('document-batches/:id/export')
  @ApiOperation({ summary: 'Descargar todos los documentos de un lote como ZIP' })
  @ApiResponse({ status: 200, description: 'ZIP generado exitosamente', content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 404, description: 'Lote no encontrado' })
  exportBatch(@Param('id') id: string, @CurrentUser() user: any, @Res() res: Response) {
    return this.batchService.exportBatch(id, user.id, user.role, res);
  }
}
