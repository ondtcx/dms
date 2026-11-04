import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditResource,
  DocumentReviewAction,
  DocumentReviewStatus,
  NotificationType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';
import { UserRole } from '../auth/role.enum';
import { PrismaService } from '../prisma/prisma.service';

type ReviewUser = { id: string; name?: string | null; role?: string | null };

@Injectable()
export class DocumentReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async accessFilter(user: ReviewUser) {
    if (!user?.id) return { id: -1 };
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        role: true,
        roleAssignments: {
          where: { role: { isActive: true } },
          select: { role: { select: { id: true, key: true, isActive: true } } },
        },
      },
    });
    return buildDocumentAccessFilter({
      id: user.id,
      role: (dbUser?.role ?? user.role) as unknown as UserRole,
      assignments: (dbUser?.roleAssignments ?? []).map(({ role }) => role),
    });
  }

  private async find(documentId: number, user?: ReviewUser) {
    const access = user ? await this.accessFilter(user) : undefined;
    const scope = access
      ? { OR: [{ document: access }, { reviewerId: user?.id ?? '' }] }
      : {};
    const review = await this.prisma.documentReview.findFirst({
      where: { documentId, ...scope },
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

  async get(documentId: number, user: ReviewUser) {
    return this.find(documentId, user);
  }

  async pending(user: ReviewUser) {
    const access = await this.accessFilter(user);
    return this.prisma.documentReview.findMany({
      where: {
        status: DocumentReviewStatus.IN_REVIEW,
        OR: [{ document: access }, { reviewerId: user.id }],
      },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            uploadedById: true,
            uploadedBy: { select: { id: true, name: true } },
            currentVersion: true,
            createdAt: true,
            documentType: { select: { id: true, name: true } },
            templateData: {
              select: {
                template: { select: { id: true, name: true } },
              },
            },
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
    documentId?: number | null,
    actor?: ReviewUser,
  ) {
    if (!userId) return;
    try {
      const preference = await this.prisma.notificationPreference.findUnique({
        where: { userId },
        select: { inAppEnabled: true },
      });
      if (preference && !preference.inAppEnabled) return;
      await this.prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          actionUrl,
          documentId: documentId ?? null,
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? null,
          actorRole: actor?.role ?? null,
        },
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
    const review = await this.find(documentId, user);
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
      await this.audit.record(
        {
          action: AuditAction.SUBMIT,
          resource: AuditResource.DOCUMENT,
          resourceId: String(documentId),
          documentId,
          metadata: {
            origin: 'UPLOAD',
            fromStatus: review.status,
            toStatus: DocumentReviewStatus.IN_REVIEW,
            reviewerId: reviewerId ?? null,
            reviewerName: nextReviewerName,
          },
        },
        tx,
      );
      return saved;
    });
    if (reviewerId) {
      await this.notify(
        reviewerId,
        NotificationType.APPROVAL_REQUESTED,
        'Documento pendiente de revisión',
        `${review.document.name} está listo para revisar.`,
        `/dashboard/documents/${documentId}`,
        documentId,
        user,
      );
    }
    return updated;
  }

  async approve(documentId: number, user: ReviewUser, observation?: string) {
    const review = await this.find(documentId, user);
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
      await this.audit.record(
        {
          action: AuditAction.APPROVE,
          resource: AuditResource.DOCUMENT,
          resourceId: String(documentId),
          documentId,
          metadata: {
            fromStatus: review.status,
            toStatus: DocumentReviewStatus.APPROVED,
            observation: observation ?? null,
            reviewerName: user.name ?? null,
          },
        },
        tx,
      );
      return saved;
    });
    await this.notify(
      review.document.uploadedById,
      NotificationType.APPROVAL_APPROVED,
      'Documento aprobado',
      `${review.document.name} fue aprobado.`,
      `/dashboard/documents/${documentId}`,
      documentId,
      user,
    );
    return updated;
  }

  async archive(documentId: number, user: ReviewUser) {
    const review = await this.find(documentId, user);
    if (review.status !== DocumentReviewStatus.APPROVED) {
      throw new BadRequestException(
        'Solo se puede archivar un documento aprobado',
      );
    }
    const isOwner = review.document.uploadedById === user.id;
    const isAdmin = user.role === 'admin' || user.role === 'rector';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'No tienes autoridad para archivar este documento',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.documentReview.update({
        where: { documentId },
        data: {
          status: DocumentReviewStatus.ARCHIVED,
          reviewedAt: new Date(),
          reviewedById: user.id,
          reviewedByName: user.name ?? null,
        },
      });
      await tx.documentReviewEvent.create({
        data: {
          reviewId: saved.id,
          action: DocumentReviewAction.ARCHIVED,
          fromStatus: DocumentReviewStatus.APPROVED,
          toStatus: DocumentReviewStatus.ARCHIVED,
          actorId: user.id,
          actorName: user.name ?? null,
          observation: 'Documento archivado',
        },
      });
      await tx.document.update({
        where: { id: documentId },
        data: { archivedAt: new Date() },
      });
      await this.audit.record(
        {
          action: AuditAction.ARCHIVE,
          resource: AuditResource.DOCUMENT,
          resourceId: String(documentId),
          documentId,
          metadata: {
            automatic: false,
            fromStatus: DocumentReviewStatus.APPROVED,
            toStatus: DocumentReviewStatus.ARCHIVED,
          },
        },
        tx,
      );
      return saved;
    });
    await this.notify(
      review.document.uploadedById,
      NotificationType.DOCUMENT_UPDATED,
      'Documento archivado',
      `${review.document.name ?? 'El documento'} fue archivado.`,
      `/dashboard/documents/${documentId}`,
      documentId,
      user,
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
    const review = await this.find(documentId, user);
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
      await this.audit.record(
        {
          action: AuditAction.REQUEST_CHANGES,
          resource: AuditResource.DOCUMENT,
          resourceId: String(documentId),
          documentId,
          metadata: {
            fromStatus: review.status,
            toStatus: DocumentReviewStatus.CHANGES_REQUESTED,
            observation: observation.trim(),
          },
        },
        tx,
      );
      return saved;
    });
    await this.notify(
      review.document.uploadedById,
      NotificationType.CHANGES_REQUESTED,
      'Documento devuelto para corrección',
      `${review.document.name}: ${observation.trim()}`,
      `/dashboard/documents/${documentId}`,
      documentId,
      user,
    );
    return updated;
  }
}
