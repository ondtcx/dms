import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DocumentChangeRequestService } from './document-change-request.service';
import { CreateChangeRequestDto, DecideChangeRequestDto } from './document-change-request.dto';

@ApiTags('document-change-requests')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard)
@Controller('documents/:documentId/change-requests')
export class DocumentChangeRequestController {
  constructor(private readonly requests: DocumentChangeRequestService) {}

  @Get()
  get(@Param('documentId', ParseIntPipe) documentId: number, @CurrentUser() actor: any) {
    return this.requests.get(documentId, actor.id);
  }

  @Get('recipients')
  recipients(@Param('documentId', ParseIntPipe) documentId: number, @CurrentUser() actor: any, @Query('query') query: string) {
    return this.requests.recipients(documentId, actor.id, query);
  }

  @Get('recipient-access')
  access(@Param('documentId', ParseIntPipe) documentId: number, @CurrentUser() actor: any, @Query('recipientId') recipientId: string) {
    return this.requests.recipientAccess(documentId, actor.id, recipientId);
  }

  @Post()
  create(@Param('documentId', ParseIntPipe) documentId: number, @CurrentUser() actor: any, @Body() dto: CreateChangeRequestDto) {
    return this.requests.create(documentId, actor.id, dto);
  }

  @Post(':id/correction')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 500 * 1024 * 1024, files: 1, fields: 1 } }))
  submit(@Param('documentId', ParseIntPipe) documentId: number, @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: any, @Body('revision') revision: string, @UploadedFile() file: Express.Multer.File) {
    return this.requests.submit(documentId, id, actor.id, revision === undefined || revision.trim() === '' ? NaN : Number(revision), file);
  }

  @Post(':id/decision')
  decide(@Param('documentId', ParseIntPipe) documentId: number, @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: any, @Body() dto: DecideChangeRequestDto) {
    return this.requests.decide(documentId, id, actor.id, dto);
  }

  @Get(':id/correction')
  async download(@Param('documentId', ParseIntPipe) documentId: number, @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: any, @Res({ passthrough: true }) response: Response) {
    const file = await this.requests.download(documentId, id, actor.id);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.buffer);
  }
}
