import {
  DocumentActionActor,
  DocumentActionCapabilityContext,
  resolveDocumentActionCapabilities,
} from './document-action-capabilities';

function actor(overrides: Partial<DocumentActionActor> = {}): DocumentActionActor {
  return {
    id: 'author',
    legacyServiceAdmin: false,
    isLegacyPrivilegedEditor: false,
    effectiveAdminRoute: false,
    ...overrides,
  };
}

function context(
  overrides: Partial<DocumentActionCapabilityContext> = {},
): DocumentActionCapabilityContext {
  return {
    uploadedById: 'author',
    actor: actor(),
    reception: false,
    deleted: false,
    archived: false,
    activeBlockingWorkflow: false,
    changesRequestedByActor: false,
    hasPendingApproval: false,
    manageSharing: false,
    receptionLiveSubmit: false,
    receptionActiveReview: false,
    ...overrides,
  };
}

const resolve = (overrides: Partial<DocumentActionCapabilityContext> = {}) =>
  resolveDocumentActionCapabilities(context(overrides));

const ALL_FALSE = {
  editMetadata: false,
  editContent: false,
  move: false,
  trash: false,
  restore: false,
  permanentDelete: false,
  manageSharing: false,
};

describe('resolveDocumentActionCapabilities (ordinary scope)', () => {
  it('grants the current uploader every ordinary action except restore', () => {
    expect(resolve({ manageSharing: true })).toEqual({
      editMetadata: true,
      editContent: true,
      move: true,
      trash: true,
      restore: false,
      permanentDelete: true,
      manageSharing: true,
      scope: 'ordinary',
    });
  });

  it('denies every action to an unrelated ordinary user', () => {
    expect(resolve({ uploadedById: 'owner', actor: actor({ id: 'visitor' }) })).toEqual({
      ...ALL_FALSE,
      scope: 'ordinary',
    });
  });

  it('does not grant a legacy ADMIN authority over another owner private document', () => {
    const caps = resolve({
      uploadedById: 'owner',
      actor: actor({ id: 'admin', legacyServiceAdmin: true, isLegacyPrivilegedEditor: true, effectiveAdminRoute: true }),
    });
    expect(caps).toMatchObject({
      ...ALL_FALSE,
    });
  });

  it.each(['rector', 'vicerrector'])('does not grant a legacy %s ordinary mutation authority', () => {
    const caps = resolve({
      uploadedById: 'owner',
      actor: actor({ id: 'other', isLegacyPrivilegedEditor: true }),
    });
    expect(caps).toMatchObject({
      ...ALL_FALSE,
    });
  });

  it('does not grant service mutations from a catalog-only ADMIN (legacy USER)', () => {
    const caps = resolve({
      uploadedById: 'owner',
      actor: actor({ id: 'catalog', effectiveAdminRoute: true }),
      manageSharing: true,
    });
    expect(caps).toEqual({ ...ALL_FALSE, manageSharing: true, scope: 'ordinary' });
  });

  it('does not grant edit or move from a catalog-only RECTOR (legacy USER)', () => {
    const caps = resolve({ uploadedById: 'owner', actor: actor({ id: 'catalog' }) });
    expect(caps.editMetadata).toBe(false);
    expect(caps.move).toBe(false);
  });

  it('lets a pending approver edit content but never metadata even with a catalog assignment', () => {
    const caps = resolve({
      uploadedById: 'owner',
      actor: actor({ id: 'approver' }),
      hasPendingApproval: true,
    });
    expect(caps.editMetadata).toBe(false);
    expect(caps.editContent).toBe(true);
  });

  it('blocks metadata and content edits while a blocking workflow is active for a non-admin', () => {
    const caps = resolve({ activeBlockingWorkflow: true });
    expect(caps.editMetadata).toBe(false);
    expect(caps.editContent).toBe(false);
    expect(caps.move).toBe(true);
  });

  it('never lets a legacy ADMIN bypass the active blocking workflow for edits', () => {
    const caps = resolve({
      uploadedById: 'owner',
      actor: actor({ id: 'admin', legacyServiceAdmin: true, isLegacyPrivilegedEditor: true, effectiveAdminRoute: true }),
      activeBlockingWorkflow: true,
    });
    expect(caps.editMetadata).toBe(false);
    expect(caps.editContent).toBe(false);
  });

  it('lets the CHANGES_REQUESTED initiator bypass the active workflow', () => {
    const caps = resolve({ activeBlockingWorkflow: true, changesRequestedByActor: true });
    expect(caps.editMetadata).toBe(true);
    expect(caps.editContent).toBe(true);
  });

  it('offers restore but not trash for a deleted document', () => {
    const caps = resolve({ deleted: true });
    expect(caps).toMatchObject({ editMetadata: false, editContent: false, move: false, trash: false, restore: true });
  });

  it('blocks movement when the document is archived without affecting edits', () => {
    const caps = resolve({ archived: true });
    expect(caps.move).toBe(false);
    expect(caps.editMetadata).toBe(true);
    expect(caps.trash).toBe(true);
  });

  it('requires ownership, not route or legacy ADMIN authority, for ordinary permanent delete', () => {
    expect(resolve({ uploadedById: 'owner', actor: actor({ id: 'route', effectiveAdminRoute: true }) }).permanentDelete).toBe(false);
    expect(resolve({ uploadedById: 'owner', actor: actor({ id: 'admin', legacyServiceAdmin: true }) }).permanentDelete).toBe(false);
    expect(resolve({ uploadedById: 'owner', actor: actor({ id: 'both', legacyServiceAdmin: true, effectiveAdminRoute: true }) }).permanentDelete).toBe(false);
    expect(resolve().permanentDelete).toBe(true);
  });

  it('denies every action when the actor is unknown or missing', () => {
    expect(resolve({ actor: null })).toMatchObject({ editMetadata: false, manageSharing: false, scope: 'ordinary' });
    expect(resolve({ actor: actor({ id: '', legacyServiceAdmin: true, effectiveAdminRoute: true }) })).toMatchObject({
      move: false, permanentDelete: false, scope: 'ordinary',
    });
  });

  it('keeps metadata, new versions and resharing independent of owner deletion', () => {
    const base = { uploadedById: 'owner', actor: actor({ id: 'recipient' }) };
    expect(resolve({ ...base, canEditMetadata: true })).toMatchObject({
      editMetadata: true, move: true, editContent: false, manageSharing: false, trash: false, permanentDelete: false,
    });
    expect(resolve({ ...base, canUploadVersion: true })).toMatchObject({ editContent: true, editMetadata: false, move: false, trash: false });
    expect(resolve({ ...base, manageSharing: true })).toMatchObject({ manageSharing: true, editMetadata: false, editContent: false, permanentDelete: false });
  });
});

describe('resolveDocumentActionCapabilities (reception scope)', () => {
  function receptionBase(overrides: Partial<DocumentActionCapabilityContext> = {}) {
    return context({
      reception: true,
      uploadedById: 'author',
      actor: actor(),
      receptionLiveSubmit: true,
      ...overrides,
    });
  }
  const resolveReception = (overrides: Partial<DocumentActionCapabilityContext> = {}) =>
    resolveDocumentActionCapabilities(receptionBase(overrides));

  it('grants the live author submit, move and owner deletion but not sharing', () => {
    expect(resolveReception()).toEqual({
      editMetadata: true,
      editContent: true,
      move: true,
      trash: true,
      restore: false,
      permanentDelete: true,
      manageSharing: false,
      scope: 'reception',
    });
  });

  it('denies every action to a peer participant even with live submit', () => {
    expect(resolveReception({ actor: actor({ id: 'peer' }), manageSharing: true })).toEqual({
      ...ALL_FALSE,
      scope: 'reception',
    });
  });

  it('denies owner, reviewer and global ADMIN who are not the live author', () => {
    const reviewer = resolveReception({ actor: actor({ id: 'reviewer', isLegacyPrivilegedEditor: true }) });
    const admin = resolveReception({
      actor: actor({ id: 'admin', legacyServiceAdmin: true, isLegacyPrivilegedEditor: true, effectiveAdminRoute: true }),
    });
    expect(reviewer).toMatchObject({ move: false, trash: false, permanentDelete: false });
    expect(admin).toMatchObject({ editMetadata: false, move: false, trash: false, permanentDelete: false });
  });

  it('denies the author whose live participation was revoked', () => {
    expect(resolveReception({ receptionLiveSubmit: false })).toEqual({
      ...ALL_FALSE,
      scope: 'reception',
    });
  });

  it('blocks withdraw, move and restore while an active review (including DRAFT) exists', () => {
    const caps = resolveReception({ receptionActiveReview: true });
    expect(caps).toMatchObject({ move: false, trash: false, restore: false });
    expect(caps.editMetadata).toBe(true);
    expect(caps.editContent).toBe(true);
  });

  it('blocks reception edits while a blocking workflow is active unless the author requested changes', () => {
    expect(resolveReception({ activeBlockingWorkflow: true })).toMatchObject({ editMetadata: false, editContent: false });
    expect(resolveReception({ activeBlockingWorkflow: true, changesRequestedByActor: true })).toMatchObject({
      editMetadata: true, editContent: true,
    });
  });

  it('never lets a legacy ADMIN bypass the reception workflow gate', () => {
    const caps = resolveReception({
      actor: actor({ id: 'author', legacyServiceAdmin: true, isLegacyPrivilegedEditor: true, effectiveAdminRoute: true }),
      activeBlockingWorkflow: true,
    });
    expect(caps.editMetadata).toBe(false);
    expect(caps.editContent).toBe(false);
  });

  it('allows a catalog-route reception author to permanent-delete without a legacy ADMIN role', () => {
    const caps = resolveReception({ actor: actor({ id: 'author', effectiveAdminRoute: true }) });
    expect(caps.permanentDelete).toBe(true);
  });

  it('denies reception permanent delete during review or without authorship', () => {
    expect(resolveReception({ actor: actor({ id: 'author', effectiveAdminRoute: false }) }).permanentDelete).toBe(true);
    expect(resolveReception({ actor: actor({ id: 'author', effectiveAdminRoute: true }), receptionActiveReview: true }).permanentDelete).toBe(false);
    expect(resolveReception({ actor: actor({ id: 'other', effectiveAdminRoute: true }) }).permanentDelete).toBe(false);
  });

  it('fails closed for a broken origin where eligibility cannot be resolved', () => {
    const caps = resolveReception({ receptionLiveSubmit: false, manageSharing: true });
    expect(caps.scope).toBe('reception');
    expect(caps.manageSharing).toBe(false);
    expect(caps.editMetadata).toBe(false);
  });

  it('offers restore but not trash for a deleted reception document', () => {
    expect(resolveReception({ deleted: true })).toMatchObject({ trash: false, restore: true, move: false });
  });

  it('keeps sharing disabled even when an ordinary sharing grant is passed in', () => {
    expect(resolveReception({ manageSharing: true }).manageSharing).toBe(false);
  });
});
