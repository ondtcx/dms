import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';
import { CreateTransferDto } from './dto/create-transfer.dto';
import {
  CreateBulkAdminTransferDto,
  CreateBulkTransferDto,
} from './dto/create-bulk-transfer.dto';
import { TransferService } from './transfer.service';

@ApiTags('transfers')
@Controller('transfers')
@ApiBearerAuth('JWT-auth')
export class TransferController {
  constructor(private readonly transferService: TransferService) {}

  @Post()
  @ApiOperation({
    summary: 'Solicitar la transferencia de un documento propio',
    description:
      'Crea una solicitud pendiente que el destinatario debe aceptar.',
  })
  @ApiResponse({ status: 201, description: 'Solicitud creada' })
  @ApiResponse({ status: 403, description: 'El actor no es el propietario' })
  @ApiResponse({ status: 409, description: 'Documento no transferible' })
  create(@Body() dto: CreateTransferDto, @CurrentUser() user: any) {
    return this.transferService.create(dto, user.id);
  }

  @Post('bulk')
  @ApiOperation({
    summary: 'Solicitar la transferencia de varios documentos propios',
  })
  createBulk(
    @Body() dto: CreateBulkTransferDto,
    @CurrentUser() user: any,
  ) {
    return this.transferService.createBulk(dto, user.id);
  }

  @Post('bulk/admin')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Transferir todos los documentos de un propietario',
    description:
      'Permite a un administrador incluir todos los documentos del propietario o un subconjunto explícito.',
  })
  createBulkForOwner(
    @Body() dto: CreateBulkAdminTransferDto,
    @CurrentUser() user: any,
  ) {
    return this.transferService.createBulkForOwner(dto, user.id);
  }

  @Post('admin')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Solicitar una transferencia en nombre del propietario',
    description:
      'Permite a un administrador iniciar la transferencia de un documento, incluso si el propietario está desactivado.',
  })
  @ApiResponse({ status: 201, description: 'Solicitud creada' })
  createForOwner(@Body() dto: CreateTransferDto, @CurrentUser() user: any) {
    return this.transferService.createForOwner(dto, user.id);
  }

  @Get('sent')
  @ApiOperation({ summary: 'Transferencias enviadas o iniciadas' })
  getSent(@CurrentUser() user: any) {
    return this.transferService.getSent(user.id);
  }

  @Get('received')
  @ApiOperation({ summary: 'Transferencias recibidas' })
  getReceived(@CurrentUser() user: any) {
    return this.transferService.getReceived(user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Contadores de transferencias' })
  getStats(@CurrentUser() user: any) {
    return this.transferService.getStats(user.id);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'ID de la transferencia' })
  @ApiOperation({ summary: 'Detalle de una transferencia' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.transferService.findOne(id, user.id);
  }

  @Patch(':id/accept')
  @ApiParam({ name: 'id', description: 'ID de la transferencia' })
  @ApiOperation({
    summary: 'Aceptar una transferencia pendiente',
    description:
      'Solo el destinatario puede aceptar. Cambia la propiedad del documento.',
  })
  accept(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.transferService.accept(id, user.id);
  }

  @Patch(':id/cancel')
  @ApiParam({ name: 'id', description: 'ID de la transferencia' })
  @ApiOperation({
    summary: 'Cancelar o rechazar una transferencia pendiente',
  })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.transferService.cancel(id, user.id);
  }

  @Patch('batch/:batchId/accept')
  @ApiParam({ name: 'batchId', description: 'ID del lote' })
  @ApiOperation({
    summary: 'Aceptar todas las transferencias pendientes de un lote',
  })
  acceptBatch(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @CurrentUser() user: any,
  ) {
    return this.transferService.acceptBatch(batchId, user.id);
  }

  @Patch('batch/:batchId/cancel')
  @ApiParam({ name: 'batchId', description: 'ID del lote' })
  @ApiOperation({
    summary: 'Cancelar o rechazar un lote pendiente',
  })
  cancelBatch(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @CurrentUser() user: any,
  ) {
    return this.transferService.cancelBatch(batchId, user.id);
  }
}
