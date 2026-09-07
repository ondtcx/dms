export function isWorkflowFeatureEnabled(
  value: unknown = process.env.WORKFLOW_FEATURE_ENABLED,
): boolean {
  return typeof value === 'string' && value.toLowerCase() === 'true';
}

export default (value?: unknown) => ({
  workflowFeatureEnabled: isWorkflowFeatureEnabled(value ?? process.env.WORKFLOW_FEATURE_ENABLED),
});
