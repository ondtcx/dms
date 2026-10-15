import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DocumentService } from './document.service';
import { OfficeContentService } from './office-content/office-content.service';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentPreviewController {
  constructor(
    private readonly documents: DocumentService,
    private readonly office: OfficeContentService,
  ) {}

  @Get(':id/preview')
  async preview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    // La autorización e integridad del original preceden cualquier conversión.
    const original = await this.documents.view(id, user.id, user.role);
    const pdf = await this.office.convert(original.path, original.mimetype);
    // La conversión puede tardar; una revocación vigente impide emitir sus bytes.
    await this.documents.findOne(id, user.id, user.role);
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="preview.pdf"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(pdf);
  }
}
