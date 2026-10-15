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
        lastActivityAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        totpSecret: null,
        totpPendingSecret: null,
        totpEnabled: false,
        totpRecoveryCodeHashes: [],
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

  it('routes permission reads through the supplied transaction client, never the root connection', async () => {
    const root: any = {
      user: { findUnique: jest.fn().mockResolvedValue({
        role: 'user',
        authRevision: 1,
        roleAssignments: [{ role: { key: 'reviewer', isActive: true, permissions: [{ permission: { key: 'workflow.approve' } }] } }],
      }) },
    };
    const tx: any = { user: { findUnique: jest.fn().mockResolvedValue({
      role: 'user',
      authRevision: 1,
      roleAssignments: [],
    }) } };
    const service = new AuthorizationService(root);

    await expect((service as any).hasPermission('u1', 'workflow.approve', tx)).resolves.toBe(false);
    expect(tx.user.findUnique).toHaveBeenCalledTimes(1);
    expect(root.user.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed when the final transaction loses the mapping that granted the permission', async () => {
    const root: any = {
      user: { findUnique: jest.fn().mockResolvedValue({
        role: 'admin',
        authRevision: 1,
        roleAssignments: [{ role: { key: 'reviewer', isActive: true, permissions: [{ permission: { key: 'workflow.approve' } }] } }],
      }) },
    };
    const tx: any = { user: { findUnique: jest.fn().mockResolvedValue({
      role: 'admin',
      authRevision: 2,
      roleAssignments: [],
    }) } };
    const service = new AuthorizationService(root);

    await expect(service.hasPermission('u1', 'workflow.approve')).resolves.toBe(true);
    await expect((service as any).hasPermission('u1', 'workflow.approve', tx)).resolves.toBe(false);
    expect(root.user.findUnique).toHaveBeenCalledTimes(1);
  });
});
