import { ForbiddenException } from '@nestjs/common';
import { WorkflowStatus } from '@prisma/client';
import { UserRole } from '../auth/role.enum';

// Cliente de solo lectura compatible tanto con Prisma.TransactionClient como
// con PrismaService (PrismaClient). No importa módulos de documentos ni crea
// ciclos: la política es una función pura que reutiliza el mismo predicado.
export interface WorkflowEditGuardClient {
  documentWorkflow: {
    findFirst: (args: any) => Promise<any>;
  };
}

// Regla compartida de edición con workflow activo, extraída sin cambios de
// DocumentService.assertWorkflowEditable. El rol ADMIN conserva su permiso
// ordinario; la recepción pasa UserRole.USER para impedir ese bypass global.
export async function assertWorkflowEditable(
  db: WorkflowEditGuardClient,
  documentId: number,
  userId: string,
  userRole: UserRole,
): Promise<void> {
  const workflow = (await db.documentWorkflow.findFirst({
    where: {
      documentId,
      active: true,
      status: {
        in: [
          WorkflowStatus.PENDING,
          WorkflowStatus.IN_PROGRESS,
          WorkflowStatus.CHANGES_REQUESTED,
        ],
      },
    },
    select: { status: true, initiatedById: true },
  })) as { status: WorkflowStatus; initiatedById: string } | null;

  if (!workflow || userRole === UserRole.ADMIN) return;
  if (
    workflow.status === WorkflowStatus.CHANGES_REQUESTED &&
    workflow.initiatedById === userId
  )
    return;
  throw new ForbiddenException(
    'No se puede editar un documento con un workflow activo',
  );
}
