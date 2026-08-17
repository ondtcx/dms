/**
 * Seed de documentos de ejemplo usando PrismaClient, sin servidor HTTP ni
 * escritura de archivos. Cada documento conserva únicamente los metadatos
 * necesarios para probar Document, DocumentVersion y DocumentTemplateData.
 */

import { DocumentVersionSource, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const documents = [
  ['Acta de Reunión de Personal', 'rector@colegio.edu', 'acta-consejo-docentes-enero-2026.pdf', 'Acta del Consejo de Docentes del primer lapso académico 2025-2026'],
  ['Acta de Reunión de Personal', 'rector@colegio.edu', 'acta-reunion-padres-primaria-feb-2026.pdf', 'Acta de reunión de padres y representantes de Primaria'],
  ['Constancia de Estudio', 'secretaria@colegio.edu', 'constancia-estudio-valentina-perez.pdf', 'Constancia de estudio de Valentina Sofía Pérez González'],
  ['Constancia de Estudio', 'secretaria@colegio.edu', 'constancia-estudio-santiago-ramirez.pdf', 'Constancia de estudio de Santiago Andrés Ramírez Torres'],
  ['Constancia de Buena Conducta', 'secretaria@colegio.edu', 'constancia-conducta-luis-garcia-2026.pdf', 'Constancia de buena conducta de Luis Fernando García Mendoza'],
  ['Memorándum Interno', 'rector@colegio.edu', 'memorandum-inicio-segundo-lapso-2026.pdf', 'Memorándum sobre inicio del segundo lapso académico'],
  ['Memorándum Interno', 'rector@colegio.edu', 'memorandum-informes-rendimiento-2026.pdf', 'Memorándum solicitando informes de rendimiento'],
  ['Memorándum Interno', 'vicerrector@colegio.edu', 'memorandum-protocolo-nee-2026.pdf', 'Memorándum sobre protocolo de atención a estudiantes con NEE'],
  ['Acta de Reunión de Personal', 'vicerrector@colegio.edu', 'acta-reunion-coordinacion-pedagogica-2026-001.pdf', 'Acta de reunión de coordinación pedagógica'],
  ['Informe Pedagógico de Grupo', 'coord.primaria@colegio.edu', 'informe-pedagogico-1er-grado-primer-lapso-2026.pdf', 'Informe pedagógico de grupo de 1° Grado'],
  ['Solicitud de Permiso Laboral', 'prof.biologia@colegio.edu', 'solicitud-permiso-adrian-perez-marzo-2026.pdf', 'Solicitud de permiso para curso de actualización'],
  ['Reporte de Incidencia Escolar', 'maestro.1p@colegio.edu', 'reporte-incidencia-feb-2026-003.pdf', 'Reporte de incidencia menor en cancha deportiva'],
  ['Planificación Semanal de Clase', 'maestro.3p@colegio.edu', 'planificacion-semanal-3er-grado-matematica-feb-2026.pdf', 'Planificación semanal de Matemática de 3° Grado'],
  ['Proyecto Pedagógico de Aula', 'maestro.5p@colegio.edu', 'proyecto-pedagogico-el-agua-5to-grado-2026.pdf', 'Proyecto pedagógico de aula sobre el agua'],
  ['Plan de Evaluación Trimestral', 'prof.matematica@colegio.edu', 'plan-evaluacion-matematica-3anio-2do-trimestre-2026.pdf', 'Plan de evaluación trimestral de Matemática'],
  ['Acta de Consejo de Grado', 'coord.secundaria@colegio.edu', 'acta-consejo-grado-3anio-secundaria-primer-lapso-2026.pdf', 'Acta de Consejo de Grado de 3° Año'],
  ['Acta de Compromiso con Representantes', 'coord.primaria@colegio.edu', 'acta-compromiso-tomas-rivas-2do-grado-feb-2026.pdf', 'Acta de compromiso con representantes'],
  ['Certificado de Culminación de Estudios', 'secretaria@colegio.edu', 'certificado-culminacion-gabriela-moreno-2025.pdf', 'Certificado de culminación de estudios'],
  ['Informe de Rendimiento Académico Individual', 'prof.lengua@colegio.edu', 'informe-rendimiento-mateo-gutierrez-2anio-primer-lapso-2026.pdf', 'Informe de rendimiento académico individual'],
  ['Boletín de Calificaciones', 'maestro.4p@colegio.edu', 'boletin-calificaciones-isabella-rojas-4to-grado-primer-lapso-2026.pdf', 'Boletín de calificaciones'],
  ['Circular Informativa', 'rector@colegio.edu', 'circular-calendario-evaluaciones-segundo-lapso-2026.pdf', 'Circular informativa sobre calendario de evaluaciones'],
  ['Comunicado a Representantes', 'maestro.6p@colegio.edu', 'comunicado-feria-ciencias-lucia-campos-6to-grado-2026.pdf', 'Comunicado a representantes sobre feria de ciencias'],
  ['Oficio', 'rector@colegio.edu', 'oficio-solicitud-homologacion-titulos-2026-001.pdf', 'Oficio de solicitud de homologación de títulos docentes'],
  ['Oficio', 'secretaria@colegio.edu', 'oficio-solicitud-jornada-vacunacion-2026-002.pdf', 'Oficio de solicitud de jornada de vacunación escolar'],
  ['Oficio de Designación Docente', 'rector@colegio.edu', 'oficio-designacion-comision-evaluadora-secundaria-2026-001.pdf', 'Oficio de designación de comisión evaluadora'],
  ['Oficio de Remisión de Documentos', 'secretaria@colegio.edu', 'oficio-remision-expediente-tomas-fuentes-traslado-2026-001.pdf', 'Oficio de remisión de expediente académico'],
  ['Contrato de Inscripción Estudiantil', 'rector@colegio.edu', 'contrato-inscripcion-nicolas-medina-1anio-secundaria-2025-2026.pdf', 'Contrato de inscripción estudiantil'],
  ['Recibo de Pago de Aranceles', 'secretaria@colegio.edu', 'recibo-aranceles-santiago-ramirez-feb-2026.pdf', 'Recibo de pago de aranceles'],
  ['Presupuesto de Actividad Escolar', 'secretaria@colegio.edu', 'presupuesto-excursion-fin-anio-primaria-2026.pdf', 'Presupuesto de excursión de fin de año'],
] as const;

async function main() {
  const [users, templates, academicYear] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true } }),
    prisma.documentTemplate.findMany({ select: { id: true, name: true, categoryId: true } }),
    prisma.academicYear.findFirst({ where: { isCurrent: true, isActive: true }, select: { id: true } }),
  ]);

  const userIdByEmail = Object.fromEntries(users.map((user) => [user.email, user.id]));
  const templateByName = Object.fromEntries(templates.map((template) => [template.name, template]));

  for (const [templateName, userEmail, filename, description] of documents) {
    const uploadedById = userIdByEmail[userEmail];
    const template = templateByName[templateName];
    if (!uploadedById || !template) {
      console.warn(`Skipping ${filename}: missing user or document template.`);
      continue;
    }

    const existing = await prisma.document.findFirst({
      where: { uploadedById, description, deletedAt: null },
      select: { id: true },
    });
    if (existing) continue;

    const size = Buffer.byteLength(JSON.stringify({ filename, description }), 'utf8');
    const document = await prisma.document.create({
      data: {
        description,
        isPublic: false,
        uploadedById,
        categoryId: template.categoryId,
        versions: {
          create: {
            version: 1,
            filename,
            storedName: filename,
            mimetype: 'application/pdf',
            size,
            path: `uploads/${filename}`,
            createdById: uploadedById,
            source: DocumentVersionSource.UPLOAD_INICIAL,
          },
        },
        templateData: {
          create: { templateId: template.id, formData: { filename, description } },
        },
        ...(academicYear ? { academic: { create: { academicYearId: academicYear.id } } } : {}),
      },
      select: { id: true },
    });

    console.log(`Created document ${document.id}: ${description}`);
  }

  console.log(`Document seed complete: ${documents.length} definitions checked.`);
}

main()
  .catch((error) => {
    console.error('Document seed failed:', error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
