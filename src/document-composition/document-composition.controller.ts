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
  getComposition(@Param('id', ParseIntPipe) parentId: number) {
    return this.compositionService.getComposition(parentId);
  }

  @Post()
  @ApiOperation({ summary: 'Agregar un documento como componente' })
  addComponent(
    @Param('id', ParseIntPipe) parentId: number,
    @Body() dto: AddComponentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.compositionService.addComponent(parentId, dto);
  }

  @Delete(':childId')
  @ApiOperation({ summary: 'Quitar un documento componente' })
  removeComponent(
    @Param('id', ParseIntPipe) parentId: number,
    @Param('childId', ParseIntPipe) childId: number,
  ) {
    return this.compositionService.removeComponent(parentId, childId);
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reordenar los componentes del documento' })
  reorder(
    @Param('id', ParseIntPipe) parentId: number,
    @Body() dto: ReorderComponentsDto,
  ) {
    return this.compositionService.reorder(parentId, dto);
  }

  @Patch(':childId')
  @ApiOperation({ summary: 'Actualizar etiqueta o posición de un componente' })
  updateComponent(
    @Param('id', ParseIntPipe) parentId: number,
    @Param('childId', ParseIntPipe) childId: number,
    @Body() dto: UpdateComponentDto,
  ) {
    return this.compositionService.updateComponent(parentId, childId, dto);
  }

  @Get('download')
  @ApiOperation({
    summary: 'Descargar el PDF mergeado del documento compuesto',
  })
  async downloadMerged(
    @Param('id', ParseIntPipe) parentId: number,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfMergeService.merge(parentId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="informe-${parentId}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
