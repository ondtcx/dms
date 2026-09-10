import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../auth/decorators/permission.decorator';
import { WorkflowController } from './workflow.controller';

describe('WorkflowController protected routes', () => {
  it('delegates document applicability with the authenticated user context', async () => {
    const workflowService = { findApplicableDefinitions: jest.fn().mockResolvedValue([{ id: 1 }]) };
    const controller = new WorkflowController(workflowService as any);

    await expect(controller.findApplicableDefinitions(12, { id: 'user-1', role: 'secretary' })).resolves.toEqual([{ id: 1 }]);
    expect(workflowService.findApplicableDefinitions).toHaveBeenCalledWith(12, 'user-1', 'secretary');
  });

  it('requires an action permission for transitions and assignment administration for reassignments', () => {
    const reflector = new Reflector();

    expect(reflector.get(PERMISSION_KEY, WorkflowController.prototype.transition)).toEqual([
      'workflow.submit',
      'workflow.approve',
      'workflow.request_changes',
      'workflow.reject',
      'workflow.cancel',
    ]);
    expect(reflector.get(PERMISSION_KEY, WorkflowController.prototype.reassign)).toBe('workflow.assignments.manage');
    expect(reflector.get(PERMISSION_KEY, WorkflowController.prototype.findApplicableDefinitions)).toBe('workflow.start');
  });
});
