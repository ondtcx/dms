import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentNumberingService implements OnModuleInit {
  private readonly logger = new Logger(DocumentNumberingService.name);
  private readonly counterScope = 'DOC';
  private readonly typePrefixes: Record<string, string> = {
    oficio: 'OFI',
    'acta de reunion': 'ACT',
    'constancia de estudios': 'CON',
    'solicitud de permiso': 'SOL',
    memorando: 'MEM',
  };

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.syncExistingNumbers();
    } catch (error) {
      this.logger.error('No se pudo sincronizar la numeración documental al iniciar', error);
    }
  }

  async assignNumber(documentId: number, _categoryId?: number | null): Promise<string> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        documentNumber: true,
        documentDate: true,
        createdAt: true,
        documentType: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!document) {
      throw new Error(`Documento ${documentId} no encontrado para asignar número`);
    }

    const prefix = this.resolveTypePrefix(document.documentType?.name);
    const year = this.resolveYear(document.documentDate, document.createdAt);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.document.findUnique({
        where: { id: documentId },
        select: { documentNumber: true },
      });

      if (current?.documentNumber) {
        return current.documentNumber;
      }

      const sequence = await this.nextNumber(tx, prefix, year);
      const documentNumber = this.formatNumber(prefix, year, sequence);

      await tx.document.update({
        where: { id: documentId },
        data: { documentNumber },
      });

      this.logger.log(`Documento #${documentId} → ${documentNumber}`);
      return documentNumber;
    });
  }

  async previewNextNumber(documentTypeName?: string | null, referenceDate?: Date | null): Promise<string> {
    const prefix = this.resolveTypePrefix(documentTypeName);
    const year = this.resolveYear(referenceDate ?? null, null);

    const counter = await this.prisma.documentCounter.findUnique({
      where: {
        sectionPrefix_categoryPrefix_year: {
          sectionPrefix: prefix,
          categoryPrefix: this.counterScope,
          year,
        },
      },
      select: { lastNumber: true },
    });

    return this.formatNumber(prefix, year, (counter?.lastNumber ?? 0) + 1);
  }

  async syncExistingNumbers(): Promise<void> {
    const documents = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        documentNumber: true,
        documentDate: true,
        createdAt: true,
        documentType: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        { documentDate: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });

    if (documents.length === 0) {
      return;
    }

    const counters = new Map<string, number>();
    const updates: { id: number; documentNumber: string }[] = [];

    for (const document of documents) {
      const prefix = this.resolveTypePrefix(document.documentType?.name);
      const year = this.resolveYear(document.documentDate, document.createdAt);
      const key = `${prefix}:${year}`;
      const nextSequence = (counters.get(key) ?? 0) + 1;
      counters.set(key, nextSequence);

      const expectedNumber = this.formatNumber(prefix, year, nextSequence);
      if (document.documentNumber !== expectedNumber) {
        updates.push({ id: document.id, documentNumber: expectedNumber });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.documentCounter.deleteMany({
        where: {
          categoryPrefix: this.counterScope,
        },
      });

      for (const [key, lastNumber] of counters.entries()) {
        const [sectionPrefix, yearValue] = key.split(':');
        await tx.documentCounter.create({
          data: {
            sectionPrefix,
            categoryPrefix: this.counterScope,
            year: Number(yearValue),
            lastNumber,
          },
        });
      }

      for (const update of updates) {
        await tx.document.update({
          where: { id: update.id },
          data: { documentNumber: update.documentNumber },
        });
      }
    });

    if (updates.length > 0) {
      this.logger.log(`Numeración documental sincronizada en ${updates.length} documento(s)`);
    }
  }

  private async nextNumber(tx: any, prefix: string, year: number): Promise<number> {
    await tx.documentCounter.upsert({
      where: {
        sectionPrefix_categoryPrefix_year: {
          sectionPrefix: prefix,
          categoryPrefix: this.counterScope,
          year,
        },
      },
      create: {
        sectionPrefix: prefix,
        categoryPrefix: this.counterScope,
        year,
        lastNumber: 0,
      },
      update: {},
    });

    const updatedCounter = await tx.documentCounter.update({
      where: {
        sectionPrefix_categoryPrefix_year: {
          sectionPrefix: prefix,
          categoryPrefix: this.counterScope,
          year,
        },
      },
      data: {
        lastNumber: {
          increment: 1,
        },
      },
      select: {
        lastNumber: true,
      },
    });

    return updatedCounter.lastNumber;
  }

  private resolveTypePrefix(documentTypeName?: string | null): string {
    const normalizedName = this.normalizeName(documentTypeName);

    if (!normalizedName) {
      return 'DOC';
    }

    return this.typePrefixes[normalizedName] ?? this.derivePrefix(normalizedName) ?? 'DOC';
  }

  private resolveYear(documentDate?: Date | null, createdAt?: Date | null): number {
    return (documentDate ?? createdAt ?? new Date()).getFullYear();
  }

  private formatNumber(prefix: string, year: number, sequence: number): string {
    return `${prefix}-${year}-${sequence.toString().padStart(4, '0')}`;
  }

  private normalizeName(name?: string | null): string | null {
    if (!name) {
      return null;
    }

    const normalized = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z\s]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

    return normalized || null;
  }

  private derivePrefix(normalizedName: string): string | null {
    const words = normalizedName.split(' ').filter(Boolean);

    if (words.length === 0) {
      return null;
    }

    if (words.length === 1) {
      return words[0].slice(0, 3).toUpperCase();
    }

    return words
      .map((word) => word[0])
      .join('')
      .slice(0, 3)
      .toUpperCase();
  }
}
