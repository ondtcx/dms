import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { AddReactionDto } from './dto/add-reaction.dto';
import { AuthGuard } from '../auth/guards/auth.guard';

@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('documents/:documentId/comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un comentario en un documento' })
  @ApiResponse({ status: 201, description: 'Comentario creado exitosamente' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  create(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Request() req,
    @Body() createDto: CreateCommentDto,
  ) {
    return this.commentService.create(documentId, req.user.id, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los comentarios de un documento' })
  @ApiResponse({ status: 200, description: 'Lista de comentarios' })
  findAll(@Param('documentId', ParseIntPipe) documentId: number) {
    return this.commentService.findByDocument(documentId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un comentario' })
  @ApiResponse({ status: 200, description: 'Comentario actualizado' })
  @ApiResponse({ status: 403, description: 'No tienes permiso para editar este comentario' })
  @ApiResponse({ status: 404, description: 'Comentario no encontrado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() updateDto: UpdateCommentDto,
  ) {
    return this.commentService.update(id, req.user.id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un comentario (soft delete)' })
  @ApiResponse({ status: 200, description: 'Comentario eliminado' })
  @ApiResponse({ status: 403, description: 'No tienes permiso para eliminar este comentario' })
  @ApiResponse({ status: 404, description: 'Comentario no encontrado' })
  delete(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.commentService.delete(id, req.user.id);
  }

  @Post(':id/reactions')
  @ApiOperation({ summary: 'Agregar/quitar reacción a un comentario (toggle)' })
  @ApiResponse({ status: 201, description: 'Reacción agregada o eliminada' })
  @ApiResponse({ status: 404, description: 'Comentario no encontrado' })
  addReaction(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() addReactionDto: AddReactionDto,
  ) {
    return this.commentService.addReaction(id, req.user.id, addReactionDto);
  }
}
