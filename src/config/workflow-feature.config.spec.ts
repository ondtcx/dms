import workflowFeatureConfig, { isWorkflowFeatureEnabled } from './workflow-feature.config';

describe('workflow feature configuration', () => {
  it('is disabled unless explicitly enabled', () => {
    expect(isWorkflowFeatureEnabled(undefined)).toBe(false);
    expect(isWorkflowFeatureEnabled('false')).toBe(false);
    expect(isWorkflowFeatureEnabled('TRUE')).toBe(true);
    expect(workflowFeatureConfig('true')).toEqual({ workflowFeatureEnabled: true });
  });

  it('does not enable the feature for truthy-looking non-boolean values', () => {
    expect(isWorkflowFeatureEnabled('1')).toBe(false);
    expect(isWorkflowFeatureEnabled('yes')).toBe(false);
    expect(isWorkflowFeatureEnabled(' true ')).toBe(false);
  });
});
