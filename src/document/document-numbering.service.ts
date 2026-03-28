import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Genera y asigna códigos de numeración institucional a documentos.
 *
 * Formato: [SECCION]-[CATEGORIA]-[AÑO]-[CORRELATIVO]
 * Ejemplo:  GA-PLN-2026-0042
 *
 * Los prefijos se leen dinámicamente desde Section.prefix / Category.prefix.
 * Si un modelo no tiene prefijo configurado, se deriva automáticamente del nombre.
 */
@Injectable()
export class DocumentNumberingService {
  private readonly logger = new Logger(DocumentNumberingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Asigna un documentNumber al documento indicado.
   * Idempotente: si ya tiene número asignado no hace nada.
   */
  async assignNumber(documentId: number, categoryId?: number | null): Promise<string> {
    // Verificar si ya tiene número
    const existing = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { documentNumber: true },
    });

    if (existing?.documentNumber) {
      return existing.documentNumber;
    }

    const year = new Date().getFullYear();
    const { sectionPrefix, categoryPrefix } = await this.resolvePrefixes(categoryId);
    const number = await this.nextNumber(sectionPrefix, categoryPrefix, year);
    const documentNumber = this.formatNumber(sectionPrefix, categoryPrefix, year, number);

    await this.prisma.document.update({
      where: { id: documentId },
      data: { documentNumber },
    });

    this.logger.log(`Documento #${documentId} → ${documentNumber}`);
    return documentNumber;
  }

  /**
   * Resuelve los prefijos de sección y categoría para un categoryId dado.
   * Prioridad: campo prefix de la BD → derivación automática del nombre.
   */
  async resolvePrefixes(categoryId?: number | null): Promise<{ sectionPrefix: string; categoryPrefix: string }> {
    if (!categoryId) {
      return { sectionPrefix: 'DOC', categoryPrefix: 'GEN' };
    }

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: {
        name: true,
        prefix: true,
        section: {
          select: { name: true, prefix: true },
        },
      },
    });

    if (!category) {
      return { sectionPrefix: 'DOC', categoryPrefix: 'GEN' };
    }

    const sectionPrefix = category.section?.prefix ?? this.derivePrefix(category.section?.name) ?? 'DOC';
    const categoryPrefix = category.prefix ?? this.derivePrefix(category.name) ?? 'GEN';

    return { sectionPrefix, categoryPrefix };
  }

  /**
   * Incrementa atómicamente el contador y retorna el siguiente número.
   * Usa upsert + update en una transacción para evitar condiciones de carrera.
   */
  private async nextNumber(sectionPrefix: string, categoryPrefix: string, year: number): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      // Crear el contador si no existe
      await tx.documentCounter.upsert({
        where: { sectionPrefix_categoryPrefix_year: { sectionPrefix, categoryPrefix, year } },
        create: { sectionPrefix, categoryPrefix, year, lastNumber: 0 },
        update: {},
      });

      // Incrementar y obtener el nuevo valor
      const updated = await tx.documentCounter.update({
        where: { sectionPrefix_categoryPrefix_year: { sectionPrefix, categoryPrefix, year } },
        data: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });

      return updated.lastNumber;
    });
  }

  /**
   * Formatea el número final: GA-PLN-2026-0042
   * El correlativo siempre tiene mínimo 4 dígitos con ceros a la izquierda.
   */
  private formatNumber(sectionPrefix: string, categoryPrefix: string, year: number, seq: number): string {
    const padded = seq.toString().padStart(4, '0');
    return `${sectionPrefix}-${categoryPrefix}-${year}-${padded}`;
  }

  /**
   * Deriva un prefijo corto a partir de un nombre.
   * Toma las letras iniciales de cada palabra (máx. 6 chars, todo mayúsculas).
   *
   * Ejemplos:
   *   "Gestión Académica"        → "GA"
   *   "Planificaciones"          → "PLN"
   *   "Actas y Reuniones"        → "AYR"
   *   "Constancias y Cert."      → "CYC"
   *   "Informes Académicos"      → "IA"
   */
  derivePrefix(name?: string | null): string | null {
    if (!name) return null;

    // Normalizar: quitar acentos, puntos y caracteres especiales
    const normalized = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // quitar diacríticos
      .replace(/[^a-zA-Z\s]/g, '')     // solo letras y espacios
      .trim();

    const words = normalized.split(/\s+/).filter(Boolean);

    if (words.length === 0) return null;

    // Si es una sola palabra, tomar las primeras 3 consonantes/letras significativas
    if (words.length === 1) {
      return words[0].substring(0, 3).toUpperCase();
    }

    // Si son múltiples palabras, tomar la primera letra de cada una (max 6)
    return words
      .map((w) => w[0])
      .join('')
      .substring(0, 6)
      .toUpperCase();
  }

  /**
   * Retorna el último número asignado para una combinación dada (sin incrementar).
   * Útil para mostrar el próximo número en la UI antes de crear el documento.
   */
  async previewNextNumber(categoryId?: number | null): Promise<string> {
    const year = new Date().getFullYear();
    const { sectionPrefix, categoryPrefix } = await this.resolvePrefixes(categoryId);

    const counter = await this.prisma.documentCounter.findUnique({
      where: { sectionPrefix_categoryPrefix_year: { sectionPrefix, categoryPrefix, year } },
      select: { lastNumber: true },
    });

    const next = (counter?.lastNumber ?? 0) + 1;
    return this.formatNumber(sectionPrefix, categoryPrefix, year, next);
  }
}
