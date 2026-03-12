import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class OnlyofficeService {
  constructor(private config: ConfigService) {}

  generateEditorConfig(
    document: {
      id: number;
      title: string;
      fileType: string;
      callbackHost: string;
    },
    user: { id: string; name: string },
  ) {
    const callbackHost = this.config.get('ONLYOFFICE_CALLBACK_HOST');
    const secret = this.config.get('ONLYOFFICE_SECRET');
    const fileToken = this.generateFileToken(document.id, secret);

    const config = {
      document: {
        fileType: document.fileType,
        key: `doc_${document.id}_${Date.now()}`,
        title: document.title,
        url: `${callbackHost}/api/onlyoffice/file/${document.id}?token=${fileToken}`,
        permissions: {
          edit: true,
          download: true,
        },
      },
      editorConfig: {
        callbackUrl: `${callbackHost}/api/onlyoffice/callback/${document.id}`,
        user: {
          id: user.id,
          name: user.name,
        },
        lang: 'es',
        mode: 'edit',
      },
      documentType: this.getDocumentType(document.fileType),
    };

    return config;
  }

  generateFileToken(documentId: number, secret: string): string {
    const cleanSecret = secret.trim();

    return jwt.sign(
      { documentId }, // ← formato simple, sin "payload: {}"
      cleanSecret,
      { algorithm: 'HS256', expiresIn: 86400 }, // 24 horas
    );
  }

  verifyFileToken(
    token: string,
    secret: string,
  ): { documentId: number } | null {
    try {
      const payload = jwt.verify(token, secret) as { documentId: number };
      return { documentId: payload.documentId };
    } catch {
      return null;
    }
  }

  private getDocumentType(fileType: string): string {
    const wordTypes = ['doc', 'docx', 'odt', 'txt', 'rtf'];
    const cellTypes = ['xls', 'xlsx', 'ods', 'csv'];
    const slideTypes = ['ppt', 'pptx', 'odp'];
    if (wordTypes.includes(fileType)) return 'word';
    if (cellTypes.includes(fileType)) return 'cell';
    if (slideTypes.includes(fileType)) return 'slide';
    return 'word';
  }
}
