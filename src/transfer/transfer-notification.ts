type NotificationWriter = {
  notification: {
    create: (input: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

export function transferComment(value?: string): string | null {
  return value?.trim() || null;
}

export async function notifyTransferRequested(
  db: NotificationWriter,
  input: {
    documentId: number;
    documentName: string;
    fromName: string;
    toUserId: string;
    comment: string | null;
    actorId?: string | null;
    actorName?: string | null;
    actorRole?: string | null;
  },
): Promise<void> {
  await db.notification.create({
    data: {
      userId: input.toUserId,
      type: 'DOCUMENT_TRANSFERRED',
      title: 'Solicitud de transferencia de documento',
      message: `${input.fromName} te propone recibir "${input.documentName}"${input.comment ? `\n${input.comment}` : ''}`,
      documentId: input.documentId,
      actionUrl: '/dashboard/transfers/received',
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      actorRole: input.actorRole ?? null,
    },
  });
}

export async function notifyTransferCompleted(
  db: NotificationWriter,
  input: {
    documentId: number;
    documentName: string;
    fromUserId: string;
    toName: string;
    actorId?: string | null;
    actorName?: string | null;
    actorRole?: string | null;
  },
): Promise<void> {
  await db.notification.create({
    data: {
      userId: input.fromUserId,
      type: 'DOCUMENT_TRANSFERRED',
      title: 'Transferencia completada',
      message: `"${input.documentName}" fue transferido a ${input.toName}`,
      documentId: input.documentId,
      actionUrl: `/dashboard/documents/${input.documentId}`,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      actorRole: input.actorRole ?? null,
    },
  });
}

export async function notifyTransferCanceled(
  db: NotificationWriter,
  input: {
    documentId: number;
    documentName: string;
    userIds: string[];
    canceledByRecipient: boolean;
    actorId?: string | null;
    actorName?: string | null;
    actorRole?: string | null;
  },
): Promise<void> {
  const message = input.canceledByRecipient
    ? `El destinatario rechazó la transferencia de "${input.documentName}"`
    : `La transferencia de "${input.documentName}" fue cancelada`;

  for (const userId of [...new Set(input.userIds)].filter(Boolean)) {
    await db.notification.create({
      data: {
        userId,
        type: 'DOCUMENT_TRANSFERRED',
        title: 'Transferencia cancelada',
        message,
        documentId: input.documentId,
        actionUrl: '/dashboard/transfers/sent',
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        actorRole: input.actorRole ?? null,
      },
    });
  }
}

export async function notifyTransferBatchRequested(
  db: NotificationWriter,
  input: {
    fromName: string;
    toUserId: string;
    documentCount: number;
    comment: string | null;
    actorId?: string | null;
    actorName?: string | null;
    actorRole?: string | null;
  },
): Promise<void> {
  await db.notification.create({
    data: {
      userId: input.toUserId,
      type: 'DOCUMENT_TRANSFERRED',
      title: 'Solicitud de transferencia masiva',
      message: `${input.fromName} te propone recibir ${input.documentCount} documento(s)${input.comment ? `\n${input.comment}` : ''}`,
      documentId: null,
      actionUrl: '/dashboard/transfers/received',
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      actorRole: input.actorRole ?? null,
    },
  });
}

export async function notifyTransferBatchCompleted(
  db: NotificationWriter,
  input: {
    fromUserId: string;
    documentCount: number;
    acceptedCount: number;
    failedCount: number;
    actorId?: string | null;
    actorName?: string | null;
    actorRole?: string | null;
  },
): Promise<void> {
  await db.notification.create({
    data: {
      userId: input.fromUserId,
      type: 'DOCUMENT_TRANSFERRED',
      title: 'Transferencia masiva procesada',
      message: `${input.acceptedCount} de ${input.documentCount} documento(s) fueron transferidos${input.failedCount ? `; ${input.failedCount} quedaron pendientes` : ''}`,
      documentId: null,
      actionUrl: '/dashboard/transfers/sent',
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      actorRole: input.actorRole ?? null,
    },
  });
}

export async function notifyTransferBatchCanceled(
  db: NotificationWriter,
  input: {
    documentCount: number;
    userIds: string[];
    canceledByRecipient: boolean;
    actorId?: string | null;
    actorName?: string | null;
    actorRole?: string | null;
  },
): Promise<void> {
  const message = input.canceledByRecipient
    ? `El destinatario rechazó una transferencia masiva de ${input.documentCount} documento(s)`
    : `Se canceló una transferencia masiva de ${input.documentCount} documento(s)`;
  for (const userId of [...new Set(input.userIds)].filter(Boolean)) {
    await db.notification.create({
      data: {
        userId,
        type: 'DOCUMENT_TRANSFERRED',
        title: 'Transferencia masiva cancelada',
        message,
        documentId: null,
        actionUrl: '/dashboard/transfers/sent',
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        actorRole: input.actorRole ?? null,
      },
    });
  }
}
