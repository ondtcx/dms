import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, unlinkSync, copyFileSync } from 'fs';
import { join, extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
import { UpdateSchoolYearDto } from './dto/update-school-year.dto';
import { UpdateAppearanceDto } from './dto/update-appearance.dto';
import { UpdateDocumentsDto } from './dto/update-documents.dto';
import { UpdateNotificationsDto } from './dto/update-notifications.dto';
import { UpdateSecurityDto } from './dto/update-security.dto';

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
  primaryColor: '#3b82f6',
  secondaryColor: '#10b981',
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

  async getSettings() {
    if (this.cache) return this.cache;

    let settings = await this.prisma.systemSettings.findUnique({
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
    return settings;
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

  async updateSchoolYear(dto: UpdateSchoolYearDto) {
    const current = await this.getSettings();
    const merged = { ...(current.schoolYear as object), ...dto };
    const updated = await this.prisma.systemSettings.update({
      where: { id: 1 },
      data: { schoolYear: merged },
    });
    this.cache = updated;
    return updated;
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

  async getMaxVersionsPerDocument(): Promise<number> {
    const s = await this.getSettings();
    return (s.documents as DocumentSettings).maxVersionsPerDocument ?? 10;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}
