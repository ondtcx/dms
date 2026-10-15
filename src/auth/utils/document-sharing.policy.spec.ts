import { canManageDocumentSharing, isSharingAdmin } from './document-sharing.policy';

describe('document sharing policy', () => {
  it.each(['user', 'rector', 'coordinador', 'vicerrector'])('does not elevate %s', (role) => {
    expect(canManageDocumentSharing({ uploadedById: 'owner' }, { id: 'other', role })).toBe(false);
    expect(canManageDocumentSharing({ uploadedById: 'owner' }, { id: 'owner', role })).toBe(true);
  });
  it.each([
    { receptionOriginDirectoryId: 7, directory: { receptionEnabled: false } },
    { receptionOriginDirectoryId: null, directory: { receptionEnabled: true } },
  ])('denies reception sharing regardless of uploader or administrator authority: %j', (protection) => {
    for (const user of [
      { id: 'owner', role: 'user' },
      { id: 'admin', role: 'admin' },
      { id: 'admin', role: 'user', roleAssignments: [{ role: { key: 'admin', isActive: true } }] },
    ]) {
      expect(canManageDocumentSharing({ uploadedById: 'owner', ...protection }, user)).toBe(false);
    }
  });
  it('accepts legacy and active catalog admin only', () => {
    expect(isSharingAdmin({ role: 'admin' })).toBe(true);
    expect(isSharingAdmin({ role: 'user', roleAssignments: [{ role: { key: 'admin', isActive: true } }] })).toBe(true);
    expect(isSharingAdmin({ role: 'user', roleAssignments: [{ role: { key: 'admin', isActive: false } }] })).toBe(false);
  });
  it('denies missing users and deleted documents', () => {
    expect(canManageDocumentSharing({ uploadedById: 'owner' }, null)).toBe(false);
    expect(canManageDocumentSharing({ uploadedById: 'owner', deletedAt: new Date() }, { id: 'owner' })).toBe(false);
  });
});
describe('private-owner sharing boundary', () => {
  it('does not grant administrators sharing authority over another owner document', () => {
    expect(canManageDocumentSharing({ uploadedById: 'owner' }, { id: 'other', role: 'admin' })).toBe(false);
  });
});
