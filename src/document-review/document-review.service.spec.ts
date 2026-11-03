import { BadRequestException } from '@nestjs/common';
import { DocumentReviewStatus, NotificationType } from '@prisma/client';
import { DocumentReviewService } from './document-review.service';

describe('DocumentReviewService', () => {
  const user = { id: 'admin-1', name: 'Admin' };
  const review = (status: DocumentReviewStatus) => ({
    id: 1,
    documentId: 10,
    status,
    document: { id: 10, name: 'Documento', uploadedById: 'author-1', currentVersion: 1 },
    events: [],
  });

  function setup(status: DocumentReviewStatus = DocumentReviewStatus.DRAFT) {
    const prisma: any = {
      documentReview: {
        findUnique: jest.fn().mockResolvedValue(review(status)),
        update: jest.fn().mockImplementation(({ data }) => ({ ...review(status), ...data })),
      },
      documentReviewEvent: { create: jest.fn().mockResolvedValue({}) },
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      notification: { create: jest.fn().mockResolvedValue({}) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'reviewer-1', name: 'Revisor' }) },
    };
    prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
    return { service: new DocumentReviewService(prisma), prisma };
  }

  it('submits a draft and records the event', async () => {
    const { service, prisma } = setup();
    await expect(service.submit(10, user)).resolves.toMatchObject({
      status: DocumentReviewStatus.IN_REVIEW,
    });
    expect(prisma.documentReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SUBMITTED', toStatus: 'IN_REVIEW' }),
      }),
    );
  });

  it('notifies the selected reviewer on submit', async () => {
    const { service, prisma } = setup();
    await service.submit(10, user, 'reviewer-1');
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'reviewer-1', type: NotificationType.APPROVAL_REQUESTED }),
      }),
    );
  });

  it('rejects submit unless the document is editable', async () => {
    const { service } = setup(DocumentReviewStatus.APPROVED);
    await expect(service.submit(10, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approves an in-review document and notifies the author', async () => {
    const { service, prisma } = setup(DocumentReviewStatus.IN_REVIEW);
    await expect(service.approve(10, user, 'Listo')).resolves.toMatchObject({
      status: DocumentReviewStatus.APPROVED,
      observation: 'Listo',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'author-1', type: NotificationType.APPROVAL_APPROVED }),
      }),
    );
  });

  it('returns a document only with an observation', async () => {
    const { service, prisma } = setup(DocumentReviewStatus.IN_REVIEW);
    await expect(service.returnDocument(10, user, '  ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.returnDocument(10, user, 'Falta firma')).resolves.toMatchObject({
      status: DocumentReviewStatus.CHANGES_REQUESTED,
    });
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'author-1', type: NotificationType.CHANGES_REQUESTED }),
      }),
    );
  });

  it('rejects review actions outside the allowed status', async () => {
    const { service } = setup(DocumentReviewStatus.DRAFT);
    await expect(service.approve(10, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.returnDocument(10, user, 'x')).rejects.toBeInstanceOf(BadRequestException);
  });
});
