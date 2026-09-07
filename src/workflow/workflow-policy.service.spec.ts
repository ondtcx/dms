import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { WorkflowAssignmentStatus, WorkflowStatus, WorkflowTransitionAction } from '@prisma/client';
import { WorkflowPolicyService } from './workflow-policy.service';

describe('WorkflowPolicyService', () => {
  const authorization = { hasPermission: jest.fn() };
  let policy: WorkflowPolicyService;

  beforeEach(() => {
    authorization.hasPermission.mockReset();
    authorization.hasPermission.mockResolvedValue(true);
    policy = new WorkflowPolicyService(authorization as any);
  });

  it('uses fresh authorization and denies a revoked transition permission', async () => {
    authorization.hasPermission.mockResolvedValue(false);

    await expect(policy.assertTransitionPermission(WorkflowTransitionAction.APPROVE, 'u1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(authorization.hasPermission).toHaveBeenCalledWith('u1', 'workflow.approve');
  });

  it('requires the actionable assignment and rejects self-approval', async () => {
    const workflow = {
      active: true,
      initiatedById: 'owner',
      currentStateOrder: 1,
      status: WorkflowStatus.IN_PROGRESS,
      assignments: [{ id: 4, userId: 'other', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
    };

    await expect(policy.assertTransitionContext(WorkflowTransitionAction.APPROVE, 'u1', 'profesor', workflow))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(policy.assertTransitionContext(WorkflowTransitionAction.APPROVE, 'owner', 'profesor', {
      ...workflow,
      assignments: [{ id: 4, userId: 'owner', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects out-of-order and missing required comments atomically before transition work', async () => {
    const workflow = {
      active: true,
      initiatedById: 'owner',
      currentStateOrder: 1,
      status: WorkflowStatus.IN_PROGRESS,
      assignments: [{ id: 4, userId: 'u1', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 2 } }],
    };

    await expect(policy.assertTransitionContext(WorkflowTransitionAction.APPROVE, 'u1', 'profesor', workflow))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(policy.assertTransitionContext(WorkflowTransitionAction.REJECT, 'u1', 'profesor', {
      ...workflow,
      assignments: [{ id: 4, userId: 'u1', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows a current assignee to read workflow history with the view permission', async () => {
    await expect(policy.assertHistory('u1', 'profesor', {
      uploadedById: 'owner',
      workflow: [{ assignments: [{ userId: 'u1' }] }],
    })).resolves.toBeUndefined();
  });
});
