import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification-type.enum';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { AddReactionDto } from './dto/add-reaction.dto';

@Injectable()
export class CommentService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  // ============ Parser de @Mentions ============

  private parseMentions(content: string): string[] {
    // Regex para extraer @mentions (formato: @username o @user.name)
    const mentionRegex = /@([\w.-]+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }

    return mentions;
  }

  private async resolveUserIds(usernames: string[]): Promise<string[]> {
    if (usernames.length === 0) return [];

    // Buscar usuarios por email (asumiendo que el username es el email)
    const users = await this.prisma.user.findMany({
      where: {
        email: {
          in: usernames.map((u) => u.includes('@') ? u : `${u}@example.com`),
        },
      },
      select: { id: true },
    });

    return users.map((u) => u.id);
  }

  // ============ CRUD de Comentarios ============

  async create(
    documentId: number,
    userId: string,
    createDto: CreateCommentDto,
  ) {
    // Verificar que el documento existe
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, filename: true },
    });

    if (!document) {
      throw new NotFoundException(
        `Documento con ID ${documentId} no encontrado`,
      );
    }

    // Verificar comentario padre si existe
    if (createDto.parentId) {
      const parent = await this.prisma.documentComment.findFirst({
        where: {
          id: createDto.parentId,
          documentId,
        },
      });

      if (!parent) {
        throw new NotFoundException(
          `Comentario padre con ID ${createDto.parentId} no encontrado`,
        );
      }
    }

    // Extraer menciones del contenido
    const mentionUsernames = this.parseMentions(createDto.content);
    const mentionedUserIds = await this.resolveUserIds(mentionUsernames);

    // Crear el comentario
    const comment = await this.prisma.documentComment.create({
      data: {
        documentId,
        userId,
        content: createDto.content,
        parentId: createDto.parentId,
        mentions: mentionedUserIds,
        annotationData: createDto.annotationData || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        parent: {
          select: {
            id: true,
            content: true,
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
    });

    // Notificar a usuarios mencionados
    if (mentionedUserIds.length > 0) {
      await this.notifyMentionedUsers(
        mentionedUserIds,
        userId,
        documentId,
        comment.id,
        document.filename,
      );
    }

    // Notificar al autor del comentario padre si es una respuesta
    if (createDto.parentId && comment.parent) {
      if (comment.parent.user.id !== userId) {
        await this.notificationService.createNotification({
          userId: comment.parent.user.id,
          type: NotificationType.COMMENT_ADDED,
          title: 'Nueva respuesta a tu comentario',
          message: `${comment.user.name || 'Un usuario'} respondió a tu comentario`,
          documentId,
          actionUrl: `/documents/${documentId}#comment-${comment.id}`,
          sendEmail: false,
        });
      }
    }

    return comment;
  }

  async findByDocument(documentId: number) {
    // Obtener solo comentarios de nivel superior (sin padre)
    const comments = await this.prisma.documentComment.findMany({
      where: {
        documentId,
        parentId: null,
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        replies: {
          where: {
            deletedAt: null,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            reactions: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            _count: {
              select: {
                replies: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return comments;
  }

  async update(commentId: number, userId: string, updateDto: UpdateCommentDto) {
    const comment = await this.prisma.documentComment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException(
        `Comentario con ID ${commentId} no encontrado`,
      );
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException(
        'Solo puedes editar tus propios comentarios',
      );
    }

    if (comment.deletedAt) {
      throw new BadRequestException('No puedes editar un comentario eliminado');
    }

    // Extraer nuevas menciones
    const mentionUsernames = this.parseMentions(updateDto.content);
    const mentionedUserIds = await this.resolveUserIds(mentionUsernames);

    return this.prisma.documentComment.update({
      where: { id: commentId },
      data: {
        content: updateDto.content,
        mentions: mentionedUserIds,
        isEdited: true,
        editedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async delete(commentId: number, userId: string) {
    const comment = await this.prisma.documentComment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException(
        `Comentario con ID ${commentId} no encontrado`,
      );
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException(
        'Solo puedes eliminar tus propios comentarios',
      );
    }

    // Soft delete
    await this.prisma.documentComment.update({
      where: { id: commentId },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
    });

    return {
      message: 'Comentario eliminado exitosamente',
    };
  }

  // ============ Reacciones ============

  async addReaction(
    commentId: number,
    userId: string,
    addReactionDto: AddReactionDto,
  ) {
    const comment = await this.prisma.documentComment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException(
        `Comentario con ID ${commentId} no encontrado`,
      );
    }

    if (comment.deletedAt) {
      throw new BadRequestException(
        'No puedes reaccionar a un comentario eliminado',
      );
    }

    // Verificar si ya existe la reacción
    const existing = await this.prisma.commentReaction.findUnique({
      where: {
        commentId_userId_emoji: {
          commentId,
          userId,
          emoji: addReactionDto.emoji,
        },
      },
    });

    if (existing) {
      // Si ya existe, eliminarla (toggle)
      await this.prisma.commentReaction.delete({
        where: { id: existing.id },
      });

      return {
        message: 'Reacción eliminada',
        action: 'removed',
      };
    }

    // Crear nueva reacción
    const reaction = await this.prisma.commentReaction.create({
      data: {
        commentId,
        userId,
        emoji: addReactionDto.emoji,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      message: 'Reacción agregada',
      action: 'added',
      reaction,
    };
  }

  // ============ Notificaciones ============

  private async notifyMentionedUsers(
    userIds: string[],
    mentionedBy: string,
    documentId: number,
    commentId: number,
    documentName: string,
  ) {
    const mentioner = await this.prisma.user.findUnique({
      where: { id: mentionedBy },
      select: { name: true, email: true },
    });

    const mentionerName = mentioner?.name || mentioner?.email || 'Un usuario';

    for (const userId of userIds) {
      if (userId === mentionedBy) continue; // No notificar al autor

      await this.notificationService.createNotification({
        userId,
        type: NotificationType.MENTION,
        title: 'Te han mencionado en un comentario',
        message: `${mentionerName} te mencionó en un comentario del documento "${documentName}"`,
        documentId,
        actionUrl: `/documents/${documentId}#comment-${commentId}`,
        sendEmail: true,
      });
    }
  }
}
