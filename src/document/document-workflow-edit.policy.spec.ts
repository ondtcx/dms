import { ForbiddenException } from '@nestjs/common';
import { WorkflowStatus } from '@prisma/client';
import { UserRole } from '../auth/role.enum';
import { assertWorkflowEditable } from './document-workflow-edit.policy';

function clientReturning(workflow: { status: WorkflowStatus; initiatedById: string } | null) {
  const findFirst = jest.fn(async () => workflow);
  return { client: { documentWorkflow: { findFirst } }, findFirst };
}

describe('assertWorkflowEditable shared policy', () => {
  it('passes when there is no active blocking workflow', async () => {
    const { client } = clientReturning(null);
    await expect(assertWorkflowEditable(client, 4, 'author', UserRole.USER)).resolves.toBeUndefined();
  });

  it.each([WorkflowStatus.PENDING, WorkflowStatus.IN_PROGRESS])('blocks a neutral USER during %s', async status => {
    const { client } = clientReturning({ status, initiatedById: 'author' });
    await expect(assertWorkflowEditable(client, 4, 'author', UserRole.USER))
      .rejects.toThrow('No se puede editar un documento con un workflow activo');
  });

  it('preserves the original ADMIN bypass', async () => {
    const { client } = clientReturning({ status: WorkflowStatus.PENDING, initiatedById: 'author' });
    await expect(assertWorkflowEditable(client, 4, 'author', UserRole.ADMIN)).resolves.toBeUndefined();
  });

  it('allows only the CHANGES_REQUESTED initiator', async () => {
    const same = clientReturning({ status: WorkflowStatus.CHANGES_REQUESTED, initiatedById: 'author' });
    await expect(assertWorkflowEditable(same.client, 4, 'author', UserRole.USER)).resolves.toBeUndefined();
    const other = clientReturning({ status: WorkflowStatus.CHANGES_REQUESTED, initiatedById: 'other' });
    await expect(assertWorkflowEditable(other.client, 4, 'author', UserRole.USER)).rejects.toThrow(ForbiddenException);
  });

  it('queries the exact active document workflow predicate', async () => {
    const { client, findFirst } = clientReturning(null);
    await assertWorkflowEditable(client, 4, 'author', UserRole.USER);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        documentId: 4,
        active: true,
        status: {
          in: [WorkflowStatus.PENDING, WorkflowStatus.IN_PROGRESS, WorkflowStatus.CHANGES_REQUESTED],
        },
      },
      select: { status: true, initiatedById: true },
    });
  });

  it('is read-only and only reads the workflow client', async () => {
    const { client } = clientReturning(null);
    await assertWorkflowEditable(client, 4, 'author', UserRole.USER);
    expect(Object.keys(client.documentWorkflow)).toEqual(['findFirst']);
  });
});
