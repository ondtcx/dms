import { runDemoSeed } from '../../prisma/seed-demo';
import { validateDemoSeedEnvironment } from './demo-seed';

describe('demo seed safety and data', () => {
  it('requires an explicit owned target marker matching the exact URL', () => {
    expect(() => validateDemoSeedEnvironment({ DEMO_MODE: '1', DATABASE_URL: 'postgresql://demo:demo@127.0.0.1:5432/dms_demo_1234567890abcdef', DEMO_ADMIN_PASSWORD: 'test' })).toThrow();
  });
  const env = {
    DEMO_MODE: '1',
    DATABASE_URL: 'postgresql://demo:demo@127.0.0.1:5432/dms_demo_1234567890abcdef',
    DEMO_ADMIN_PASSWORD: 'fictional-password-for-test',
    DEMO_OWNED_MARKER: 'visible-demo-smoke-v1',
    DEMO_OWNED_TARGET: 'postgresql://demo:demo@127.0.0.1:5432/dms_demo_1234567890abcdef',
  };

  it('fails before constructing a database client when the owned marker is missing', async () => {
    const createClient = jest.fn();
    await expect(runDemoSeed({ ...env, DEMO_OWNED_MARKER: '' }, createClient)).rejects.toThrow();
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each(['', 'postgresql://other'])('rejects a mismatched owned target', async (target) => {
    const createClient = jest.fn();
    await expect(runDemoSeed({ ...env, DEMO_OWNED_TARGET: target }, createClient)).rejects.toThrow();
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    { ...env, DEMO_MODE: '0' },
    { ...env, DATABASE_URL: 'postgresql://demo:demo@remote.test:5432/dms_demo_1234567890abcdef' },
    { ...env, DATABASE_URL: 'postgresql://demo:demo@127.0.0.1:5432/production' },
    { ...env, DATABASE_URL: 'postgresql://demo:demo@127.0.0.1:5432/dms_demo_1234567890abcdef?host=remote.test' },
    { ...env, DEMO_ADMIN_PASSWORD: '' },
  ])('rejects unsafe settings before database construction', async (settings) => {
    const createClient = jest.fn();
    await expect(runDemoSeed(settings, createClient)).rejects.toThrow();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('writes fictional seed data using the explicitly marked target', async () => {
    const tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 'admin-id' }) },
      role: { upsert: jest.fn().mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 2 }) },
      permission: { upsert: jest.fn().mockResolvedValueOnce({ id: 3 }).mockResolvedValueOnce({ id: 4 }) },
      rolePermission: { createMany: jest.fn().mockResolvedValue({}) },
      userRoleAssignment: { create: jest.fn().mockResolvedValue({}) },
      category: { create: jest.fn().mockResolvedValue({ id: 5 }) },
      documentType: { create: jest.fn().mockResolvedValue({}) },
    };
    const client = {
      $transaction: jest.fn(async (operation) => operation(tx)),
      $disconnect: jest.fn().mockResolvedValue(undefined),
    };
    const create = jest.fn().mockReturnValue(client);
    await runDemoSeed(env, create);
    expect(create).toHaveBeenCalledWith(env.DATABASE_URL);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'admin@example.test', role: 'admin', password: expect.not.stringContaining(env.DEMO_ADMIN_PASSWORD) }) }));
    expect(tx.role.upsert).toHaveBeenCalledTimes(2);
    expect(tx.permission.upsert).toHaveBeenCalledTimes(2);
    expect(tx.rolePermission.createMany).toHaveBeenCalledTimes(2);
    expect(tx.userRoleAssignment.create).toHaveBeenCalledTimes(1);
    expect(tx.category.create).toHaveBeenCalledTimes(1);
    expect(tx.documentType.create).toHaveBeenCalledTimes(1);
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('reuses migrated catalog entries and preserves existing permission links', async () => {
    const roles = new Map([['admin', { id: 11 }], ['user', { id: 12 }]]);
    const permissions = new Map([['users.manage', { id: 21 }], ['roles.manage', { id: 22 }]]);
    const links = new Set(['11:21']);
    const tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 'demo-admin' }), update: jest.fn() },
      role: {
        create: jest.fn(async ({ data }) => { if (roles.has(data.key)) throw new Error('duplicate role'); }),
        upsert: jest.fn(async ({ where, create }) => roles.get(where.key) ?? create),
      },
      permission: {
        create: jest.fn(async ({ data }) => { if (permissions.has(data.key)) throw new Error('duplicate permission'); }),
        upsert: jest.fn(async ({ where, create }) => permissions.get(where.key) ?? create),
      },
      rolePermission: {
        create: jest.fn(async ({ data }) => { if (links.has(`${data.roleId}:${data.permissionId}`)) throw new Error('duplicate link'); }),
        createMany: jest.fn(async ({ data, skipDuplicates }) => {
          expect(skipDuplicates).toBe(true);
          data.forEach((link) => links.add(`${link.roleId}:${link.permissionId}`));
        }),
      },
      userRoleAssignment: { create: jest.fn().mockResolvedValue({}) },
      category: { create: jest.fn().mockResolvedValue({ id: 5 }) },
      documentType: { create: jest.fn().mockResolvedValue({}) },
    };
    const client = { $transaction: jest.fn(async (operation) => operation(tx)), $disconnect: jest.fn() };

    await runDemoSeed(env, jest.fn().mockReturnValue(client));

    expect(tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'admin@example.test', name: 'Administrador de demostración', role: 'admin' }) });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.userRoleAssignment.create).toHaveBeenCalledWith({ data: { userId: 'demo-admin', roleId: 11 } });
    expect(links).toEqual(new Set(['11:21', '11:22']));
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('preserves the migrated default while creating a categorized demo type', async () => {
    const types = [{ id: 1, name: 'Documento general', categoryId: null, isDefault: true }];
    const tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 'admin-id' }) },
      role: { upsert: jest.fn().mockResolvedValue({ id: 1 }) },
      permission: { upsert: jest.fn().mockResolvedValue({ id: 2 }) },
      rolePermission: { createMany: jest.fn() },
      userRoleAssignment: { create: jest.fn() },
      category: { create: jest.fn().mockResolvedValue({ id: 5 }) },
      documentType: {
        create: jest.fn(async ({ data }) => {
          if (data.isDefault && types.some((type) => type.isDefault)) throw new Error('duplicate default');
          types.push({ id: 2, isDefault: false, ...data });
        }),
      },
    };
    const client = { $transaction: jest.fn(async (operation) => operation(tx)), $disconnect: jest.fn() };

    await runDemoSeed(env, jest.fn().mockReturnValue(client));

    expect(types.filter((type) => type.isDefault)).toEqual([{ id: 1, name: 'Documento general', categoryId: null, isDefault: true }]);
    expect(types).toContainEqual({ id: 2, name: 'Documento de demostración', categoryId: 5, isDefault: false });
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('propagates a mutation failure through the transaction and disconnects without committing', async () => {
    const error = new Error('seed mutation failed');
    const pending: string[] = [];
    const committed: string[] = [];
    const tx = {
      user: { create: jest.fn(async () => { pending.push('user'); return { id: 'admin-id' }; }) },
      role: { upsert: jest.fn().mockRejectedValue(error) },
    };
    const client = {
      $transaction: jest.fn(async (operation) => {
        const result = await operation(tx);
        committed.push(...pending);
        return result;
      }),
      $disconnect: jest.fn().mockResolvedValue(undefined),
    };

    await expect(runDemoSeed(env, jest.fn().mockReturnValue(client))).rejects.toBe(error);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(pending).toEqual(['user']);
    expect(committed).toEqual([]);
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });
});
