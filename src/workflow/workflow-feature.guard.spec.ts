import { NotFoundException } from '@nestjs/common';
import { WorkflowFeatureGuard } from './workflow-feature.guard';

describe('WorkflowFeatureGuard', () => {
  it('allows workflow routes when the feature setting is enabled', () => {
    const guard = new WorkflowFeatureGuard({ get: jest.fn().mockReturnValue(true) } as any);

    expect(guard.canActivate({} as any)).toBe(true);
  });

  it('hides workflow routes when the feature setting is disabled', () => {
    const guard = new WorkflowFeatureGuard({ get: jest.fn().mockReturnValue(false) } as any);

    expect(() => guard.canActivate({} as any)).toThrow(NotFoundException);
  });
});
