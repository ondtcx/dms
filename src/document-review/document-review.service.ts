import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentReviewAction,
  DocumentReviewStatus,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ReviewUser = { id: string; name?: string | null; role?: string | null };

@Injectable()
export class DocumentReviewService {
  constructor(private readonly prisma: PrismaService) {}

  private async find(documentId: number) {
    const review = await this.prisma.documentReview.findUnique({
      where: { documentId },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            uploadedById: true,
            currentVersion: true,
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!review) throw new NotFoundException('Revisión no encontrada');
    return review;
  }

  async get(documentId: number) {
    return this.find(documentId);
  }

  async pending() {
    return this.prisma.documentReview.findMany({
      where: { status: DocumentReviewStatus.IN_REVIEW },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            uploadedById: true,
            uploadedBy: { select: { id: true, name: true } },
            currentVersion: true,
            createdAt: true,
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
      take: 100,
    });
  }

  private async notify(
    userId: string | null | undefined,
    type: NotificationType,
    title: string,
    message: string,
    actionUrl: string,
  ) {
    if (!userId) return;
    try {
      const preference = await this.prisma.notificationPreference.findUnique({
        where: { userId },
        select: { inAppEnabled: true },
      });
      if (preference && !preference.inAppEnabled) return;
      await this.prisma.notification.create({
        data: { userId, type, title, message, actionUrl },
      });
    } catch {
      // La notificación no debe bloquear la revisión.
    }
  }

  async submit(
    documentId: number,
    user: ReviewUser,
    reviewerId?: string,
    reviewerName?: string,
  ) {
    const review = await this.find(documentId);
    if (
      review.status !== DocumentReviewStatus.DRAFT &&
      review.status !== DocumentReviewStatus.CHANGES_REQUESTED
    ) {
      throw new BadRequestException('El documento no está en estado editable');
    }
    let nextReviewerName = reviewerName ?? null;
    if (reviewerId) {
      const reviewer = await this.prisma.user.findFirst({
        where: { id: reviewerId, isActive: true },
        select: { id: true, name: true },
      });
      if (!reviewer) throw new BadRequestException('Revisor no encontrado');
      nextReviewerName = reviewer.name;
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.documentReview.update({
        where: { documentId },
        data: {
          status: DocumentReviewStatus.IN_REVIEW,
          submittedAt: new Date(),
          reviewerId: reviewerId ?? null,
          reviewerName: nextReviewerName,
          reviewedAt: null,
          reviewedById: null,
          reviewedByName: null,
          observation: null,
          documentVersionId: review.document.currentVersion,
        },
      });
      await tx.documentReviewEvent.create({
        data: {
          reviewId: saved.id,
          action: DocumentReviewAction.SUBMITTED,
          fromStatus: review.status,
          toStatus: DocumentReviewStatus.IN_REVIEW,
          actorId: user.id,
          actorName: user.name ?? null,
          observation: nextReviewerName ? `Revisor: ${nextReviewerName}` : null,
        },
      });
      return saved;
    });
    if (reviewerId) {
      await this.notify(
        reviewerId,
        NotificationType.APPROVAL_REQUESTED,
        'Documento pendiente de revisión',
        `${review.document.name} está listo para revisar.`,
        `/dashboard/documents/${documentId}`,
      );
    }
    return updated;
  }

  async approve(documentId: number, user: ReviewUser, observation?: string) {
    const review = await this.find(documentId);
    if (review.status !== DocumentReviewStatus.IN_REVIEW) {
      throw new BadRequestException('El documento no está en revisión');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.documentReview.update({
        where: { documentId },
        data: {
          status: DocumentReviewStatus.APPROVED,
          reviewedAt: new Date(),
          reviewedById: user.id,
          reviewedByName: user.name ?? null,
          observation: observation ?? null,
        },
      });
      await tx.documentReviewEvent.create({
        data: {
          reviewId: saved.id,
          action: DocumentReviewAction.APPROVED,
          fromStatus: review.status,
          toStatus: DocumentReviewStatus.APPROVED,
          actorId: user.id,
          actorName: user.name ?? null,
          observation: observation ?? null,
        },
      });
      return saved;
    });
    await this.notify(
      review.document.uploadedById,
      NotificationType.APPROVAL_APPROVED,
      'Documento aprobado',
      `${review.document.name} fue aprobado.`,
      `/dashboard/documents/${documentId}`,
    );
    return updated;
  }

  async returnDocument(
    documentId: number,
    user: ReviewUser,
    observation: string,
  ) {
    if (!observation?.trim()) {
      throw new BadRequestException('La observación es obligatoria');
    }
    const review = await this.find(documentId);
    if (review.status !== DocumentReviewStatus.IN_REVIEW) {
      throw new BadRequestException('El documento no está en revisión');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.documentReview.update({
        where: { documentId },
        data: {
          status: DocumentReviewStatus.CHANGES_REQUESTED,
          reviewedAt: new Date(),
          reviewedById: user.id,
          reviewedByName: user.name ?? null,
          observation: observation.trim(),
        },
      });
      await tx.documentReviewEvent.create({
        data: {
          reviewId: saved.id,
          action: DocumentReviewAction.RETURNED,
          fromStatus: review.status,
          toStatus: DocumentReviewStatus.CHANGES_REQUESTED,
          actorId: user.id,
          actorName: user.name ?? null,
          observation: observation.trim(),
        },
      });
      return saved;
    });
    await this.notify(
      review.document.uploadedById,
      NotificationType.CHANGES_REQUESTED,
      'Documento devuelto para corrección',
      `${review.document.name}: ${observation.trim()}`,
      `/dashboard/documents/${documentId}`,
    );
    return updated;
  }
}
