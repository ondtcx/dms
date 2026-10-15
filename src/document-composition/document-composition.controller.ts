import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DocumentCompositionService } from './document-composition.service';
import { PdfMergeService } from './pdf-merge.service';
import { AddComponentDto } from './dto/add-component.dto';
import { ReorderComponentsDto } from './dto/reorder-components.dto';
import { UpdateComponentDto } from './dto/update-component.dto';

// Todas las rutas propagan el actor autenticado; el servicio revalida su
// identidad vigente en la base de datos y no confía en el rol del token.
type CompositionActor = { id: string };

@ApiTags('document-composition')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard)
@Controller('documents/:id/composition')
export class DocumentCompositionController {
  constructor(
    private readonly compositionService: DocumentCompositionService,
    private readonly pdfMergeService: PdfMergeService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Obtener la composición de un documento (componentes + parte de)',
  })
  getComposition(
    @Param('id', ParseIntPipe) parentId: number,
    @CurrentUser() user: CompositionActor,
  ) {
    return this.compositionService.getComposition(parentId, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Agregar un documento como componente' })
  addComponent(
    @Param('id', ParseIntPipe) parentId: number,
    @Body() dto: AddComponentDto,
    @CurrentUser() user: CompositionActor,
  ) {
    return this.compositionService.addComponent(parentId, dto, user.id);
  }

  @Delete(':childId')
  @ApiOperation({ summary: 'Quitar un documento componente' })
  removeComponent(
    @Param('id', ParseIntPipe) parentId: number,
    @Param('childId', ParseIntPipe) childId: number,
    @CurrentUser() user: CompositionActor,
  ) {
    return this.compositionService.removeComponent(parentId, childId, user.id);
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reordenar los componentes del documento' })
  reorder(
    @Param('id', ParseIntPipe) parentId: number,
    @Body() dto: ReorderComponentsDto,
    @CurrentUser() user: CompositionActor,
  ) {
    return this.compositionService.reorder(parentId, dto, user.id);
  }

  @Patch(':childId')
  @ApiOperation({ summary: 'Actualizar etiqueta o posición de un componente' })
  updateComponent(
    @Param('id', ParseIntPipe) parentId: number,
    @Param('childId', ParseIntPipe) childId: number,
    @Body() dto: UpdateComponentDto,
    @CurrentUser() user: CompositionActor,
  ) {
    return this.compositionService.updateComponent(
      parentId,
      childId,
      dto,
      user.id,
    );
  }

  @Get('download')
  @ApiOperation({
    summary: 'Descargar el PDF mergeado del documento compuesto',
  })
  async downloadMerged(
    @Param('id', ParseIntPipe) parentId: number,
    @Res() res: Response,
    @CurrentUser() user: CompositionActor,
  ) {
    const buffer = await this.pdfMergeService.merge(parentId, user.id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="informe-${parentId}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
