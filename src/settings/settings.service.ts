import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, unlinkSync, copyFileSync } from 'fs';
import { join, extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
import { UpdateSchoolYearDto } from './dto/update-school-year.dto';
import { UpdateAppearanceDto } from './dto/update-appearance.dto';
import { UpdateDocumentsDto } from './dto/update-documents.dto';
import { UpdateNotificationsDto } from './dto/update-notifications.dto';
import { UpdateSecurityDto } from './dto/update-security.dto';
import { UserRole } from '../auth/role.enum';
import { authoritativeRetentionDays, versionRetentionDays } from '../document/document-version-retention';
import { Prisma } from '@prisma/client';

export interface InstitutionSettings {
  name: string;
  logoPath: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

export interface SchoolYearSettings {
  name: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

export interface AppearanceSettings {
  primaryColor: string;
  secondaryColor: string;
  theme: 'light' | 'dark' | 'system';
}

export interface DocumentSettings {
  maxFileSizeMb: number;
  allowedMimeTypes: string[];
  trashRetentionDays: number;
  maxVersionsPerDocument: number;
  versionRetentionDays: number;
}

export interface NotificationSettings {
  emailEnabled: boolean;
  senderEmail: string | null;
  senderName: string | null;
}

export interface SecuritySettings {
  sessionTimeoutMinutes: number;
  maxLoginAttempts: number;
  require2FA: boolean;
}

export interface PublicSystemSettings {
  id: number;
  institution: InstitutionSettings;
  schoolYear: SchoolYearSettings;
  appearance: AppearanceSettings;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_INSTITUTION: InstitutionSettings = {
  name: 'Mi Institución',
  logoPath: null,
  address: null,
  phone: null,
  email: null,
  website: null,
};

const DEFAULT_SCHOOL_YEAR: SchoolYearSettings = {
  name: '2025-2026',
  startDate: '2025-09-01',
  endDate: '2026-06-30',
  isActive: true,
};

const DEFAULT_APPEARANCE: AppearanceSettings = {
  primaryColor: '#1e3a5f',
  secondaryColor: '#047857',
  theme: 'system',
};

const DEFAULT_DOCUMENTS: DocumentSettings = {
  maxFileSizeMb: 50,
  allowedMimeTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  trashRetentionDays: 30,
  maxVersionsPerDocument: 10,
  versionRetentionDays: 30,
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  emailEnabled: false,
  senderEmail: null,
  senderName: null,
};

const DEFAULT_SECURITY: SecuritySettings = {
  sessionTimeoutMinutes: 480,
  maxLoginAttempts: 5,
  require2FA: false,
};

@Injectable()
export class SettingsService {
  private cache: any | null = null;
  private readonly logoDir = join('./uploads', 'active', 'settings', 'logo');

  constructor(private readonly prisma: PrismaService) {
    if (!existsSync(this.logoDir)) {
      mkdirSync(this.logoDir, { recursive: true });
    }
  }

  async getSettings(user?: { role?: string }): Promise<any> {
    let settings = this.cache ?? await this.prisma.systemSettings.findUnique({
      where: { id: 1 },
    });

    if (!settings) {
      settings = await this.prisma.systemSettings.create({
        data: {
          institution: DEFAULT_INSTITUTION as any,
          schoolYear: DEFAULT_SCHOOL_YEAR as any,
          appearance: DEFAULT_APPEARANCE as any,
          documents: DEFAULT_DOCUMENTS as any,
          notifications: DEFAULT_NOTIFICATIONS as any,
          security: DEFAULT_SECURITY as any,
        },
      });
    }

    this.cache = settings;
    const currentYear = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true, isActive: true },
      select: { name: true, startDate: true, endDate: true, isActive: true },
    });
    const schoolYear: SchoolYearSettings = currentYear
      ? {
          name: currentYear.name,
          startDate: currentYear.startDate.toISOString(),
          endDate: currentYear.endDate.toISOString(),
          isActive: currentYear.isActive,
        }
      : { name: '', startDate: null, endDate: null, isActive: false };

    const documents = {
      ...(settings.documents as object ?? {}),
      versionRetentionDays: versionRetentionDays(settings.documents?.versionRetentionDays),
    };
    return this.filterSettingsForUser({ ...settings, documents, schoolYear }, user);
  }

  private filterSettingsForUser(settings: any, user?: { role?: string }): any {
    // Los consumidores internos omiten el usuario y requieren el registro completo.
    if (!user || user.role === UserRole.ADMIN) return settings;

    return {
      id: settings.id,
      institution: settings.institution,
      schoolYear: settings.schoolYear,
      appearance: settings.appearance,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    } satisfies PublicSystemSettings;
  }

  async updateInstitution(dto: UpdateInstitutionDto) {
    const current = await this.getSettings();
    const merged = { ...(current.institution as object), ...dto };
    const updated = await this.prisma.systemSettings.update({
      where: { id: 1 },
      data: { institution: merged },
    });
    this.cache = updated;
    return updated;
  }

  async updateLogo(file: Express.Multer.File): Promise<{ logoPath: string }> {
    const current = await this.getSettings();
    const institution = current.institution as InstitutionSettings;

    // Eliminar logo anterior si existe
    if (institution.logoPath) {
      const oldPath = join(
        './uploads',
        institution.logoPath.replace('/files/', ''),
      );
      if (existsSync(oldPath)) {
        unlinkSync(oldPath);
      }
    }

    const ext = extname(file.originalname);
    const filename = `logo_${Date.now()}${ext}`;
    const dest = join(this.logoDir, filename);

    // Asegurar que el directorio existe antes de copiar
    if (!existsSync(this.logoDir)) {
      mkdirSync(this.logoDir, { recursive: true });
    }

    // Copiar a destino final y eliminar el temporal (más confiable que rename en Windows)
    copyFileSync(file.path, dest);
    unlinkSync(file.path);

    const logoPath = `/files/active/settings/logo/${filename}`;
    const merged = { ...(institution as object), logoPath };

    const updated = await this.prisma.systemSettings.update({
      where: { id: 1 },
      data: { institution: merged },
    });
    this.cache = updated;
    return { logoPath };
  }

  async updateSchoolYear(_dto: UpdateSchoolYearDto): Promise<never> {
    throw new ConflictException(
      'El año lectivo se administra en Años lectivos. Usa /dashboard/academic-years para actualizar el catálogo y seleccionar el año actual.',
    );
  }

  async updateAppearance(dto: UpdateAppearanceDto) {
    const current = await this.getSettings();
    const merged = { ...(current.appearance as object), ...dto };
    const updated = await this.prisma.systemSettings.update({
      where: { id: 1 },
      data: { appearance: merged },
    });
    this.cache = updated;
    return updated;
  }

  async updateDocuments(dto: UpdateDocumentsDto) {
    const current = await this.getSettings();
    const merged = { ...(current.documents as object), ...dto };
    const updated = await this.prisma.systemSettings.update({
      where: { id: 1 },
      data: { documents: merged },
    });
    this.cache = updated;
    return updated;
  }

  async updateNotifications(dto: UpdateNotificationsDto) {
    const current = await this.getSettings();
    const merged = { ...(current.notifications as object), ...dto };
    const updated = await this.prisma.systemSettings.update({
      where: { id: 1 },
      data: { notifications: merged },
    });
    this.cache = updated;
    return updated;
  }

  async updateSecurity(dto: UpdateSecurityDto) {
    const current = await this.getSettings();
    const merged = { ...(current.security as object), ...dto };
    const updated = await this.prisma.systemSettings.update({
      where: { id: 1 },
      data: { security: merged },
    });
    this.cache = updated;
    return updated;
  }

  // Helpers para otros servicios
  async getTrashRetentionDays(): Promise<number> {
    const s = await this.getSettings();
    return (s.documents as DocumentSettings).trashRetentionDays ?? 30;
  }

  async getMaxFileSizeMb(): Promise<number> {
    const s = await this.getSettings();
    return (s.documents as DocumentSettings).maxFileSizeMb ?? 50;
  }

  async getAllowedMimeTypes(): Promise<string[]> {
    const s = await this.getSettings();
    return (s.documents as DocumentSettings).allowedMimeTypes ?? [];
  }

  async getVersionRetentionDays(): Promise<number> {
    // Historial y respuestas de conservación también reflejan cambios de otros procesos.
    return (await this.getAuthoritativeVersionRetentionDays()) ?? 30;
  }

  async getAuthoritativeVersionRetentionDays(
    database: Pick<Prisma.TransactionClient, 'systemSettings'> = this.prisma,
  ): Promise<number | null> {
    // No consultar ni modificar la caché local para una decisión destructiva.
    const settings = await database.systemSettings.findUnique({
      where: { id: 1 }, select: { documents: true },
    });
    return authoritativeRetentionDays(settings?.documents);
  }

  async getMaxVersionsPerDocument(): Promise<number> {
    const s = await this.getSettings();
    return (s.documents as DocumentSettings).maxVersionsPerDocument ?? 10;
  }

  async getSessionTimeoutMinutes(): Promise<number> {
    const settings = await this.getSettings();
    const value = (settings.security as Partial<SecuritySettings> | undefined)?.sessionTimeoutMinutes;
    return this.validPositiveInteger(value) ? value : DEFAULT_SECURITY.sessionTimeoutMinutes;
  }

  async getMaxLoginAttempts(): Promise<number> {
    const settings = await this.getSettings();
    const value = (settings.security as Partial<SecuritySettings> | undefined)?.maxLoginAttempts;
    return this.validPositiveInteger(value) ? value : DEFAULT_SECURITY.maxLoginAttempts;
  }

  private validPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}
