import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../auth/decorators/permission.decorator';
import { WorkflowController } from './workflow.controller';

describe('WorkflowController protected routes', () => {
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
  });
});
