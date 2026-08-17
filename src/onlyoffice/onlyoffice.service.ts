import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import PizZip from 'pizzip';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ThumbnailService } from '../document/thumbnail.service';
import { CreateBlankDocumentDto } from './dto/create-blank-document.dto';

@Injectable()
export class OnlyofficeService {
  constructor(
    private config: ConfigService,
    private storage: StorageService,
    private prisma: PrismaService,
    private thumbnailService: ThumbnailService,
  ) {}

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

  async checkHealth(): Promise<{ available: boolean }> {
    const onlyofficeUrl = this.config.get<string>('ONLYOFFICE_URL');
    if (!onlyofficeUrl?.trim()) {
      return { available: false };
    }

    let healthcheckUrl: string;
    try {
      const parsedUrl = new URL(onlyofficeUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { available: false };
      }
      healthcheckUrl = `${onlyofficeUrl.replace(/\/+$/, '')}/healthcheck`;
    } catch {
      return { available: false };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(healthcheckUrl, {
        signal: controller.signal,
      });
      return { available: response.status === 200 };
    } catch {
      return { available: false };
    } finally {
      clearTimeout(timeout);
    }
  }

  async createBlankDocument(dto: CreateBlankDocumentDto, userId: string) {
    const { title, fileType, categoryId, courseId, documentTypeId } = dto;
    const filename = `${title}.${fileType}`;
    const uniqueFilename = `${randomUUID()}.${fileType}`;
    const mimetype = this.getMimetype(fileType);

    // Build blank OOXML content and write to temp
    const content = this.buildBlankOoxml(fileType);
    const buffer = Buffer.from(content);
    const tempPath = join('./uploads/temp', uniqueFilename);
    fs.writeFileSync(tempPath, buffer);

    // Move to structured storage path
    const storageLocation = this.storage.generateStructuredPath(
      userId,
      categoryId ?? null,
      uniqueFilename,
    );
    this.storage.moveFile(tempPath, storageLocation.path);

    // Calculate checksum
    const checksum = await this.storage.calculateFileHash(storageLocation.path);

    const currentYear = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true, isActive: true },
      select: { id: true },
    });

    // Create document record
    const document = await this.prisma.document.create({
      data: {
        categoryId: categoryId ?? null,
        documentTypeId: documentTypeId ?? null,
        isPublic: false,
        uploadedById: userId,
        currentVersion: 1,
        versions: {
          create: {
            version: 1,
            filename,
            mimetype,
            storedName: uniqueFilename,
            path: storageLocation.path,
            size: buffer.length,
            checksumSHA256: checksum,
            comment: 'Created in editor',
            createdById: userId,
            source: 'UPLOAD_INICIAL',
          },
        },
        ...(courseId !== undefined || currentYear?.id
          ? {
              academic: {
                create: {
                  ...(courseId !== undefined ? { courseId } : {}),
                  ...(currentYear?.id
                    ? { academicYearId: currentYear.id }
                    : {}),
                },
              },
            }
          : {}),
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
          },
        },
      },
    });

    // Generate thumbnail in background
    this.thumbnailService
      .regenerateThumbnail(storageLocation.path, document.id, mimetype)
      .catch(() => {});

    return document;
  }

  generateFileToken(documentId: number, secret: string): string {
    const cleanSecret = secret.trim();

    return jwt.sign({ documentId }, cleanSecret, {
      algorithm: 'HS256',
      expiresIn: 86400,
    });
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

  private getMimetype(fileType: string): string {
    const map: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    return map[fileType] ?? 'application/octet-stream';
  }

  private buildBlankOoxml(fileType: 'docx' | 'xlsx' | 'pptx'): Buffer {
    const zip = new PizZip();

    if (fileType === 'docx') {
      zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
          `</Types>`,
      );
      zip.file(
        '_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
          `<w:body><w:p/></w:body>` +
          `</w:document>`,
      );
      zip.file(
        'word/_rels/document.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
      );
    } else if (fileType === 'xlsx') {
      zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `</Types>`,
      );
      zip.file(
        '_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'xl/workbook.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>` +
          `</workbook>`,
      );
      zip.file(
        'xl/_rels/workbook.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'xl/worksheets/sheet1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
      );
    } else {
      // pptx
      zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
          `<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>` +
          `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
          `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
          `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
          `</Types>`,
      );
      zip.file(
        '_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'ppt/presentation.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
          `<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>` +
          `<p:sldSz cx="9144000" cy="6858000"/>` +
          `<p:notesSz cx="6858000" cy="9144000"/>` +
          `</p:presentation>`,
      );
      zip.file(
        'ppt/_rels/presentation.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>` +
          `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'ppt/slides/slide1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<p:cSld><p:spTree>` +
          `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
          `<p:grpSpPr/>` +
          `</p:spTree></p:cSld>` +
          `</p:sld>`,
      );
      zip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'ppt/slideLayouts/slideLayout1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" type="blank">` +
          `<p:cSld name="Blank"><p:spTree>` +
          `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
          `<p:grpSpPr/>` +
          `</p:spTree></p:cSld>` +
          `</p:sldLayout>`,
      );
      zip.file(
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'ppt/slideMasters/slideMaster1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<p:cSld><p:spTree>` +
          `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
          `<p:grpSpPr/>` +
          `</p:spTree></p:cSld>` +
          `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
          `</p:sldMaster>`,
      );
      zip.file(
        'ppt/slideMasters/_rels/slideMaster1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'ppt/theme/theme1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">` +
          `<a:themeElements>` +
          `<a:clrScheme name="Office"><a:dk1><a:sysClr lastClr="000000" val="windowText"/></a:dk1><a:lt1><a:sysClr lastClr="FFFFFF" val="window"/></a:lt1>` +
          `<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>` +
          `<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>` +
          `<a:accent3><a:srgbClr val="A9D18E"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>` +
          `<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>` +
          `<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>` +
          `</a:clrScheme>` +
          `<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
          `<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
          `<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
          `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>` +
          `<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>` +
          `<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>` +
          `<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>` +
          `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle>` +
          `<a:effectStyle><a:effectLst/></a:effectStyle>` +
          `<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
          `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
          `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>` +
          `</a:fmtScheme>` +
          `</a:themeElements>` +
          `</a:theme>`,
      );
    }

    return Buffer.from(zip.generate({ type: 'nodebuffer' }));
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
