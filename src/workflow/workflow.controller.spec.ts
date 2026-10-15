import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSION_KEY } from '../auth/decorators/permission.decorator';
import { WorkflowController } from './workflow.controller';

describe('WorkflowController protected routes', () => {
  it('has no rollout guard while retaining route permission metadata', () => {
    const reflector = new Reflector();
    expect(reflector.get(GUARDS_METADATA, WorkflowController) ?? []).toEqual([]);
    expect(reflector.get(PERMISSION_KEY, WorkflowController.prototype.start)).toBe('workflow.start');
    expect(reflector.get(PERMISSION_KEY, WorkflowController.prototype.findDefinitions)).toBe('workflow.templates.manage');
  });

  it('delegates document applicability with the authenticated user context', async () => {
    const workflowService = { findApplicableDefinitions: jest.fn().mockResolvedValue([{ id: 1 }]) };
    const controller = new WorkflowController(workflowService as any);

    await expect(controller.findApplicableDefinitions(12, { id: 'user-1', role: 'secretary' })).resolves.toEqual([{ id: 1 }]);
    expect(workflowService.findApplicableDefinitions).toHaveBeenCalledWith(12, 'user-1', 'secretary');
  });

  it('delegates administration routes with explicit definition and version ids', async () => {
    const workflowService = {
      findDefinition: jest.fn().mockResolvedValue({ id: 7 }),
      updateMetadata: jest.fn().mockResolvedValue({ id: 7 }),
      validateVersion: jest.fn().mockResolvedValue({ versionId: 12, valid: true, issues: [] }),
      activate: jest.fn().mockResolvedValue({ id: 12 }),
      deactivate: jest.fn().mockResolvedValue({ id: 12 }),
    };
    const controller = new WorkflowController(workflowService as any);

    await expect(controller.findDefinition(7)).resolves.toEqual({ id: 7 });
    await expect(controller.updateMetadata(7, { name: 'Aprobación' })).resolves.toEqual({ id: 7 });
    await expect(controller.validateVersion(7, 12, {})).resolves.toEqual({ versionId: 12, valid: true, issues: [] });
    await controller.activate(7, 12);
    await controller.deactivate(7, 12);

    expect(workflowService.updateMetadata).toHaveBeenCalledWith(7, { name: 'Aprobación' });
    expect(workflowService.validateVersion).toHaveBeenCalledWith(7, 12, {});
    expect(workflowService.activate).toHaveBeenCalledWith(7, 12);
    expect(workflowService.deactivate).toHaveBeenCalledWith(7, 12);
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
    expect(reflector.get(PERMISSION_KEY, WorkflowController.prototype.findDefinition)).toBe('workflow.templates.manage');
    expect(reflector.get(PERMISSION_KEY, WorkflowController.prototype.updateMetadata)).toBe('workflow.templates.manage');
    expect(reflector.get(PERMISSION_KEY, WorkflowController.prototype.validateVersion)).toBe('workflow.templates.manage');
    expect(reflector.get(PERMISSION_KEY, WorkflowController.prototype.activate)).toBe('workflow.templates.manage');
    expect(reflector.get(PERMISSION_KEY, WorkflowController.prototype.deactivate)).toBe('workflow.templates.manage');
  });
});
