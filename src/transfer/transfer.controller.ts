import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TransferService } from './transfer.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateTransferStatusDto } from './dto/update-transfer-status.dto';
import { AuthGuard } from '../auth/guards/auth.guard';

@ApiTags('transfers')
@Controller('transfers')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class TransferController {
  constructor(private readonly transferService: TransferService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear transferencia de documento',
    description: 'Inicia una transferencia de documento a otro usuario',
  })
  @ApiResponse({
    status: 201,
    description: 'Transferencia creada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o transferencia duplicada',
  })
  @ApiResponse({ status: 403, description: 'Sin permiso para transferir' })
  @ApiResponse({
    status: 404,
    description: 'Documento o usuario no encontrado',
  })
  create(@Body() createTransferDto: CreateTransferDto, @Request() req: any) {
    return this.transferService.create(createTransferDto, req.user.id);
  }

  @Get('sent')
  @ApiOperation({
    summary: 'Obtener transferencias enviadas',
    description:
      'Lista las transferencias de documentos iniciadas por el usuario',
  })
  @ApiResponse({ status: 200, description: 'Lista de transferencias enviadas' })
  getSent(@Request() req: any) {
    return this.transferService.getSent(req.user.id);
  }

  @Get('received')
  @ApiOperation({
    summary: 'Obtener transferencias recibidas',
    description:
      'Lista las transferencias de documentos recibidas por el usuario',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de transferencias recibidas',
  })
  getReceived(@Request() req: any) {
    return this.transferService.getReceived(req.user.id);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Obtener estadísticas de transferencias',
    description:
      'Retorna contadores de transferencias enviadas, recibidas y pendientes',
  })
  @ApiResponse({ status: 200, description: 'Estadísticas de transferencias' })
  getStats(@Request() req: any) {
    return this.transferService.getStats(req.user.id);
  }

  @Get('document/:documentId')
  @ApiParam({ name: 'documentId', description: 'ID del documento' })
  @ApiOperation({
    summary: 'Obtener historial de transferencias de un documento',
    description:
      'Lista todas las transferencias realizadas sobre un documento específico',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de transferencias del documento',
  })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  getDocumentTransfers(
    @Param('documentId') documentId: string,
    @Request() req: any,
  ) {
    return this.transferService.getDocumentTransfers(+documentId, req.user.id);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'ID de la transferencia' })
  @ApiOperation({
    summary: 'Obtener detalle de una transferencia',
    description:
      'Retorna la información completa de una transferencia específica',
  })
  @ApiResponse({ status: 200, description: 'Detalle de la transferencia' })
  @ApiResponse({
    status: 403,
    description: 'Sin permiso para ver esta transferencia',
  })
  @ApiResponse({ status: 404, description: 'Transferencia no encontrada' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.transferService.findOne(+id, req.user.id);
  }

  @Patch(':id/complete')
  @ApiParam({ name: 'id', description: 'ID de la transferencia' })
  @ApiOperation({
    summary: 'Aceptar una transferencia',
    description:
      'El destinatario acepta la transferencia y se cambia la propiedad del documento',
  })
  @ApiResponse({
    status: 200,
    description: 'Transferencia completada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'La transferencia no está en estado pendiente',
  })
  @ApiResponse({
    status: 403,
    description: 'Solo el destinatario puede aceptar',
  })
  @ApiResponse({ status: 404, description: 'Transferencia no encontrada' })
  complete(@Param('id') id: string, @Request() req: any) {
    return this.transferService.complete(+id, req.user.id);
  }

  @Patch(':id/cancel')
  @ApiParam({ name: 'id', description: 'ID de la transferencia' })
  @ApiOperation({
    summary: 'Cancelar una transferencia',
    description:
      'Cancela una transferencia pendiente (remitente o destinatario)',
  })
  @ApiResponse({
    status: 200,
    description: 'Transferencia cancelada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'La transferencia no está en estado pendiente',
  })
  @ApiResponse({ status: 403, description: 'Sin permiso para cancelar' })
  @ApiResponse({ status: 404, description: 'Transferencia no encontrada' })
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.transferService.cancel(+id, req.user.id);
  }
}
