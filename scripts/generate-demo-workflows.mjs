/**
 * Generates a realistic institutional demo on the current database.
 *
 * Usage:
 *   node scripts/generate-demo-workflows.mjs --dry-run
 *   node scripts/generate-demo-workflows.mjs
 *   node scripts/generate-demo-workflows.mjs --reset
 *
 * The script uses the running API for document creation and state transitions
 * so it exercises the real authoring renderer, review flow, numbering, audit
 * trail and notifications. Dates are backdated through Prisma afterwards so the
 * demo looks like an institution that has been operating for months.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendDir, '..');
const sampleDir = path.join(repoRoot, 'doc-examples', 'school-samples');
const API = process.env.DEMO_API_URL ?? 'http://localhost:3001/api';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo123!';
const dryRun = process.argv.includes('--dry-run');
const reset = process.argv.includes('--reset');
const prisma = new PrismaClient();

const nestFormData = (flat) => {
  const nested = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let cursor = nested;
    for (let index = 0; index < parts.length - 1; index += 1) {
      cursor[parts[index]] = cursor[parts[index]] ?? {};
      cursor = cursor[parts[index]];
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return nested;
};

const tiptap = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs
    .filter(Boolean)
    .map((text) => ({
      type: 'paragraph',
      content: text ? [{ type: 'text', text }] : [],
    })),
});

const firmanteSecretaria = {
  'firmante.nombre': 'Fabian Díaz',
  'firmante.cargo': 'Secretario Académico',
};
const firmanteRectora = {
  'firmante.nombre': 'Erika Ramirez',
  'firmante.cargo': 'Rectora General',
};
const firmanteVicerrector = {
  'firmante.nombre': 'Jefferson Vaca',
  'firmante.cargo': 'Vicerrector Académico',
};

const authoringDocuments = [
  {
    template: 'Oficio institucional',
    name: 'Oficio de designación de la comisión de evaluación',
    description:
      'Designación de la comisión de evaluación del segundo quimestre 2026-2027.',
    creator: 'secretaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'EMITTED',
    originDate: '2026-09-08',
    formData: {
      'destinatario.nombre': 'Lcda. Erika Ramirez',
      'destinatario.cargo': 'Rectora General',
      'documento.asunto':
        'Designación de la comisión de evaluación del segundo quimestre',
      contenido: tiptap(
        'Por medio del presente oficio me permito informar a usted que, en sesión ordinaria del Consejo Ejecutivo realizada el 5 de septiembre de 2026, se conformó la comisión encargada de evaluar los procesos académicos del segundo quimestre.',
        'La comisión estará integrada por la Vicerrectora Académica, la Coordinadora de Primaria y el Coordinador de Secundaria. Su labor iniciará el 15 de septiembre y presentará el informe final hasta el 30 de noviembre de 2026.',
        'Solicito a los miembros de la comisión remitir sus observaciones a la Secretaría Académica con cinco días hábiles de anticipación a cada sesión.',
      ),
      ...firmanteSecretaria,
    },
  },
  {
    template: 'Oficio institucional',
    name: 'Oficio de solicitud de mantenimiento del laboratorio',
    description:
      'Solicitud de mantenimiento preventivo de equipos del laboratorio de ciencias.',
    creator: 'coord.secundaria@colegio.edu',
    reviewer: 'vicerrector@colegio.edu',
    state: 'ARCHIVED',
    originDate: '2026-09-12',
    formData: {
      'destinatario.nombre': 'Ing. Jefferson Vaca',
      'destinatario.cargo': 'Vicerrector Académico',
      'documento.asunto':
        'Solicitud de mantenimiento preventivo del laboratorio de ciencias',
      contenido: tiptap(
        'Luego del inventario realizado el 9 de septiembre de 2026, se identificaron seis microscopios y dos balanzas que requieren mantenimiento preventivo. Los equipos presentan descalibración y desgaste en los mecanismos de enfoque.',
        'Solicito autorizar la contratación del servicio técnico especializado para garantizar la seguridad de los estudiantes y la continuidad de las prácticas de Biología y Química.',
      ),
      ...firmanteVicerrector,
    },
  },
  {
    template: 'Oficio institucional',
    name: 'Oficio de invitación al acto cívico del 9 de octubre',
    description:
      'Invitación a representantes y autoridades al acto cívico de conmemoración.',
    creator: 'secretaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'APPROVED',
    originDate: '2026-10-01',
    formData: {
      'destinatario.nombre': 'Sr. Luis Medina',
      'destinatario.cargo': 'Presidente del Comité de Padres de Familia',
      'documento.asunto': 'Invitación al acto cívico del 9 de octubre de 2026',
      contenido: tiptap(
        'La Unidad Educativa "Vicente Fierro" tiene el honor de invitar a usted y a los representantes de los diferentes cursos al acto cívico de conmemoración de la independencia, que se realizará el viernes 9 de octubre de 2026 a las 08h00 en el patio central.',
        'Agradecemos confirmar su asistencia hasta el miércoles 7 de octubre a través de la Secretaría Académica.',
      ),
      ...firmanteSecretaria,
    },
  },
  {
    template: 'Oficio institucional',
    name: 'Oficio de solicitud de beca para estudiante de tercero',
    description:
      'Solicitud de beca de excelencia para la estudiante Daniela Cabrera.',
    creator: 'secretaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'IN_REVIEW',
    originDate: '2026-10-06',
    formData: {
      'destinatario.nombre': 'Lcda. Erika Ramirez',
      'destinatario.cargo': 'Rectora General',
      'documento.asunto':
        'Solicitud de beca de excelencia para la estudiante Daniela Cabrera',
      contenido: tiptap(
        'La estudiante Daniela Cabrera, del Tercero de Bachillerato paralelo B, ha mantenido un promedio de 9.82 durante los dos últimos quimestres y participó como delegada en el Modelo de Naciones Unidas organizado por la Universidad Estatal.',
        'El Comité de Becas recomienda conceder la beca de excelencia correspondiente al año lectivo 2026-2027, de acuerdo con el Reglamento Interno de Convivencia y el plan de incentivos académicos.',
      ),
      ...firmanteSecretaria,
    },
  },
  {
    template: 'Memorando institucional',
    name: 'Memorando de inicio del segundo quimestre',
    description:
      'Instrucciones para el inicio de actividades del segundo quimestre.',
    creator: 'rector@colegio.edu',
    reviewer: 'vicerrector@colegio.edu',
    state: 'EMITTED',
    originDate: '2026-08-28',
    formData: {
      'destinatario.nombre': 'Personal docente y administrativo',
      'destinatario.cargo': 'Todos los departamentos',
      'destinatario.dependencia': 'Unidad Educativa "Vicente Fierro"',
      'documento.asunto': 'Inicio de actividades del segundo quimestre',
      contenido: tiptap(
        'A partir del lunes 31 de agosto de 2026 se reanudan las actividades académicas del segundo quimestre. Las jornadas se desarrollarán en el horario habitual y con la presencia de todo el personal.',
        'Solicito a los coordinadores de área remitir las planificaciones actualizadas hasta el viernes 4 de septiembre y a los docentes registrar la asistencia en la plataforma institucional desde el primer día de clases.',
      ),
      ...firmanteRectora,
    },
  },
  {
    template: 'Memorando institucional',
    name: 'Memorando de entrega de planificaciones quimestrales',
    description:
      'Recordatorio para la entrega de planificaciones del segundo quimestre.',
    creator: 'vicerrector@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'IN_REVIEW',
    originDate: '2026-10-08',
    formData: {
      'destinatario.nombre': 'Coordinadores de área',
      'destinatario.cargo': 'Coordinación Académica',
      'destinatario.dependencia': 'Vicerrectorado Académico',
      'documento.asunto': 'Entrega de planificaciones quimestrales',
      contenido: tiptap(
        'De acuerdo con el cronograma institucional, la entrega de planificaciones del segundo quimestre se realizará hasta el viernes 16 de octubre de 2026. Cada coordinador deberá consolidar las planificaciones de su área en un solo archivo PDF.',
        'Las planificaciones deben incluir los aprendizajes priorizados, las adaptaciones curriculares y los instrumentos de evaluación previstos para el quimestre.',
      ),
      ...firmanteVicerrector,
    },
  },
  {
    template: 'Memorando institucional',
    name: 'Memorando de conformación de la comisión de titulación',
    description:
      'Conformación de la comisión para el proceso de titulación 2026-2027.',
    creator: 'rector@colegio.edu',
    reviewer: 'vicerrector@colegio.edu',
    state: 'CHANGES_REQUESTED',
    originDate: '2026-10-03',
    observation:
      'Falta incluir el nombre de la delegada de los estudiantes y el cronograma de sustentaciones.',
    formData: {
      'destinatario.nombre': 'Vicerrectorado Académico',
      'destinatario.cargo': 'Vicerrector Académico',
      'destinatario.dependencia': 'Rectorado',
      'documento.asunto': 'Conformación de la comisión de titulación',
      contenido: tiptap(
        'Se conforma la comisión de titulación para el período 2026-2027, integrada por la Vicerrectora Académica, la Coordinadora de Investigación y dos docentes delegados por el Consejo Ejecutivo.',
        'La comisión tendrá a su cargo la revisión de los proyectos de grado, la programación de las sustentaciones y la elaboración del informe final.',
      ),
      ...firmanteRectora,
    },
  },
  {
    template: 'Circular institucional',
    name: 'Circular de calendario de evaluaciones del segundo quimestre',
    description:
      'Calendario de evaluaciones quimestrales para todos los niveles.',
    creator: 'secretaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'EMITTED',
    originDate: '2026-09-15',
    formData: {
      'circular.destinatarios': [
        'Coordinación de Primaria',
        'Coordinación de Secundaria',
        'Personal docente',
        'Representantes legales',
      ],
      'documento.asunto':
        'Calendario de evaluaciones del segundo quimestre 2026-2027',
      contenido: tiptap(
        'Se informa a la comunidad educativa que las evaluaciones quimestrales se realizarán entre el 23 de noviembre y el 4 de diciembre de 2026. Cada docente deberá publicar la rúbrica y los criterios de evaluación en la plataforma institucional hasta el 13 de noviembre.',
        'Las evaluaciones de recuperación se aplicarán del 7 al 9 de diciembre. Los estudiantes que requieran ajustes razonables deberán presentar la solicitud al DECE hasta el 6 de noviembre.',
      ),
      ...firmanteSecretaria,
    },
  },
  {
    template: 'Circular institucional',
    name: 'Circular de la feria de ciencias 2026',
    description:
      'Organización de la feria de ciencias y tecnología institucional.',
    creator: 'coord.primaria@colegio.edu',
    reviewer: 'vicerrector@colegio.edu',
    state: 'CHANGES_REQUESTED',
    originDate: '2026-10-02',
    observation:
      'Agregar la fecha de entrega de resúmenes y el nombre del coordinador de logística.',
    formData: {
      'circular.destinatarios': [
        'Docentes de Primaria',
        'Docentes de Secundaria',
        'Estudiantes',
      ],
      'documento.asunto': 'Organización de la feria de ciencias y tecnología',
      contenido: tiptap(
        'La feria de ciencias y tecnología se realizará el 20 de noviembre de 2026 en el patio central. Cada curso presentará un proyecto interdisciplinario relacionado con el cuidado del agua y la energía renovable.',
        'Los docentes tutores acompañarán a los equipos y velarán por el cumplimiento de las normas de seguridad durante el montaje de los stands.',
      ),
      ...firmanteVicerrector,
    },
  },
  {
    template: 'Circular institucional',
    name: 'Circular de jornada de vacunación escolar',
    description:
      'Jornada de vacunación para estudiantes de primero a séptimo grado.',
    creator: 'secretaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'APPROVED',
    originDate: '2026-09-25',
    formData: {
      'circular.destinatarios': [
        'Representantes de Primaria',
        'Docentes de Primaria',
        'Personal de enfermería',
      ],
      'documento.asunto': 'Jornada de vacunación escolar',
      contenido: tiptap(
        'El Ministerio de Salud Pública, en coordinación con la institución, realizará una jornada de vacunación el jueves 8 de octubre de 2026. La actividad está dirigida a estudiantes de primero a séptimo grado.',
        'Los representantes deberán enviar el consentimiento firmado hasta el martes 6 de octubre. Los estudiantes con algún antecedente alérgico deben informarlo al personal de enfermería antes de la jornada.',
      ),
      ...firmanteSecretaria,
    },
  },
  {
    template: 'Acta institucional',
    name: 'Acta de la sesión del Consejo Ejecutivo de septiembre',
    description:
      'Acta de la sesión ordinaria del Consejo Ejecutivo del 5 de septiembre de 2026.',
    creator: 'secretaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'EMITTED',
    originDate: '2026-09-10',
    formData: {
      'acta.fecha': '2026-09-05',
      'acta.hora': '09:00',
      'acta.lugar': 'Sala de sesiones del Rectorado',
      'acta.asistentes': [
        'Lcda. Erika Ramirez — Rectora General',
        'Ing. Jefferson Vaca — Vicerrector Académico',
        'Lcda. Ana Gabriela López — Coordinadora de Primaria',
        'Lic. Roberto Méndez — Coordinador de Secundaria',
        'Lcda. Fabian Díaz — Secretario Académico',
      ],
      contenido: tiptap(
        'Se instaló la sesión ordinaria del Consejo Ejecutivo con la presencia de las autoridades convocadas. La Rectora dio la bienvenida y solicitó la lectura del orden del día, que fue aprobado por unanimidad.',
        'Se analizó el informe de asistencia del primer quimestre. Se acordó reforzar el acompañamiento a los estudiantes con ausencias reiteradas y solicitar a los coordinadores un plan de seguimiento para la segunda semana de octubre.',
        'Se aprobó la conformación de la comisión de evaluación del segundo quimestre y se dispuso que su informe se presente hasta el 30 de noviembre de 2026.',
      ),
      'acta.firmantes': [
        'Lcda. Erika Ramirez — Rectora General',
        'Lcda. Fabian Díaz — Secretario Académico',
      ],
    },
  },
  {
    template: 'Acta institucional',
    name: 'Acta de reunión de coordinadores de área',
    description:
      'Acta de la reunión de coordinadores académicos del 12 de octubre de 2026.',
    creator: 'coord.secundaria@colegio.edu',
    reviewer: 'vicerrector@colegio.edu',
    state: 'DRAFT',
    originDate: '2026-10-12',
    formData: {
      'acta.fecha': '2026-10-12',
      'acta.hora': '14:30',
      'acta.lugar': 'Sala de profesores',
      'acta.asistentes': [
        'Ing. Jefferson Vaca — Vicerrector Académico',
        'Lic. Roberto Méndez — Coordinador de Secundaria',
        'Lcda. Ana Gabriela López — Coordinadora de Primaria',
        'Prof. Ricardo Torres — Coordinador de Matemática',
      ],
      contenido: tiptap(
        'Se revisaron los avances de las planificaciones del segundo quimestre y se acordó unificar los formatos de evaluación en todas las áreas.',
        'Se solicitó a los coordinadores remitir las observaciones al Vicerrectorado hasta el 16 de octubre de 2026.',
      ),
      'acta.firmantes': [
        'Ing. Jefferson Vaca — Vicerrector Académico',
        'Lic. Roberto Méndez — Coordinador de Secundaria',
      ],
    },
  },
  {
    template: 'Acta institucional',
    name: 'Acta de la sesión del Consejo de Docentes de octubre',
    description:
      'Acta del Consejo de Docentes del 5 de octubre de 2026.',
    creator: 'secretaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'EMITTED',
    originDate: '2026-10-05',
    formData: {
      'acta.fecha': '2026-10-05',
      'acta.hora': '15:00',
      'acta.lugar': 'Auditorio institucional',
      'acta.asistentes': [
        'Lcda. Erika Ramirez — Rectora General',
        'Ing. Jefferson Vaca — Vicerrector Académico',
        'Docentes de Primaria y Secundaria',
      ],
      contenido: tiptap(
        'Se presentó el balance académico del primer quimestre. La Rectora reconoció el trabajo de los docentes y solicitó mantener las estrategias de refuerzo académico implementadas durante el período.',
        'Se socializó el calendario de evaluaciones del segundo quimestre y se recordó la obligación de publicar las rúbricas en la plataforma institucional.',
      ),
      'acta.firmantes': [
        'Lcda. Erika Ramirez — Rectora General',
        'Lcda. Fabian Díaz — Secretario Académico',
      ],
    },
  },
  {
    template: 'Constancia institucional',
    name: 'Constancia de estudios de Valentina Sofía Pérez',
    description:
      'Constancia de estudios de la estudiante Valentina Sofía Pérez González.',
    creator: 'secretaria@colegio.edu',
    reviewer: 'coord.primaria@colegio.edu',
    state: 'EMITTED',
    originDate: '2026-09-18',
    formData: {
      'estudiante.nombre': 'Valentina Sofía Pérez González',
      'estudiante.curso': 'Séptimo Grado',
      'estudiante.paralelo': 'A',
      'periodo.nombre': '2026-2027',
      'constancia.motivo':
        'Constancia solicitada por el representante legal para trámites de traslado interno.',
      ...firmanteSecretaria,
    },
  },
  {
    template: 'Constancia institucional',
    name: 'Constancia de conducta de Mateo Herrera',
    description:
      'Constancia de buena conducta del estudiante Mateo Herrera.',
    creator: 'secretaria@colegio.edu',
    reviewer: 'coord.secundaria@colegio.edu',
    state: 'IN_REVIEW',
    originDate: '2026-10-09',
    formData: {
      'estudiante.nombre': 'Mateo Herrera Salazar',
      'estudiante.curso': 'Segundo de Bachillerato',
      'estudiante.paralelo': 'B',
      'periodo.nombre': '2026-2027',
      'constancia.motivo':
        'Constancia solicitada para participar en el programa de intercambio estudiantil.',
      ...firmanteSecretaria,
    },
  },
  {
    template: 'Constancia institucional',
    name: 'Constancia de participación en el huerto escolar',
    description:
      'Constancia de participación de la estudiante Isabella Paredes.',
    creator: 'coord.primaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'DRAFT',
    originDate: '2026-10-13',
    formData: {
      'estudiante.nombre': 'Isabella Paredes Mora',
      'estudiante.curso': 'Quinto Grado',
      'estudiante.paralelo': 'A',
      'periodo.nombre': '2026-2027',
      'constancia.motivo':
        'Participación destacada en el proyecto pedagógico del huerto escolar durante el primer quimestre.',
      ...firmanteRectora,
    },
  },
  {
    template: 'Informe institucional',
    name: 'Informe de rendimiento del primer quimestre de Primaria',
    description:
      'Informe consolidado de rendimiento académico de Primaria.',
    creator: 'coord.primaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'EMITTED',
    originDate: '2026-09-30',
    formData: {
      'destinatario.nombre': 'Lcda. Erika Ramirez',
      'destinatario.cargo': 'Rectora General',
      'documento.asunto':
        'Informe de rendimiento académico del primer quimestre — Primaria',
      contenido: tiptap(
        'Se presenta el consolidado de rendimiento académico de Primaria correspondiente al primer quimestre 2026-2027. El promedio general alcanzó 8.74 sobre 10, con una mejora de 0.31 puntos respecto del período anterior.',
        'Las áreas de Lengua y Matemática concentran el mayor número de estudiantes con refuerzo pedagógico. Se recomienda mantener las tutorías de los martes y jueves y ampliar el acompañamiento a los estudiantes de cuarto a séptimo grado.',
        'Se adjunta el detalle por curso y las acciones de refuerzo previstas para el segundo quimestre.',
      ),
      ...firmanteRectora,
    },
  },
  {
    template: 'Informe institucional',
    name: 'Informe de gestión de la biblioteca escolar',
    description:
      'Informe de gestión y uso de la biblioteca durante el primer quimestre.',
    creator: 'prof.lengua@colegio.edu',
    reviewer: 'coord.secundaria@colegio.edu',
    state: 'CHANGES_REQUESTED',
    originDate: '2026-10-07',
    observation:
      'Incluir el número de préstamos por curso y el detalle de los libros deteriorados.',
    formData: {
      'destinatario.nombre': 'Lic. Roberto Méndez',
      'destinatario.cargo': 'Coordinador de Secundaria',
      'documento.asunto':
        'Informe de gestión de la biblioteca escolar — primer quimestre',
      contenido: tiptap(
        'Durante el primer quimestre se atendieron 486 visitas y se realizaron 212 préstamos bibliográficos. Las colecciones de Literatura y Ciencias Sociales fueron las más solicitadas.',
        'Se identificaron 18 ejemplares con deterioro leve y 4 con daño severo. Se recomienda programar una jornada de reparación y actualizar el inventario antes de finalizar el año lectivo.',
      ),
      ...firmanteRectora,
    },
  },
  {
    template: 'Informe institucional',
    name: 'Informe de incidencias de infraestructura de octubre',
    description:
      'Informe de incidencias y requerimientos de infraestructura.',
    creator: 'coord.secundaria@colegio.edu',
    reviewer: 'vicerrector@colegio.edu',
    state: 'IN_REVIEW',
    originDate: '2026-10-10',
    formData: {
      'destinatario.nombre': 'Ing. Jefferson Vaca',
      'destinatario.cargo': 'Vicerrector Académico',
      'documento.asunto':
        'Informe de incidencias de infraestructura — octubre de 2026',
      contenido: tiptap(
        'Se reportan dos filtraciones menores en el bloque B, una luminaria averiada en el laboratorio de Física y el desgaste de la pintura en la escalera de acceso al segundo piso.',
        'Ninguna de las incidencias representa riesgo inmediato para la comunidad educativa. Se solicita programar las reparaciones durante el receso académico de diciembre.',
      ),
      ...firmanteVicerrector,
    },
  },
  {
    template: 'Acta de entrega-recepción',
    name: 'Acta de entrega-recepción de bienes del laboratorio',
    description:
      'Entrega-recepción de bienes y equipos del laboratorio de ciencias.',
    creator: 'secretaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'EMITTED',
    originDate: '2026-09-22',
    formData: {
      'acta.lugar': 'Laboratorio de Ciencias Naturales',
      'acta.fecha': '2026-09-22',
      contenido: tiptap(
        'Se realiza la entrega-recepción de los bienes inventariados en el laboratorio de Ciencias Naturales, correspondientes al período 2026-2027. Se verificó la existencia de 24 microscopios, 12 balanzas, 8 juegos de disección y 40 mandiles de laboratorio.',
        'Los bienes se encuentran en condiciones operativas, con excepción de los equipos señalados en el informe de mantenimiento preventivo. Se deja constancia de las llaves del laboratorio y del inventario actualizado.',
      ),
      'recibidoPor.nombre': 'Ing. Jefferson Vaca',
      'recibidoPor.cargo': 'Vicerrector Académico',
      'entregadoPor.nombre': 'Lcda. Fabian Díaz',
      'entregadoPor.cargo': 'Secretario Académico',
      'vistoBueno.nombre': 'Lcda. Erika Ramirez',
      'vistoBueno.cargo': 'Rectora General',
    },
  },
];

const uploadedDocuments = [
  {
    file: 'oficio-convenio-biblioteca-municipal.pdf',
    name: 'Oficio de convenio con la Biblioteca Municipal',
    description:
      'Convenio de cooperación para el acceso de estudiantes a la Biblioteca Municipal.',
    type: 'Oficio',
    creator: 'secretaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'APPROVED',
    originDate: '2026-09-05',
    observation: 'Convenio revisado y aprobado por Rectorado.',
  },
  {
    file: 'circular-evaluacion-segundo-quimestre.pdf',
    name: 'Circular de evaluación del segundo quimestre',
    description:
      'Lineamientos para la evaluación quimestral de Secundaria.',
    type: 'Circular',
    creator: 'coord.primaria@colegio.edu',
    reviewer: 'vicerrector@colegio.edu',
    state: 'IN_REVIEW',
    originDate: '2026-09-20',
  },
  {
    file: 'informe-grupo-3b-primer-quimestre.pdf',
    name: 'Informe de grupo de Tercero B — primer quimestre',
    description:
      'Informe pedagógico del grupo de Tercero de Bachillerato B.',
    type: 'Informe de Grupo',
    creator: 'coord.secundaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'APPROVED',
    originDate: '2026-09-28',
    observation: 'Informe revisado y aprobado.',
  },
  {
    file: 'acta-compromiso-conducta-biblioteca.pdf',
    name: 'Acta de compromiso de conducta en la biblioteca',
    description:
      'Compromiso de conducta suscrito por el estudiante y su representante.',
    type: 'Acta de Compromiso',
    creator: 'coord.primaria@colegio.edu',
    reviewer: 'rector@colegio.edu',
    state: 'CHANGES_REQUESTED',
    originDate: '2026-10-04',
    observation:
      'Falta la firma del representante legal y la fecha de la reunión.',
  },
  {
    file: 'constancia-estudios-juan-pablo-medina.pdf',
    name: 'Constancia de estudios de Juan Pablo Medina',
    description:
      'Constancia de estudios solicitada por el representante legal.',
    type: 'Constancia de Estudios',
    creator: 'secretaria@colegio.edu',
    reviewer: 'coord.primaria@colegio.edu',
    state: 'DRAFT',
    originDate: '2026-10-11',
  },
  {
    file: 'memorando-cronograma-auditoria-inventario.pdf',
    name: 'Memorando de cronograma de auditoría de inventario',
    description:
      'Cronograma para la auditoría de inventario de bienes institucionales.',
    type: 'Memorando',
    creator: 'rector@colegio.edu',
    reviewer: 'vicerrector@colegio.edu',
    state: 'IN_REVIEW',
    originDate: '2026-10-02',
  },
  {
    file: 'solicitud-permiso-cita-medica.pdf',
    name: 'Solicitud de permiso por cita médica',
    description:
      'Solicitud de permiso laboral por cita médica de un docente.',
    type: 'Solicitud de Permiso',
    creator: 'maestro.1p@colegio.edu',
    reviewer: 'coord.secundaria@colegio.edu',
    state: 'DRAFT',
    originDate: '2026-10-14',
  },
  {
    file: 'boletin-calificaciones-5a-segundo-quimestre.pdf',
    name: 'Boletín de calificaciones de Quinto A',
    description:
      'Boletín de calificaciones del segundo quimestre de Quinto A.',
    type: 'Boletín de Calificaciones',
    creator: 'maestro.4p@colegio.edu',
    reviewer: 'coord.secundaria@colegio.edu',
    state: 'APPROVED',
    originDate: '2026-09-29',
    observation: 'Calificaciones verificadas y aprobadas.',
  },
  {
    file: 'plan-evaluacion-estudios-sociales-9a.pdf',
    name: 'Plan de evaluación de Estudios Sociales de Noveno A',
    description:
      'Plan de evaluación quimestral de Estudios Sociales.',
    type: 'Plan de Evaluación',
    creator: 'prof.historia@colegio.edu',
    reviewer: 'coord.secundaria@colegio.edu',
    state: 'IN_REVIEW',
    originDate: '2026-10-06',
  },
  {
    file: 'ficha-datos-estudiante-maria-jose-cevallos.pdf',
    name: 'Ficha de datos de la estudiante María José Cevallos',
    description:
      'Ficha de datos personales y académicos de la estudiante.',
    type: 'Ficha de Datos del Estudiante',
    creator: 'secretaria@colegio.edu',
    reviewer: 'coord.primaria@colegio.edu',
    state: 'APPROVED',
    originDate: '2026-09-16',
    observation: 'Ficha actualizada y aprobada.',
  },
];

const allNames = [
  ...authoringDocuments.map((document) => document.name),
  ...uploadedDocuments.map((document) => document.name),
];

async function request(pathname, { token, method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers,
    body: payload,
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(
      `${method} ${pathname} -> ${response.status}: ${
        typeof data === 'string' ? data : JSON.stringify(data)
      }`,
    );
  }
  return data;
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date, days) {
  return addHours(date, days * 24);
}

async function login(email) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });
  if (!result?.access_token) {
    throw new Error(`No se pudo iniciar sesión como ${email}`);
  }
  return result.access_token;
}

async function backdateAuthoring(documentId, baseDate) {
  const authoring = await prisma.documentAuthoring.findUnique({
    where: { documentId },
    include: { events: { orderBy: { id: 'asc' } } },
  });
  if (!authoring) return;

  let cursor = new Date(baseDate);
  let submittedAt = null;
  let reviewedAt = null;
  let emittedAt = null;
  let archivedAt = null;
  for (const event of authoring.events) {
    if (event.action === 'CREATED') cursor = new Date(baseDate);
    else if (event.action === 'SAVED') cursor = addHours(cursor, 2);
    else if (event.action === 'SUBMITTED') {
      cursor = addDays(cursor, 1);
      submittedAt = cursor;
    } else if (event.action === 'RETURNED') {
      cursor = addDays(cursor, 1);
      reviewedAt = cursor;
    } else if (event.action === 'APPROVED') {
      cursor = addDays(cursor, 1);
      reviewedAt = cursor;
    } else if (event.action === 'EMITTED') {
      cursor = addDays(cursor, 1);
      emittedAt = cursor;
    } else if (event.action === 'ARCHIVED') {
      cursor = addDays(cursor, 30);
      archivedAt = cursor;
    }
    await prisma.documentAuthoringEvent.update({
      where: { id: event.id },
      data: { createdAt: cursor },
    });
  }

  await prisma.documentAuthoring.update({
    where: { documentId },
    data: { createdAt: baseDate, updatedAt: cursor, submittedAt, reviewedAt, emittedAt },
  });
  await prisma.document.update({
    where: { id: documentId },
    data: { createdAt: baseDate, updatedAt: cursor, archivedAt },
  });
  await prisma.documentVersion.updateMany({
    where: { documentId },
    data: { createdAt: addHours(baseDate, 1) },
  });
  await prisma.documentContentVersion.updateMany({
    where: { documentId },
    data: { createdAt: addHours(baseDate, 1) },
  });
  await prisma.auditLog.updateMany({
    where: { documentId },
    data: { createdAt: addHours(baseDate, 1) },
  });
  await prisma.notification.updateMany({
    where: { documentId },
    data: { createdAt: addDays(baseDate, 2) },
  });
}

async function backdateUploaded(documentId, baseDate) {
  const review = await prisma.documentReview.findUnique({
    where: { documentId },
    include: { events: { orderBy: { id: 'asc' } } },
  });
  let cursor = new Date(baseDate);
  let submittedAt = null;
  let reviewedAt = null;
  if (review) {
    for (const event of review.events) {
      if (event.action === 'CREATED') cursor = new Date(baseDate);
      else if (event.action === 'SUBMITTED') {
        cursor = addDays(cursor, 1);
        submittedAt = cursor;
      } else if (event.action === 'RETURNED') {
        cursor = addDays(cursor, 1);
        reviewedAt = cursor;
      } else if (event.action === 'APPROVED') {
        cursor = addDays(cursor, 1);
        reviewedAt = cursor;
      } else if (event.action === 'ARCHIVED') {
        cursor = addDays(cursor, 30);
      }
      await prisma.documentReviewEvent.update({
        where: { id: event.id },
        data: { createdAt: cursor },
      });
    }
    await prisma.documentReview.update({
      where: { documentId },
      data: { createdAt: baseDate, updatedAt: cursor, submittedAt, reviewedAt },
    });
  }
  await prisma.document.update({
    where: { id: documentId },
    data: { createdAt: baseDate, updatedAt: cursor },
  });
  await prisma.documentVersion.updateMany({
    where: { documentId },
    data: { createdAt: addHours(baseDate, 1) },
  });
  await prisma.auditLog.updateMany({
    where: { documentId },
    data: { createdAt: addHours(baseDate, 1) },
  });
  await prisma.notification.updateMany({
    where: { documentId },
    data: { createdAt: addDays(baseDate, 2) },
  });
}

async function cleanupDemoDocuments() {
  const existing = await prisma.document.findMany({
    where: { name: { in: allNames }, deletedAt: null },
    select: { id: true, name: true },
  });
  for (const document of existing) {
    await prisma.document.update({
      where: { id: document.id },
      data: { deletedAt: new Date() },
    });
  }
  return existing.length;
}

async function main() {
  const templates = await prisma.documentTemplate.findMany({
    where: {
      catalog: 'institutional',
      isActive: true,
      isBlank: false,
      versions: { some: { status: 'PUBLISHED' } },
    },
    include: {
      versions: {
        where: { status: 'PUBLISHED' },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });
  const templateByName = new Map(templates.map((template) => [template.name, template]));
  const documentTypes = await prisma.documentType.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const typeByName = new Map(documentTypes.map((type) => [type.name, type]));
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, email: true, name: true, role: true },
  });
  const userByEmail = new Map(users.map((user) => [user.email, user]));

  const missingTemplates = [
    ...new Set([
      ...authoringDocuments.map((document) => document.template),
      ...uploadedDocuments.map((document) => document.type),
    ]),
  ].filter(
    (name) => !templateByName.has(name) && !typeByName.has(name),
  );
  if (dryRun) {
    console.log(`API: ${API}`);
    console.log(`Plantillas institucionales publicadas: ${templates.length}`);
    console.log(`Tipos de documento activos: ${documentTypes.length}`);
    console.log(`Documentos de plantilla a generar: ${authoringDocuments.length}`);
    console.log(`Documentos subidos a generar: ${uploadedDocuments.length}`);
    for (const document of authoringDocuments) {
      console.log(
        `  [${document.state}] ${document.template} · ${document.name} · ${document.creator}`,
      );
    }
    for (const document of uploadedDocuments) {
      console.log(
        `  [${document.state}] ${document.type} · ${document.name} · ${document.file}`,
      );
    }
    if (missingTemplates.length) {
      throw new Error(
        `Faltan plantillas/tipos en la base: ${missingTemplates.join(', ')}`,
      );
    }
    console.log('Dry run: no se creó ni modificó ningún registro.');
    return;
  }

  if (reset) {
    const deleted = await cleanupDemoDocuments();
    console.log(`Reset: ${deleted} documento(s) demo soft-deleted.`);
  }

  const tokens = new Map();
  for (const email of new Set([
    ...authoringDocuments.flatMap((document) => [document.creator, document.reviewer]),
    ...uploadedDocuments.flatMap((document) => [document.creator, document.reviewer]),
  ])) {
    tokens.set(email, await login(email));
    console.log(`Sesión iniciada: ${email}`);
  }

  let createdAuthoring = 0;
  let createdUploaded = 0;
  let skipped = 0;

  for (const definition of authoringDocuments) {
    const existing = await prisma.document.findFirst({
      where: { name: definition.name, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      console.log(`Ya existe, se omite: ${definition.name}`);
      skipped += 1;
      continue;
    }
    const template = templateByName.get(definition.template);
    if (!template) throw new Error(`Plantilla no encontrada: ${definition.template}`);
    const version = template.versions[0];
    if (!version) throw new Error(`Sin versión publicada: ${definition.template}`);
    const creator = userByEmail.get(definition.creator);
    const reviewer = userByEmail.get(definition.reviewer);
    if (!creator || !reviewer) {
      throw new Error(`Usuario no encontrado para ${definition.name}`);
    }
    const creatorToken = tokens.get(definition.creator);
    const reviewerToken = tokens.get(definition.reviewer);

    const created = await request('/authoring/documents', {
      token: creatorToken,
      method: 'POST',
      body: {
        templateVersionId: version.id,
        name: definition.name,
        description: definition.description,
        documentTypeId: template.documentTypeId ?? undefined,
        originDate: definition.originDate,
        formData: nestFormData(definition.formData),
      },
    });
    await request(`/authoring/documents/${created.id}/draft`, {
      token: creatorToken,
      method: 'PUT',
      body: {
        formData: nestFormData(definition.formData),
        createVersion: false,
      },
    });

    if (definition.state !== 'DRAFT') {
      await request(`/authoring/documents/${created.id}/submit`, {
        token: creatorToken,
        method: 'POST',
        body: { reviewerId: reviewer.id, reviewerName: reviewer.name },
      });
    }
    if (['CHANGES_REQUESTED', 'APPROVED', 'EMITTED', 'ARCHIVED'].includes(definition.state)) {
      if (definition.state === 'CHANGES_REQUESTED') {
        await request(`/authoring/documents/${created.id}/return`, {
          token: reviewerToken,
          method: 'POST',
          body: {
            observation:
              definition.observation ||
              'Se requiere completar la información institucional antes de aprobar.',
          },
        });
        await request(`/authoring/documents/${created.id}/draft`, {
          token: creatorToken,
          method: 'PUT',
          body: {
            formData: nestFormData(definition.formData),
            createVersion: false,
          },
        });
      } else {
        await request(`/authoring/documents/${created.id}/approve`, {
          token: reviewerToken,
          method: 'POST',
          body: { observation: definition.observation ?? undefined },
        });
      }
    }
    if (['EMITTED', 'ARCHIVED'].includes(definition.state)) {
      await request(`/authoring/documents/${created.id}/emit`, {
        token: creatorToken,
        method: 'POST',
      });
    }
    if (definition.state === 'ARCHIVED') {
      await request(`/authoring/documents/${created.id}/archive`, {
        token: creatorToken,
        method: 'POST',
      });
    }

    const base = new Date(`${definition.originDate}T09:00:00.000Z`);
    await backdateAuthoring(created.id, base);
    createdAuthoring += 1;
    console.log(`  [${definition.state}] ${definition.name} (#${created.id})`);
  }

  for (const definition of uploadedDocuments) {
    const existing = await prisma.document.findFirst({
      where: { name: definition.name, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      console.log(`Ya existe, se omite: ${definition.name}`);
      skipped += 1;
      continue;
    }
    const type = typeByName.get(definition.type);
    if (!type) throw new Error(`Tipo de documento no encontrado: ${definition.type}`);
    const creator = userByEmail.get(definition.creator);
    const reviewer = userByEmail.get(definition.reviewer);
    if (!creator || !reviewer) {
      throw new Error(`Usuario no encontrado para ${definition.name}`);
    }
    const creatorToken = tokens.get(definition.creator);
    const reviewerToken = tokens.get(definition.reviewer);
    const filePath = path.join(sampleDir, definition.file);
    const fileBuffer = await readFile(filePath);
    const form = new FormData();
    form.append(
      'file',
      new Blob([fileBuffer], { type: 'application/pdf' }),
      definition.file,
    );
    form.append('name', definition.name);
    form.append('description', definition.description);
    form.append('documentTypeId', String(type.id));
    form.append('originDate', definition.originDate);
    const uploaded = await request('/documents/upload', {
      token: creatorToken,
      method: 'POST',
      form,
    });
    if (definition.state !== 'DRAFT') {
      await request(`/document-reviews/${uploaded.id}/submit`, {
        token: creatorToken,
        method: 'POST',
        body: { reviewerId: reviewer.id, reviewerName: reviewer.name },
      });
    }
    if (definition.state === 'CHANGES_REQUESTED') {
      await request(`/document-reviews/${uploaded.id}/return`, {
        token: reviewerToken,
        method: 'POST',
        body: {
          observation:
            definition.observation ||
            'Se requiere corregir la información antes de aprobar.',
        },
      });
    } else if (definition.state === 'APPROVED') {
      await request(`/document-reviews/${uploaded.id}/approve`, {
        token: reviewerToken,
        method: 'POST',
        body: { observation: definition.observation ?? undefined },
      });
    }
    const base = new Date(`${definition.originDate}T09:00:00.000Z`);
    await backdateUploaded(uploaded.id, base);
    createdUploaded += 1;
    console.log(`  [${definition.state}] ${definition.name} (#${uploaded.id})`);
  }

  console.log(
    `Demo generada: ${createdAuthoring} documentos de plantilla, ${createdUploaded} documentos subidos, ${skipped} omitidos.`,
  );
}

main()
  .catch((error) => {
    console.error('Demo generation failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
