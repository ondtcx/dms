import { AuthorizationService, AuthorizationProfile } from './authorization.service';

describe('AuthorizationService', () => {
  it('defines the complete login/profile payload with the password-free user type', () => {
    const profile: AuthorizationProfile = {
      user: {
        id: 'u1',
        email: 'u1@example.com',
        name: 'User One',
        role: 'user',
        authRevision: 1,
        phoneNumber: null,
        position: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      roles: ['user'],
      permissions: [],
      authRevision: 1,
    };

    expect(profile.user).toEqual(expect.objectContaining({ id: 'u1', role: 'user' }));
  });

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

  it('returns only active catalog permissions and preserves legacy admin authority', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({
        role: 'admin',
        authRevision: 7,
        roleAssignments: [{ role: { key: 'reviewer', isActive: true, permissions: [
          { permission: { key: 'documents.read' } },
        ] } }],
      }) },
    };
    const service = new AuthorizationService(prisma);

    await expect(service.getAuthorization('admin-1')).resolves.toEqual({
      roles: ['admin', 'reviewer'],
      permissions: ['documents.read', 'roles.manage'],
      authRevision: 7,
    });
  });

  it('does not grant permissions through an inactive catalog role', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({
        role: 'user',
        authRevision: 3,
        roleAssignments: [],
      }) },
    };
    const service = new AuthorizationService(prisma);

    await expect(service.getAuthorization('u2')).resolves.toEqual({
      roles: ['user'],
      permissions: [],
      authRevision: 3,
    });
  });
});
