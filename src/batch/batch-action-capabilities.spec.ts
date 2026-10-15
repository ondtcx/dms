import { resolveBatchActionCapabilities, BatchActionContext } from './batch-action-capabilities';

const base: BatchActionContext = {
  actorId: 'author', uploadedById: 'author', reception: false,
  canEdit: false, canDelete: false, canView: false, receptionLiveSubmit: false,
  receptionReadable: false, workflowEditable: false, receptionActiveReview: false,
};
const denied = { update: false, trash: false, restore: false, permanentDelete: false, export: false };

describe('batch capability policy regressions', () => {
  it.each([false, true])('denies unresolved actor with reception=%s', (reception) => {
    expect(resolveBatchActionCapabilities({ ...base, actorId: null, reception })).toEqual({
      scope: reception ? 'reception' : 'ordinary', ...denied,
    });
  });
  it('preserves ordinary owner authority regardless of workflow', () => {
    expect(resolveBatchActionCapabilities(base)).toEqual({ scope: 'ordinary', update: true,
      trash: true, restore: true, permanentDelete: true, export: true });
  });
  it.each([
    ['canView', { export: true }],
    ['canEdit', { update: true, restore: true }],
    ['canDelete', { trash: true, permanentDelete: true }],
  ] as const)('keeps ordinary direct %s grants independent', (grant, allowed) => {
    expect(resolveBatchActionCapabilities({ ...base, actorId: 'reader', [grant]: true })).toEqual({
      scope: 'ordinary', ...denied, ...allowed,
    });
  });
  it('does not infer ordinary non-owner authority from actor name or editable workflow', () => {
    expect(resolveBatchActionCapabilities({ ...base, actorId: 'admin', workflowEditable: true }))
      .toEqual({ scope: 'ordinary', ...denied });
  });
  it('permits live author actions but never reception permanent bulk deletion', () => {
    expect(resolveBatchActionCapabilities({ ...base, reception: true, receptionLiveSubmit: true,
      receptionReadable: true, workflowEditable: true })).toEqual({ scope: 'reception', update: true,
      trash: true, restore: true, permanentDelete: false, export: true });
  });
  it('blocks author metadata and withdrawal during active review without blocking read', () => {
    expect(resolveBatchActionCapabilities({ ...base, reception: true, receptionLiveSubmit: true,
      receptionReadable: true, receptionActiveReview: true })).toEqual({ scope: 'reception',
      update: false, trash: false, restore: false, permanentDelete: false, export: true });
  });
  it('permits correction metadata but not withdrawal', () => {
    expect(resolveBatchActionCapabilities({ ...base, reception: true, receptionLiveSubmit: true,
      receptionReadable: true, workflowEditable: true, receptionActiveReview: true })).toEqual({
      scope: 'reception', update: true, trash: false, restore: false, permanentDelete: false, export: true,
    });
  });
  it('never escalates a reception peer through ordinary direct grants', () => {
    expect(resolveBatchActionCapabilities({ ...base, actorId: 'peer', reception: true,
      receptionLiveSubmit: true, receptionReadable: true, canEdit: true, canDelete: true, canView: true,
      workflowEditable: true })).toEqual({ scope: 'reception', update: false, trash: false,
      restore: false, permanentDelete: false, export: true });
  });
  it('denies revoked reception author authority despite ordinary grants', () => {
    expect(resolveBatchActionCapabilities({ ...base, reception: true, canEdit: true,
      canDelete: true, canView: true, workflowEditable: true })).toEqual({ scope: 'reception', ...denied });
  });
});
