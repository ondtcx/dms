import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { UserRole } from '../auth/role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

jest.mock('fs', () => ({ existsSync: jest.fn().mockReturnValue(true), mkdirSync: jest.fn() }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

const currentYear = {
  name: '2026-2027',
  startDate: new Date('2026-09-01T00:00:00.000Z'),
  endDate: new Date('2027-06-30T00:00:00.000Z'),
  isActive: true,
};
const projectedYear = {
  ...currentYear,
  startDate: currentYear.startDate.toISOString(),
  endDate: currentYear.endDate.toISOString(),
};

const storedSettings = {
  id: 1,
  institution: { name: 'Colegio', logoPath: '/files/logo.png' },
  schoolYear: { name: '2025-2026', isActive: true },
  appearance: { primaryColor: '#123456', secondaryColor: '#654321', theme: 'light' },
  documents: { maxFileSizeMb: 50, versionRetentionDays: 30 },
  notifications: { emailEnabled: true, senderEmail: 'internal@example.com' },
  security: { sessionTimeoutMinutes: 480, maxLoginAttempts: 5, require2FA: true },
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-02'),
};

describe('authoritative retention policy', () => {
  it('does not reuse either worker cache after another worker extends retention', async () => {
    let documents = { versionRetentionDays: 30 };
    const prisma = { systemSettings: {
      findUnique: jest.fn(async () => ({ ...storedSettings, documents: { ...documents } })),
      update: jest.fn(async ({ data }) => { documents = data.documents; return { ...storedSettings, documents }; }),
    }, academicYear: { findFirst: jest.fn().mockResolvedValue(null) } } as any;
    const workerA = new SettingsService(prisma);
    const workerB = new SettingsService(prisma);
    await workerA.getSettings();
    await workerB.getSettings();
    await workerA.updateDocuments({ versionRetentionDays: 365 });
    expect(await (workerB as any).getAuthoritativeVersionRetentionDays()).toBe(365);
    expect(await (workerA as any).getAuthoritativeVersionRetentionDays()).toBe(365);
    expect(await workerB.getVersionRetentionDays()).toBe(365);
  });
  it.each([null, {}, { maxVersionsPerDocument: 1 }])('defaults missing configuration %j', async (documents) => {
    const service = new SettingsService({ systemSettings: { findUnique: jest.fn().mockResolvedValue({ documents }) } } as any);
    expect(await (service as any).getAuthoritativeVersionRetentionDays()).toBe(30);
  });
  it.each([null, 0, 3651, 1.5, '30', false])('fails closed on present malformed days %j', async (value) => {
    const service = new SettingsService({ systemSettings: { findUnique: jest.fn().mockResolvedValue({ documents: { versionRetentionDays: value } }) } } as any);
    expect(await (service as any).getAuthoritativeVersionRetentionDays()).toBeNull();
  });
});

describe('version retention settings fallback', () => {
  it.each([undefined, null, {}, { maxVersionsPerDocument: 1 }, { versionRetentionDays: 0 }, { versionRetentionDays: 3651 }, { versionRetentionDays: '1' }])('defaults invalid or missing JSON %j to 30', async (documents) => {
    const service = new SettingsService({
      systemSettings: { findUnique: jest.fn().mockResolvedValue({ ...storedSettings, documents }) },
      academicYear: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any);
    await expect((service as any).getVersionRetentionDays()).resolves.toBe(30);
    expect((await service.getSettings()).documents.versionRetentionDays).toBe(30);
  });
  it('uses global days independently of trash and legacy count', async () => {
    const service = new SettingsService({
      systemSettings: { findUnique: jest.fn().mockResolvedValue({ ...storedSettings, documents: { versionRetentionDays: 3650, trashRetentionDays: 1, maxVersionsPerDocument: 1 } }) },
      academicYear: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any);
    await expect((service as any).getVersionRetentionDays()).resolves.toBe(3650);
  });
});

describe('SettingsService authorization policy', () => {
  const prisma = {
    academicYear: { findFirst: jest.fn().mockResolvedValue(currentYear) },
    systemSettings: {
      findUnique: jest.fn().mockResolvedValue(storedSettings),
      create: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.academicYear.findFirst.mockResolvedValue(currentYear);
  });

  it('returns the full settings record to an ADMIN', async () => {
    const service = new SettingsService(prisma);

    await expect(service.getSettings({ role: UserRole.ADMIN })).resolves.toEqual({ ...storedSettings, schoolYear: projectedYear });
  });

  it('falls back to safe defaults when security settings are invalid', async () => {
    const service = new SettingsService({
      academicYear: prisma.academicYear,
      systemSettings: {
        findUnique: jest.fn().mockResolvedValue({ ...storedSettings, security: { sessionTimeoutMinutes: 0, maxLoginAttempts: 'invalid' } }),
      },
    } as any);

    await expect(service.getSessionTimeoutMinutes()).resolves.toBe(480);
    await expect(service.getMaxLoginAttempts()).resolves.toBe(5);
  });

  it('returns only public settings to a non-admin user', async () => {
    const service = new SettingsService(prisma);

    const result = await service.getSettings({ role: UserRole.PROFESOR });

    expect(result).toEqual({
      id: storedSettings.id,
      institution: storedSettings.institution,
      schoolYear: projectedYear,
      appearance: storedSettings.appearance,
      createdAt: storedSettings.createdAt,
      updatedAt: storedSettings.updatedAt,
    });
    expect(result).not.toHaveProperty('documents');
    expect(result).not.toHaveProperty('notifications');
    expect(result).not.toHaveProperty('security');
  });

  it('projects fresh catalog data on raw-cache hits without modifying legacy data', async () => {
    const service = new SettingsService(prisma);
    const first = await service.getSettings();
    expect(first).toEqual({ ...storedSettings, schoolYear: projectedYear });
    prisma.academicYear.findFirst.mockResolvedValue({ ...currentYear, name: '2027-2028' });

    const second = await service.getSettings({ role: UserRole.RECTOR });

    expect(second.schoolYear.name).toBe('2027-2028');
    expect(first.schoolYear.name).toBe('2026-2027');
    expect(second).not.toHaveProperty('security');
    expect(prisma.systemSettings.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.academicYear.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.academicYear.findFirst).toHaveBeenCalledWith({
      where: { isCurrent: true, isActive: true },
      select: { name: true, startDate: true, endDate: true, isActive: true },
    });
    expect(storedSettings.schoolYear).toEqual({ name: '2025-2026', isActive: true });
    expect((service as any).cache).toBe(storedSettings);
    expect(prisma.systemSettings.update).not.toHaveBeenCalled();
    expect(prisma.systemSettings.create).not.toHaveBeenCalled();
  });

  it('returns an empty inactive period when the catalog has no current active year', async () => {
    const service = new SettingsService(prisma);
    await service.getSettings();
    prisma.academicYear.findFirst.mockResolvedValue(null);

    expect((await service.getSettings()).schoolYear).toEqual({
      name: '', startDate: null, endDate: null, isActive: false,
    });
    expect(storedSettings.schoolYear.name).toBe('2025-2026');
  });

  it('projects a catalog year after initializing missing Settings without storing the projection', async () => {
    prisma.systemSettings.findUnique.mockResolvedValueOnce(null);
    prisma.systemSettings.create.mockResolvedValueOnce(storedSettings);
    const service = new SettingsService(prisma);

    expect(await service.getSettings()).toEqual({ ...storedSettings, schoolYear: projectedYear });
    expect(prisma.systemSettings.create.mock.calls[0][0].data.schoolYear).toEqual({
      name: '2025-2026', startDate: '2025-09-01', endDate: '2026-06-30', isActive: true,
    });
    expect((service as any).cache.schoolYear).toBe(storedSettings.schoolYear);
  });

  it('rejects obsolete writes with an actionable conflict and no persistence', async () => {
    const service = new SettingsService(prisma);
    await expect(service.updateSchoolYear({ name: 'Independent period' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateSchoolYear({ name: 'Independent period' })).rejects.toThrow(/academic-years/);
    expect(prisma.systemSettings.update).not.toHaveBeenCalled();
    expect(prisma.systemSettings.create).not.toHaveBeenCalled();
    expect(prisma.systemSettings.findUnique).not.toHaveBeenCalled();
  });
});

describe('SettingsController authorization metadata', () => {
  it('rejects non-admin school-year writes through the ADMIN-only backend guard', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SettingsController.prototype.updateSchoolYear)).toEqual([
      UserRole.ADMIN,
    ]);
  });
});
