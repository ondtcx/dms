import { AuthorizationService } from './authorization.service';

describe('AuthorizationService', () => {
  it('re-reads active assignments so revocation takes effect immediately', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({
        role: 'user',
        roleAssignments: [{ role: { key: 'editor', isActive: true, permissions: [] } }],
      }) },
    };
    const service = new AuthorizationService(prisma);
    await expect(service.hasPermission('u1', 'documents.write')).resolves.toBe(false);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});
