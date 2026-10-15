import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ManageDocumentSharingDto, DocumentVisibilityDto, LegacyDocumentShareDto } from './manage-document-sharing.dto';
const errors = (type: any, body: any) => validateSync(plainToInstance(type, body), { whitelist: true, forbidNonWhitelisted: true });
describe('sharing DTOs', () => {
  it('accepts a positive concrete grant ID', () => {
    expect(errors(ManageDocumentSharingDto, { userId: 'recipient', grantId: 42 })).toEqual([]);
  });
  it.each([0, -1, 1.5, '42', true])('rejects invalid concrete grant ID %j', grantId => {
    expect(errors(ManageDocumentSharingDto, { userId: 'recipient', grantId }).length).toBeGreaterThan(0);
  });
  it.each([{}, { userId: 1 }, { userId: '' }, { userId: 'u', canEdit: 'true' }, { userId: 'u', isPublicLink: true }, { userId: 'u', role: 'admin' }])('rejects malformed or injected read grant %j', (body) => expect(errors(ManageDocumentSharingDto, body).length).toBeGreaterThan(0));
  it('accepts read recipient and boolean visibility', () => {
    expect(errors(ManageDocumentSharingDto, { userId: 'recipient' })).toEqual([]);
    expect(errors(ManageDocumentSharingDto, { userId: 'recipient', canEdit: true, comment: '<b>Revisar</b>' })).toEqual([]);
    expect(errors(ManageDocumentSharingDto, { userId: 'recipient', comment: 'x'.repeat(2001) }).length).toBeGreaterThan(0);
    expect(errors(ManageDocumentSharingDto, { userId: 'recipient', comment: 3 }).length).toBeGreaterThan(0);
    expect(errors(DocumentVisibilityDto, { isPublic: false })).toEqual([]);
    expect(errors(DocumentVisibilityDto, { isPublic: 'false' }).length).toBeGreaterThan(0);
  });
  it.each(['canEdit', 'canShare', 'canDownload', 'shareToken', 'isPublicLink', 'password', 'documentId', 'sharedById'])('rejects legacy injection %s', (key) => expect(errors(LegacyDocumentShareDto, { userId: 'u', [key]: true }).length).toBeGreaterThan(0));
  it('retains role and expiry fields', () => expect(errors(LegacyDocumentShareDto, { roleKey: 'editor', canView: true, expiresAt: '2030-01-01T00:00:00Z' })).toEqual([]));
});
