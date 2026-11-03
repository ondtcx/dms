import * as fs from 'fs';
import * as path from 'path';
import type { SettingsService } from '../settings/settings.service';

export interface InstitutionMetadata {
  institutionName: string | null;
  institutionLogo: string | null;
  institutionAddress: string | null;
  institutionPhone: string | null;
  institutionEmail: string | null;
  institutionWebsite: string | null;
  schoolYearName: string | null;
}

export async function getInstitutionMetadata(
  settingsService: SettingsService,
): Promise<InstitutionMetadata> {
  const settings = await settingsService.getSettings();
  const institution = settings.institution as any;
  const schoolYear = settings.schoolYear as any;

  let institutionLogo: string | null = null;
  if (institution?.logoPath) {
    const relativePath = institution.logoPath.replace('/files/', '');
    const fsPath = path.join(process.cwd(), 'uploads', relativePath);
    if (fs.existsSync(fsPath)) {
      const ext = path.extname(fsPath).toLowerCase().replace('.', '');
      const mimeType =
        ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      institutionLogo = `data:${mimeType};base64,${fs.readFileSync(fsPath).toString('base64')}`;
    }
  }

  return {
    institutionName: institution?.name || null,
    institutionLogo,
    institutionAddress: institution?.address || null,
    institutionPhone: institution?.phone || null,
    institutionEmail: institution?.email || null,
    institutionWebsite: institution?.website || null,
    schoolYearName: schoolYear?.name || null,
  };
}

export function buildInstitutionContext(metadata: InstitutionMetadata) {
  return {
    nombre: metadata.institutionName ?? '',
    logo: metadata.institutionLogo ?? '',
    direccion: metadata.institutionAddress ?? '',
    telefono: metadata.institutionPhone ?? '',
    email: metadata.institutionEmail ?? '',
    sitioWeb: metadata.institutionWebsite ?? '',
  };
}
