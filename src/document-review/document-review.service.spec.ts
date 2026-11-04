import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DocumentReviewStatus, NotificationType } from '@prisma/client';
import { DocumentReviewService } from './document-review.service';

describe('DocumentReviewService', () => {
  const user = { id: 'admin-1', name: 'Admin', role: 'admin' };
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
        findFirst: jest.fn().mockResolvedValue(review(status)),
        findUnique: jest.fn().mockResolvedValue(review(status)),
        update: jest.fn().mockImplementation(({ data }) => ({ ...review(status), ...data })),
      },
      documentReviewEvent: { create: jest.fn().mockResolvedValue({}) },
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      notification: { create: jest.fn().mockResolvedValue({}) },
      document: { update: jest.fn().mockResolvedValue({}) },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'reviewer-1', name: 'Revisor' }),
        findUnique: jest.fn().mockResolvedValue({
          id: user.id,
          role: 'admin',
          roleAssignments: [],
        }),
      },
    };
    prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
    const audit = { record: jest.fn().mockResolvedValue({}) };
    return { service: new DocumentReviewService(prisma, audit as any), prisma, audit };
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

  it('records the review transitions in the audit trail', async () => {
    const submit = setup(DocumentReviewStatus.DRAFT);
    await submit.service.submit(10, user, 'reviewer-1');
    expect(submit.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SUBMIT',
        metadata: expect.objectContaining({
          origin: 'UPLOAD',
          toStatus: DocumentReviewStatus.IN_REVIEW,
        }),
      }),
      expect.anything(),
    );

    const approve = setup(DocumentReviewStatus.IN_REVIEW);
    await approve.service.approve(10, user, 'Listo');
    expect(approve.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'APPROVE',
        metadata: expect.objectContaining({
          toStatus: DocumentReviewStatus.APPROVED,
        }),
      }),
      expect.anything(),
    );

    const returned = setup(DocumentReviewStatus.IN_REVIEW);
    await returned.service.returnDocument(10, user, 'Falta firma');
    expect(returned.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REQUEST_CHANGES',
        metadata: expect.objectContaining({
          toStatus: DocumentReviewStatus.CHANGES_REQUESTED,
        }),
      }),
      expect.anything(),
    );
  });

  it('archives an approved uploaded document and records the event', async () => {
    const { service, prisma, audit } = setup(DocumentReviewStatus.APPROVED);
    await expect(service.archive(10, user)).resolves.toMatchObject({
      status: DocumentReviewStatus.ARCHIVED,
    });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { archivedAt: expect.any(Date) },
    });
    expect(prisma.documentReviewEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ARCHIVED',
        fromStatus: 'APPROVED',
        toStatus: 'ARCHIVED',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ARCHIVE' }),
      expect.anything(),
    );
  });

  it('rejects archive from a user who is not the owner or an administrator', async () => {
    const { service } = setup(DocumentReviewStatus.APPROVED);
    await expect(
      service.archive(10, { id: 'other', name: 'Otro', role: 'profesor' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
