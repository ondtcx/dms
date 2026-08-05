/**
 * Script para generar documentos de ejemplo directamente vía PrismaClient.
 *
 * A diferencia de la versión anterior, este script NO depende de que el
 * backend esté corriendo ni de iniciar sesión vía HTTP: crea los registros
 * de Document / DocumentVersion / DocumentTemplateData directamente en la
 * base de datos, replicando la lógica de negocio de
 * DocumentTemplateService.createDocumentFromTemplate() (numeración
 * institucional vía DocumentNumberingService, versionado inicial) y de
 * WorkflowService (inicio y aprobación de workflows).
 *
 * No genera PDFs reales (eso requiere Puppeteer + Handlebars a través del
 * contexto completo de Nest) — en su lugar escribe un archivo placeholder
 * en uploads/ con el mismo nombre/mimetype, de forma que el registro de
 * DocumentVersion sea consistente y el documento sea navegable/descargable.
 *
 * Requisitos:
 *   1. Seed base ejecutado (npm run seed) — usuarios, secciones, categorías,
 *      plantillas de documento y plantillas de workflow deben existir.
 *
 * Uso:
 *   npm run seed:documents
 *
 * Idempotencia: si un documento con el mismo archivo (filename) ya existe
 * para el mismo usuario, se reutiliza en lugar de duplicarlo.
 */

import { PrismaClient, DocumentVersionSource, WorkflowStatus, UserRole } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ============================================================
// Datos de ejemplo para cada plantilla
// ============================================================

function getActaReunionPersonalData() {
  return [
    {
      formData: {
        titulo: 'Consejo de Docentes - Primer Lapso',
        fecha: '2026-01-15',
        hora_inicio: '08:00',
        hora_fin: '10:30',
        lugar: 'Salón de Conferencias',
        participantes:
          'María Elena Rodríguez (Directora)\nAna Gabriela López (Coord. Primaria)\nRoberto Méndez (Coord. Secundaria)\nJuan Manuel Suárez (Maestro 1° Grado)\nCarmen Torres (Prof. Biología)',
        agenda:
          '1. Revisión de resultados del primer lapso\n2. Planificación de actividades del segundo lapso\n3. Evaluación del rendimiento estudiantil\n4. Propuestas de mejora pedagógica',
        desarrollo:
          'Se revisaron los resultados académicos del primer lapso, observando un rendimiento general satisfactorio. La Coord. de Primaria presentó los indicadores de su nivel mostrando un 85% de aprobación. El Coord. de Secundaria reportó un 78% de aprobación, identificando Matemáticas como el área que requiere mayor atención.',
        acuerdos:
          '1. Implementar talleres de refuerzo en Matemáticas para Secundaria\n2. Organizar jornada de integración para el segundo lapso\n3. Cada docente debe entregar su planificación actualizada antes del 30 de enero\n4. Próxima reunión: 15 de febrero de 2026',
      },
      filename: 'acta-consejo-docentes-enero-2026.pdf',
      description: 'Acta del Consejo de Docentes del primer lapso académico 2025-2026',
    },
    {
      formData: {
        titulo: 'Reunión de Padres y Representantes - Primaria',
        fecha: '2026-02-20',
        hora_inicio: '14:00',
        hora_fin: '16:00',
        lugar: 'Auditorio Principal',
        participantes:
          'Ana Gabriela López (Coord. Primaria)\nJuan Manuel Suárez (Maestro 1° Grado)\nPadres y representantes de 1° Grado',
        agenda:
          '1. Informe de rendimiento del primer lapso\n2. Actividades planificadas para el segundo lapso\n3. Normas de convivencia\n4. Preguntas y sugerencias',
        desarrollo:
          'La Coordinadora de Primaria dio la bienvenida y presentó los resultados generales del nivel. El Maestro Juan Manuel Suárez detalló el progreso de los estudiantes de 1° Grado, destacando avances en lectoescritura y pensamiento lógico-matemático.',
        acuerdos:
          '1. Los padres se comprometen a apoyar la lectura diaria en casa\n2. Se realizará una feria de ciencias el 15 de marzo\n3. Las comunicaciones se enviarán por el sistema digital\n4. Próxima reunión: 20 de abril de 2026',
      },
      filename: 'acta-reunion-padres-primaria-feb-2026.pdf',
      description: 'Acta de reunión de padres y representantes de Primaria',
    },
  ];
}

function getConstanciaEstudioData() {
  return [
    {
      formData: {
        nombre_estudiante: 'Valentina Sofía Pérez González',
        identificacion: 'V-31.456.789',
        nivel: 'Primaria',
        grado_seccion: '1° Grado — Sección A',
        anio_escolar: '2025-2026',
        fecha_ingreso: '2025-09-15',
        promedio: 18.5,
      },
      filename: 'constancia-estudio-valentina-perez.pdf',
      description: 'Constancia de estudio de Valentina Sofía Pérez González',
    },
    {
      formData: {
        nombre_estudiante: 'Santiago Andrés Ramírez Torres',
        identificacion: 'V-32.123.456',
        nivel: 'Secundaria',
        grado_seccion: '1° Año — Sección B',
        anio_escolar: '2025-2026',
        fecha_ingreso: '2025-09-15',
        promedio: 16.8,
      },
      filename: 'constancia-estudio-santiago-ramirez.pdf',
      description: 'Constancia de estudio de Santiago Andrés Ramírez Torres',
    },
  ];
}

function getConstanciaBuenaConductaData() {
  return [
    {
      formData: {
        nombre_estudiante: 'Luis Fernando García Mendoza',
        identificacion: 'V-29.876.543',
        grado_seccion: '3° Grado — Sección A',
        anio_escolar: '2025-2026',
        calificacion_conducta: 'Excelente',
        observaciones:
          'El estudiante demuestra respeto, responsabilidad y liderazgo positivo dentro del aula y en actividades extracurriculares.',
      },
      filename: 'constancia-conducta-luis-garcia-2026.pdf',
      description: 'Constancia de buena conducta de Luis Fernando García Mendoza',
    },
  ];
}

function getMemorandumInternoData() {
  return [
    {
      formData: {
        numero: 'MEM-2026-001',
        fecha: '2026-02-01',
        para: 'Todo el Personal Docente y Administrativo',
        de: 'María Elena Rodríguez - Directora General',
        asunto: 'Inicio del Segundo Lapso Académico 2025-2026',
        contenido:
          'Por medio del presente se comunica al personal docente y administrativo que el segundo lapso académico dará inicio el día lunes 03 de febrero de 2026.\n\nSe recuerda lo siguiente:\n\n1. Las planificaciones del segundo lapso deben estar entregadas a la coordinación correspondiente antes del viernes 07 de febrero.\n\n2. Los horarios de clase se mantienen sin modificaciones.\n\n3. El día viernes 07 de febrero se realizará un consejo de docentes a las 2:00 PM en el Salón de Conferencias.\n\n4. Se solicita puntualidad y asistencia regular.\n\nSin más que agregar, quedo atenta a cualquier consulta.',
      },
      filename: 'memorandum-inicio-segundo-lapso-2026.pdf',
      description: 'Memorándum sobre inicio del segundo lapso académico',
    },
    {
      formData: {
        numero: 'MEM-2026-002',
        fecha: '2026-02-15',
        para: 'Coordinadores de Nivel',
        de: 'María Elena Rodríguez - Directora General',
        asunto: 'Entrega de Informes de Rendimiento del Primer Lapso',
        contenido:
          'Se solicita a los Coordinadores de cada nivel la entrega del informe consolidado de rendimiento académico del primer lapso, el cual debe incluir:\n\n1. Porcentaje de aprobación por materia\n2. Identificación de estudiantes con bajo rendimiento\n3. Estrategias implementadas para mejora\n4. Propuestas para el segundo lapso\n\nFecha límite de entrega: viernes 21 de febrero de 2026.\n\nEl informe debe ser cargado al Sistema de Gestión Documental en la categoría "Informes Académicos".',
      },
      filename: 'memorandum-informes-rendimiento-2026.pdf',
      description: 'Memorándum solicitando informes de rendimiento',
    },
  ];
}

function getInformePedagogicoGrupoData() {
  return [
    {
      formData: {
        grado: '1° Grado',
        materia: 'Matemáticas y Lengua',
        lapso: 'Primer Lapso 2025-2026',
        docente: 'Juan Manuel Suárez',
        total_estudiantes: 28,
        anio_escolar: '2025-2026',
        logros:
          'El 92% de los estudiantes alcanzaron los objetivos de lectoescritura básica. Se logró que el 88% domine las operaciones de suma y resta con números naturales hasta el 100.',
        dificultades:
          'Se identificaron 4 estudiantes con dificultades en el proceso lector. La comprensión de problemas matemáticos es un área que requiere refuerzo continuo.',
        estrategias:
          'Implementación de centros de aprendizaje, trabajo en pares estratégicos, uso de material concreto en Matemáticas, lectura guiada y silenciosa diaria.',
        indicadores:
          'Aprobación general: 92%\nMateria con mayor rendimiento: Ed. Física (100%)\nMateria con menor rendimiento: Matemáticas (82%)\nEstudiantes con alto rendimiento (≥18 pts): 12\nEstudiantes con bajo rendimiento (<10 pts): 2',
        plan_accion:
          'Para el segundo lapso se implementará un programa de lectura en 15 minutos al inicio de cada clase. Los 4 estudiantes con dificultades lectoras recibirán atención individualizada dos veces por semana.',
      },
      filename: 'informe-pedagogico-1er-grado-primer-lapso-2026.pdf',
      description: 'Informe pedagógico de grupo — 1° Grado, Primer Lapso 2025-2026',
    },
  ];
}

function getSolicitudPermisoLaboralData() {
  return [
    {
      formData: {
        nombre_empleado: 'Adrián Gustavo Pérez',
        cargo: 'Profesor de Cs. Naturales y Biología',
        departamento: 'Coordinación de Secundaria',
        fecha_inicio: '2026-03-10',
        fecha_fin: '2026-03-14',
        dias_solicitados: '5',
        motivo:
          'Asistencia a curso de actualización docente "Estrategias Innovadoras para la Enseñanza de Ciencias Naturales" organizado por el Ministerio de Educación en la ciudad capital.',
        observaciones:
          'Se deja planificación de actividades para los estudiantes durante el período de ausencia. El docente suplente será notificado por la Coordinación.',
      },
      filename: 'solicitud-permiso-adrian-perez-marzo-2026.pdf',
      description: 'Solicitud de permiso del Prof. Adrián Pérez para curso de actualización',
    },
  ];
}

function getReporteIncidenciaData() {
  return [
    {
      formData: {
        numero_incidente: 'INC-2026-003',
        fecha_incidente: '2026-02-25',
        hora_incidente: '10:15',
        lugar: 'Cancha deportiva',
        reportado_por: 'Juan Manuel Suárez - Maestro de guardia',
        tipo_incidente: 'Accidente menor durante actividad deportiva',
        descripcion:
          'Durante la clase de Educación Física, el estudiante Miguel Ángel Torres (1° Grado) sufrió una caída mientras corría en la cancha deportiva, presentando una raspadura leve en la rodilla derecha.',
        personas_involucradas:
          'Miguel Ángel Torres - Estudiante de 1° Grado\nJuan Manuel Suárez - Maestro de guardia\nEnfermera Rosa Campos - Atención de primeros auxilios',
        acciones_tomadas:
          '1. Se brindaron primeros auxilios inmediatos (limpieza y curación de la herida)\n2. Se notificó a la representante del estudiante vía telefónica\n3. El estudiante continuó sus actividades normales después de la atención\n4. Se registró en el libro de incidencias de la institución',
        seguimiento:
          'Verificar estado del estudiante al día siguiente. Revisar condiciones de la superficie de la cancha deportiva.',
      },
      filename: 'reporte-incidencia-feb-2026-003.pdf',
      description: 'Reporte de incidencia menor en cancha deportiva',
    },
  ];
}

// ── PLANIFICACIONES ──────────────────────────────────────────

function getPlanificacionSemanalData() {
  return [
    {
      formData: {
        docente: 'Diego Ernesto Vargas',
        grado: '3° Grado de Primaria',
        materia: 'Matemática',
        semana: '17 al 21 de febrero de 2026',
        objetivos:
          'Que el estudiante logre identificar y aplicar la multiplicación como suma repetida.\nDesarrollar el pensamiento lógico-matemático mediante resolución de problemas contextualizados.',
        contenidos:
          'Concepto de multiplicación\nTablas del 2, 3 y 4\nProblemas de multiplicación con datos de la vida cotidiana',
        estrategias:
          'Presentación con material concreto (fichas y dados)\nJuego de bingo matemático con tablas\nTrabajo en grupos pequeños para resolución de problemas\nRetroalimentación individual al cierre de cada actividad',
        recursos:
          'Fichas de colores, dados, pizarrón, marcadores, hojas de trabajo impresas, calculadoras (verificación)',
        evaluacion:
          'Participación oral en actividades grupales (20%)\nHoja de trabajo diaria (40%)\nEjercicio práctico de cierre de semana (40%)',
      },
      filename: 'planificacion-semanal-3er-grado-matematica-feb-2026.pdf',
      description: 'Planificación semanal de Matemática — 3° Grado, semana del 17-21 feb 2026',
    },
  ];
}

function getProyectoPedagogicoData() {
  return [
    {
      formData: {
        docente: 'Pablo Alberto Jiménez',
        grado: '5° Grado de Primaria',
        area: 'Ciencias Naturales',
        anio_escolar: '2025-2026',
        duracion: '4 semanas (del 10 de febrero al 6 de marzo de 2026)',
        nombre_proyecto: 'El agua en nuestra comunidad',
        justificacion:
          'El agua es un recurso fundamental cuyo uso responsable debe ser internalizado desde edades tempranas. Este proyecto busca que los estudiantes comprendan el ciclo del agua, su importancia para la vida y las acciones que pueden tomar para su cuidado en el entorno local.',
        propositos:
          'Reconocer las propiedades físicas del agua y su ciclo natural.\nIdentificar fuentes de agua en la comunidad y factores de contaminación.\nDesarrollar hábitos de ahorro y cuidado del agua en el hogar y la escuela.\nPresentar una campaña de concientización dirigida a la comunidad escolar.',
        actividades:
          'Semana 1: Exploración del tema — experimentos con propiedades del agua, lluvia de ideas, mapa conceptual grupal.\nSemana 2: Investigación — visita al laboratorio, búsqueda guiada de información, fichas de trabajo.\nSemana 3: Producción — elaboración de maqueta del ciclo del agua, redacción de compromisos.\nSemana 4: Socialización — presentación de campaña, carteles de ahorro del agua, exposición para otros grados.',
        evaluacion:
          'Participación activa en actividades (25%)\nFicha de investigación grupal (25%)\nMaqueta del ciclo del agua (25%)\nPresentación de campaña (25%)',
      },
      filename: 'proyecto-pedagogico-el-agua-5to-grado-2026.pdf',
      description: 'Proyecto Pedagógico de Aula — El agua en nuestra comunidad, 5° Grado',
    },
  ];
}

function getPlanEvaluacionData() {
  return [
    {
      formData: {
        docente: 'Ricardo Andrés Torres',
        materia: 'Matemática',
        grado: '3° Año de Secundaria',
        trimestre: '2do Trimestre',
        anio_escolar: '2025-2026',
        criterios:
          'Resolución correcta de ejercicios algebraicos\nJustificación del procedimiento utilizado\nAplicación de conceptos en situaciones problemáticas\nOrden y presentación del trabajo',
        instrumentos:
          'Prueba escrita individual\nTrabajos prácticos grupales\nCuaderno de ejercicios diarios',
        actividad1: 'Prueba de Álgebra — Ecuaciones de primer grado',
        tipo1: 'Prueba escrita individual',
        ponderacion1: 40,
        actividad2: 'Trabajo práctico — Resolución de problemas reales con ecuaciones',
        tipo2: 'Trabajo grupal (equipos de 3)',
        ponderacion2: 35,
        actividad3: 'Evaluación continua — Cuaderno de ejercicios',
        tipo3: 'Revisión diaria del cuaderno',
        ponderacion3: 25,
        observaciones:
          'Los estudiantes con dificultades en álgebra tendrán acceso a sesiones de refuerzo los martes a las 14:00h.',
      },
      filename: 'plan-evaluacion-matematica-3anio-2do-trimestre-2026.pdf',
      description: 'Plan de Evaluación Trimestral — Matemática, 3° Año Secundaria, 2do Trimestre',
    },
  ];
}

// ── ACTAS Y REUNIONES ─────────────────────────────────────────

function getActaConsejoGradoData() {
  return [
    {
      formData: {
        grado: '3° Año de Secundaria',
        anio_escolar: '2025-2026',
        fecha: '2026-02-10',
        lapso: 'Primer Lapso',
        coordinador: 'Roberto Alejandro Méndez',
        docentes_presentes:
          'Ricardo Torres (Matemática)\nValentina Reyes (Lengua y Literatura)\nMarcelo Sosa (Historia)\nAdrián Pérez (Biología)\nClaudia Núñez (Física)\nSebastián Vega (Química)\nJennifer Roberts (Inglés)',
        situacion_academica:
          'Promedio general del grado: 14.2 puntos. Aprobación global: 76%.\nMateria con mayor rendimiento: Inglés (promedio 16.8).\nMaterias con mayor índice de aplazados: Matemática (28% aplazados) y Química (22% aplazados).\nSe identificaron 5 estudiantes con bajo rendimiento en 3 o más materias que requieren seguimiento especial.',
        casos_especiales:
          'Estudiante José Andrés Mora: bajo rendimiento generalizado, posible situación familiar compleja. Se recomienda entrevista con representantes.\nEstudiante Camila Torres: excelente rendimiento, candidata a reconocimiento académico.',
        acuerdos:
          '1. El Prof. Torres implementará talleres de refuerzo en Matemática los martes (14:00h).\n2. El Prof. Vega revisará metodología de evaluación en Química.\n3. Se citará a representantes de los 5 estudiantes con bajo rendimiento antes del 28/02.\n4. Se prepararán reconocimientos para los 3 estudiantes con promedio ≥18.\n5. Próximo consejo de grado: 15 de mayo de 2026.',
        observaciones:
          'El coordinador solicitó a todos los docentes actualizar sus planificaciones para el segundo lapso antes del 20/02/2026.',
      },
      filename: 'acta-consejo-grado-3anio-secundaria-primer-lapso-2026.pdf',
      description: 'Acta de Consejo de Grado — 3° Año de Secundaria, Primer Lapso 2025-2026',
    },
  ];
}

function getActaCompromisoData() {
  return [
    {
      formData: {
        fecha: '2026-02-18',
        hora: '10:00',
        nombre_estudiante: 'Tomás Alejandro Rivas Díaz',
        grado: '2° Grado de Primaria',
        nombre_representante: 'Carmen Elena Díaz de Rivas',
        cedula_representante: 'V-18.234.567',
        nombre_docente: 'Sofía Andrea Ruiz',
        motivo:
          'Bajo rendimiento en Lengua y Matemática durante el primer lapso. El estudiante presenta dificultades en el proceso lector y en la comprensión de operaciones de suma y resta.',
        situacion:
          'El estudiante Tomás presenta un promedio de 9.8 puntos en el primer lapso, con calificaciones de 8 en Lengua y 9 en Matemática. Se observa poca concentración durante las actividades y escasa participación. La maestra indica que el niño no completa las tareas en casa.',
        compromisos:
          'La representante se compromete a:\n1. Supervisar y acompañar la realización de tareas diarias en casa (mínimo 30 minutos).\n2. Leer con el estudiante 15 minutos cada noche.\n3. Asistir a la próxima reunión de seguimiento el 18 de marzo de 2026.\n4. Comunicarse con la maestra semanalmente vía el sistema de mensajería digital.\n\nLa maestra se compromete a:\n1. Enviar actividades de refuerzo semanal para el hogar.\n2. Brindar atención personalizada al estudiante 2 veces por semana.\n3. Informar a la representante sobre avances y dificultades.',
        seguimiento:
          'Reunión de seguimiento programada para el 18 de marzo de 2026. Se evaluará el progreso mediante revisión de cuadernos y resultados de evaluaciones.',
      },
      filename: 'acta-compromiso-tomas-rivas-2do-grado-feb-2026.pdf',
      description: 'Acta de Compromiso con Representantes — Tomás Rivas, 2° Grado',
    },
  ];
}

// ── CONSTANCIAS Y CERTIFICADOS ────────────────────────────────

function getCertificadoCulminacionData() {
  return [
    {
      formData: {
        nombre_estudiante: 'Gabriela Alejandra Moreno Castillo',
        identificacion: 'V-28.901.234',
        nivel: 'Educación Secundaria (6° Año)',
        anio_escolar: '2024-2025',
        promedio: 17.2,
        mencion: 'Ciencias',
      },
      filename: 'certificado-culminacion-gabriela-moreno-2025.pdf',
      description: 'Certificado de Culminación de Estudios — Gabriela Moreno, 6° Año Secundaria',
    },
  ];
}

// ── INFORMES ACADÉMICOS ───────────────────────────────────────

function getInformeRendimientoIndividualData() {
  return [
    {
      formData: {
        nombre_estudiante: 'Mateo Sebastián Gutiérrez Pérez',
        identificacion: 'V-31.987.654',
        grado: '2° Año de Secundaria',
        lapso: 'Primer Lapso 2025-2026',
        docente: 'Valentina Isabel Reyes',
        anio_escolar: '2025-2026',
        desempeno_academico:
          'El estudiante alcanzó una calificación de 15 puntos en el primer lapso de Lengua y Literatura. Demuestra comprensión lectora adecuada y capacidad para analizar textos narrativos. Sin embargo, presenta dificultades en la producción escrita y en el uso de conectores en redacciones extensas.',
        fortalezas:
          'Excelente comprensión de lectura (puntaje promedio 18/20 en pruebas lectoras).\nParticipación activa y pertinente en discusiones literarias.\nCreatividad en la producción de textos cortos y poesía.',
        areas_mejora:
          'Coherencia y cohesión en la redacción de textos extensos.\nUso correcto de signos de puntuación en escritura formal.\nOrganización de ideas antes de iniciar la escritura (uso de borradores).',
        conducta:
          'Conducta excelente. El estudiante es respetuoso, puntual y colaborativo con sus compañeros. Se destaca positivamente en trabajos grupales.',
        recomendaciones:
          'Se sugiere que el estudiante practique la redacción diaria en un diario personal.\nLeer al menos un texto de 10 páginas semanalmente y hacer un resumen escrito.\nUsar organizadores gráficos antes de escribir textos formales.',
      },
      filename: 'informe-rendimiento-mateo-gutierrez-2anio-primer-lapso-2026.pdf',
      description: 'Informe de Rendimiento Individual — Mateo Gutiérrez, 2° Año, Lengua y Literatura',
    },
  ];
}

function getBoletinCalificacionesData() {
  return [
    {
      formData: {
        nombre_estudiante: 'Isabella Fernanda Rojas Torres',
        identificacion: 'V-30.543.210',
        grado: '4° Grado de Primaria — Sección A',
        lapso: 'Primer Lapso 2025-2026',
        docente_guia: 'Laura Beatriz Morales',
        anio_escolar: '2025-2026',
        materia1: 'Lengua',
        nota1_1: 17,
        nota1_2: 18,
        nota1_3: 16,
        prom1: 17,
        materia2: 'Matemática',
        nota2_1: 15,
        nota2_2: 14,
        nota2_3: 16,
        prom2: 15,
        materia3: 'Ciencias Naturales',
        nota3_1: 19,
        nota3_2: 18,
        nota3_3: 20,
        prom3: 19,
        promedio_general: 17,
        observaciones:
          'Isabella demuestra excelente desempeño en Ciencias Naturales. Se recomienda refuerzo en resolución de problemas matemáticos para el segundo lapso.',
      },
      filename: 'boletin-calificaciones-isabella-rojas-4to-grado-primer-lapso-2026.pdf',
      description: 'Boletín de Calificaciones — Isabella Rojas, 4° Grado, Primer Lapso 2025-2026',
    },
  ];
}

// ── ADMINISTRATIVOS ───────────────────────────────────────────

function getCircularInformativaData() {
  return [
    {
      formData: {
        numero: 'CIRC-2026-003',
        fecha: '2026-02-28',
        dirigido_a: 'Todo el Personal Docente y Estudiantes',
        asunto: 'Calendario de Evaluaciones — Segundo Lapso 2025-2026',
        departamento: 'Dirección General',
        contenido:
          'Por medio de la presente circular se informa a la comunidad educativa el calendario oficial de evaluaciones del segundo lapso del año escolar 2025-2026:\n\nPRIMARIA:\n• 1° y 2° Grado: 23 al 27 de marzo de 2026\n• 3° al 5° Grado: 30 de marzo al 3 de abril de 2026\n• 6° y 7° Grado: 6 al 10 de abril de 2026\n\nSECUNDARIA:\n• 1° y 2° Año: 23 al 27 de marzo de 2026\n• 3° y 4° Año: 30 de marzo al 3 de abril de 2026\n• 5° y 6° Año: 6 al 10 de abril de 2026\n\nSe recuerda que los docentes deben entregar las planificaciones de evaluación con 5 días hábiles de anticipación a la coordinación correspondiente.\n\nLos estudiantes y representantes pueden consultar este calendario en el portal digital institucional.',
        firmante: 'María Elena Rodríguez',
        cargo_firmante: 'Directora General',
      },
      filename: 'circular-calendario-evaluaciones-segundo-lapso-2026.pdf',
      description: 'Circular informativa — Calendario de evaluaciones del segundo lapso 2025-2026',
    },
  ];
}

function getComunicadoRepresentantesData() {
  return [
    {
      formData: {
        fecha: '2026-03-05',
        nombre_estudiante: 'Lucía Valentina Campos Ruiz',
        grado: '6° Grado de Primaria',
        docente: 'Natalia Cecilia Ortega',
        contenido:
          'Me dirijo a usted con la finalidad de informarle que el próximo viernes 20 de marzo de 2026, la sección de 6° Grado de Primaria llevará a cabo la Feria Anual de Ciencias con el tema "Innovando con la Naturaleza".\n\nSu hijo/a participará exponiendo el proyecto grupal "Jardín hidropónico con materiales reciclados", junto a sus compañeros de equipo.\n\nLa actividad se realizará en el Auditorio Principal del colegio de 9:00 AM a 12:00 M. Los representantes están cordialmente invitados a presenciar las exposiciones.',
        informacion_importante:
          'Los estudiantes deberán asistir con uniforme de laboratorio (bata blanca) y traer el material de su proyecto terminado antes de las 8:30 AM el día del evento.',
        firmante: 'Natalia Cecilia Ortega',
        cargo_firmante: 'Maestra de 6° Grado',
      },
      filename: 'comunicado-feria-ciencias-lucia-campos-6to-grado-2026.pdf',
      description: 'Comunicado a representantes — Feria de Ciencias, 6° Grado',
    },
  ];
}

// ── OFICIOS ───────────────────────────────────────────────────

function getOficioData() {
  return [
    {
      user: 'rector@colegio.edu',
      formData: {
        numero: 'OF-DIR-2026-001',
        fecha: '2026-02-03',
        lugar: 'Ciudad',
        destinatario: 'Lcda. Patricia Herrera Mora',
        cargo_destinatario: 'Directora Zonal de Educación',
        institucion_destinataria: 'Zona Educativa Regional',
        asunto: 'Solicitud de homologación de títulos docentes',
        cuerpo:
          'Me dirijo a usted en la oportunidad de saludarla cordialmente y, a la vez, solicitarle comedidamente gestione ante el Departamento de Recursos Humanos la homologación de los títulos universitarios de los docentes que se incorporaron al plantel en el presente año escolar 2025-2026.\n\nSe adjuntan los expedientes de los siguientes profesionales:\n\n1. Prof. Adrián Gustavo Pérez — Licenciado en Biología, UCV (2018)\n2. Prof. Jennifer Patricia Roberts — Licenciada en Idiomas Modernos, USB (2019)\n3. Prof. Sebastián Andrés Vega — Licenciado en Química, UCV (2020)\n\nAgradecemos su valiosa colaboración para la regularización de estos casos, los cuales son necesarios para la actualización del escalafón institucional.',
        firmante: 'María Elena Rodríguez',
        cargo_firmante: 'Directora General',
      },
      filename: 'oficio-solicitud-homologacion-titulos-2026-001.pdf',
      description: 'Oficio dirigido a la Zona Educativa solicitando homologación de títulos docentes',
    },
    {
      user: 'secretaria@colegio.edu',
      formData: {
        numero: 'OF-SEC-2026-002',
        fecha: '2026-03-01',
        lugar: 'Ciudad',
        destinatario: 'Dr. Roberto Fuentes Blanco',
        cargo_destinatario: 'Director del Centro de Salud Municipal',
        institucion_destinataria: 'Centro de Salud Municipal "Simón Bolívar"',
        asunto: 'Solicitud de jornada de vacunación escolar',
        cuerpo:
          'Reciba un cordial saludo de nuestra parte. A través del presente oficio, nos permitimos solicitar su colaboración para la organización de una jornada de vacunación dirigida a los estudiantes de nuestra institución, correspondiente al plan de inmunización del año escolar 2025-2026.\n\nContamos con una matrícula de 420 estudiantes distribuidos entre los niveles de Primaria (280 estudiantes) y Secundaria (140 estudiantes). La institución dispondrá del espacio físico necesario y del apoyo del personal para la logística del evento.\n\nLe solicitamos muy respetuosamente indicarnos la fecha disponible y los requerimientos técnicos necesarios para la jornada.',
        firmante: 'Carlos Alberto Mendoza',
        cargo_firmante: 'Secretario Académico',
      },
      filename: 'oficio-solicitud-jornada-vacunacion-2026-002.pdf',
      description: 'Oficio al Centro de Salud Municipal solicitando jornada de vacunación escolar',
    },
    {
      user: 'rector@colegio.edu',
      formData: {
        numero: 'OF-DIR-2026-003',
        fecha: '2026-03-10',
        lugar: 'Ciudad',
        destinatario: 'Lcda. Patricia Herrera Mora',
        cargo_destinatario: 'Directora Zonal de Educación',
        institucion_destinataria: 'Zona Educativa Regional',
        asunto: 'Notificación de resultados académicos del Primer Lapso — Nivel Secundaria',
        cuerpo:
          'Por medio del presente, me dirijo a usted para notificarle los resultados académicos consolidados del Primer Lapso del año escolar 2025-2026, correspondientes al nivel de Educación Secundaria de esta institución.\n\nMatrícula total Secundaria: 140 estudiantes (1° a 6° Año)\nPorcentaje de aprobación general: 81%\nPromedio institucional: 14.6 puntos\n\nMaterias con mayor índice de aplazados:\n• Matemática: 24% de aplazados\n• Química: 19% de aplazados\n• Física: 17% de aplazados\n\nEstudiantes con promedio ≥ 18 puntos (Alto Rendimiento): 22\nEstudiantes con bajo rendimiento en 3 o más materias: 11\n\nSe han implementado planes de refuerzo y tutorías para los estudiantes en situación de riesgo académico. Los informes detallados por sección están disponibles para consulta en la institución.',
        firmante: 'María Elena Rodríguez',
        cargo_firmante: 'Directora General',
      },
      filename: 'oficio-notificacion-resultados-primer-lapso-secundaria-2026.pdf',
      description: 'Oficio notificando resultados académicos del primer lapso de Secundaria a la Zona Educativa',
    },
    {
      user: 'vicerrector@colegio.edu',
      formData: {
        numero: 'OF-VICE-2026-004',
        fecha: '2026-03-18',
        lugar: 'Ciudad',
        destinatario: 'Lic. Marcos Antonio Delgado',
        cargo_destinatario: 'Coordinador de Cultura y Deportes',
        institucion_destinataria: 'Alcaldía Municipal — Dirección de Cultura y Deportes',
        asunto: 'Solicitud de apoyo logístico para actos de grado 2025-2026',
        cuerpo:
          'En nombre de nuestra institución educativa, me dirijo a usted para solicitarle muy respetuosamente su valioso apoyo logístico en la organización de los actos de grado del año escolar 2025-2026, correspondientes a los egresados de 6° Año de Educación Secundaria.\n\nEl evento está programado para el mes de julio de 2026 y contará con la participación de aproximadamente 25 bachilleres egresados, sus familiares y el personal docente de la institución.\n\nRequerimos especialmente:\n• Disponibilidad del auditorio municipal "Libertador" para la fecha acordada\n• Apoyo en la ambientación y sonido del espacio\n• Presencia de una banda o grupo musical institucional para la ceremonia\n\nAgradecemos de antemano su gestión y quedamos en espera de su respuesta.',
        firmante: 'Lucía Fernanda Castillo',
        cargo_firmante: 'Vicerrectora',
      },
      filename: 'oficio-solicitud-apoyo-actos-grado-2026-004.pdf',
      description: 'Oficio a la Alcaldía solicitando apoyo logístico para actos de grado de 6° Año',
    },
    {
      user: 'coord.secundaria@colegio.edu',
      formData: {
        numero: 'OF-CSEC-2026-005',
        fecha: '2026-03-25',
        lugar: 'Ciudad',
        destinatario: 'Prof. Eduardo José Villareal Montes',
        cargo_destinatario: 'Profesor de Matemática — Nivel Secundaria',
        institucion_destinataria: '',
        asunto: 'Autorización para aplicación de evaluación de recuperación — Primer Lapso',
        cuerpo:
          'Por medio del presente oficio se le autoriza a aplicar las evaluaciones de recuperación del Primer Lapso 2025-2026 en la materia de Matemática, correspondientes a los estudiantes de 2°, 3° y 4° Año de Secundaria que se detallan a continuación:\n\n• 2° Año "A": 5 estudiantes\n• 3° Año "B": 4 estudiantes\n• 4° Año "A": 3 estudiantes\n\nLas evaluaciones deberán realizarse durante la semana del 31 de marzo al 4 de abril de 2026, en los horarios acordados con cada sección. Las calificaciones obtenidas deben ser reportadas a esta Coordinación a más tardar el 8 de abril de 2026.\n\nSe le recuerda que los instrumentos de evaluación deben ser aprobados por la coordinación con 48 horas de anticipación.',
        firmante: 'Roberto Alejandro Méndez',
        cargo_firmante: 'Coordinador de Secundaria',
      },
      filename: 'oficio-autorizacion-evaluacion-recuperacion-matematica-2026-005.pdf',
      description: 'Oficio autorizando evaluaciones de recuperación de Matemática en Secundaria',
    },
  ];
}

function getOficioDesignacionData() {
  return [
    {
      user: 'rector@colegio.edu',
      formData: {
        numero: 'OF-DES-2026-001',
        fecha: '2026-02-10',
        lugar: 'Ciudad',
        nombre_docente: 'Valentina Isabel Reyes Morales',
        cargo_docente: 'Profesora de Lengua y Literatura — Secundaria',
        funcion: 'Coordinadora de la Comisión Evaluadora del Primer Lapso — Secundaria',
        periodo: 'Febrero — Marzo 2026',
        actividades:
          'La docente designada tendrá las siguientes responsabilidades:\n\n1. Coordinar la recopilación y revisión de las planificaciones de evaluación de todos los profesores de Secundaria.\n2. Verificar que los instrumentos de evaluación cumplan con los criterios pedagógicos institucionales.\n3. Elaborar el informe consolidado de resultados del Primer Lapso de Secundaria.\n4. Presentar el informe ante la Dirección y la Coordinación de Secundaria antes del 28 de marzo de 2026.\n5. Actuar como enlace entre la Coordinación de Secundaria y el personal docente durante el proceso evaluativo.',
        firmante: 'María Elena Rodríguez',
        cargo_firmante: 'Directora General',
      },
      filename: 'oficio-designacion-comision-evaluadora-secundaria-2026-001.pdf',
      description: 'Oficio de designación de la Prof. Reyes como Coordinadora de la Comisión Evaluadora de Secundaria',
    },
    {
      user: 'rector@colegio.edu',
      formData: {
        numero: 'OF-DES-2026-002',
        fecha: '2026-03-05',
        lugar: 'Ciudad',
        nombre_docente: 'Ricardo Andrés Torres Vásquez',
        cargo_docente: 'Profesor de Matemática — Secundaria',
        funcion: 'Representante Institucional ante las Olimpiadas de Matemática Regionales 2026',
        periodo: 'Marzo — Mayo 2026',
        actividades:
          '1. Seleccionar y preparar a los estudiantes de 3°, 4° y 5° Año que participarán en las olimpiadas.\n2. Coordinar los entrenamientos y sesiones de práctica en el horario acordado con la Dirección.\n3. Acompañar a la delegación institucional en las jornadas regionales de competencia.\n4. Elaborar informe final de la participación institucional y presentarlo a la Dirección.\n5. Gestionar ante la Coordinación de Secundaria los permisos necesarios para los estudiantes seleccionados.',
        firmante: 'María Elena Rodríguez',
        cargo_firmante: 'Directora General',
      },
      filename: 'oficio-designacion-representante-olimpiadas-matematica-2026-002.pdf',
      description: 'Oficio de designación del Prof. Torres como representante para las Olimpiadas de Matemática',
    },
  ];
}

function getOficioRemisionData() {
  return [
    {
      user: 'secretaria@colegio.edu',
      formData: {
        numero: 'OF-REM-2026-001',
        fecha: '2026-02-20',
        lugar: 'Ciudad',
        destinatario: 'Lcda. Carmen Rosa Villanueva',
        cargo_destinatario: 'Jefa de Control de Estudios',
        institucion_destinataria: 'Unidad Educativa "José Martí"',
        motivo_remision: 'Traslado de expediente académico de estudiante',
        documentos_remitidos:
          '1. Partida de nacimiento (original)\n2. Cédula de identidad estudiantil (copia)\n3. Boletín de calificaciones — Año Escolar 2024-2025 (original)\n4. Boletín de calificaciones — Primer Lapso 2025-2026 (copia certificada)\n5. Constancia de buena conducta (original)\n6. Constancia de estudios actualizada (original)\n7. Planilla de inscripción del año escolar anterior (copia)',
        observaciones:
          'El traslado fue solicitado por el representante legal del estudiante Tomás Eduardo Fuentes Díaz (V-33.901.234), cursante de 3° Año de Secundaria, por motivos de cambio de domicilio familiar. Se adjunta carta de solicitud del representante.',
        firmante: 'Carlos Alberto Mendoza',
        cargo_firmante: 'Secretario Académico',
      },
      filename: 'oficio-remision-expediente-tomas-fuentes-traslado-2026-001.pdf',
      description: 'Oficio de remisión de expediente académico por traslado estudiantil — Tomás Fuentes',
    },
    {
      user: 'secretaria@colegio.edu',
      formData: {
        numero: 'OF-REM-2026-002',
        fecha: '2026-03-15',
        lugar: 'Ciudad',
        destinatario: 'Lcda. Patricia Herrera Mora',
        cargo_destinatario: 'Directora Zonal de Educación',
        institucion_destinataria: 'Zona Educativa Regional',
        motivo_remision: 'Remisión de nómina y estadísticas de matrícula — Primer Lapso 2025-2026',
        documentos_remitidos:
          '1. Nómina general de estudiantes activos — Secundaria (140 estudiantes)\n2. Estadísticas de asistencia del Primer Lapso por sección\n3. Reporte de movimiento de matrícula (ingresos, egresos y traslados)\n4. Listado de estudiantes con necesidades educativas especiales (NEE)\n5. Cuadro resumen de resultados académicos por año y sección\n6. Actas de Consejo de Grado del Primer Lapso (copias certificadas)',
        observaciones:
          'Se remiten los documentos conforme a lo solicitado mediante comunicación ZE-2026-0142 de fecha 01 de marzo de 2026. La documentación corresponde exclusivamente al nivel de Educación Secundaria.',
        firmante: 'Carlos Alberto Mendoza',
        cargo_firmante: 'Secretario Académico',
      },
      filename: 'oficio-remision-nomina-estadisticas-secundaria-primer-lapso-2026-002.pdf',
      description: 'Oficio de remisión de nómina y estadísticas de Secundaria a la Zona Educativa',
    },
  ];
}

// ── LEGALES ───────────────────────────────────────────────────

function getContratoInscripcionData() {
  return [
    {
      formData: {
        director: 'María Elena Rodríguez',
        nombre_representante: 'Carlos Javier Medina Fuentes',
        cedula_representante: 'V-14.678.901',
        nombre_estudiante: 'Nicolás Alejandro Medina García',
        cedula_estudiante: 'V-33.456.789',
        grado: '1° Año de Secundaria',
        anio_escolar: '2025-2026',
        clausula_primera:
          'La Institución Educativa se compromete a brindar al estudiante una educación de calidad conforme al currículo nacional vigente, en las instalaciones adecuadas y con el personal docente debidamente calificado, durante el año escolar 2025-2026.',
        clausula_segunda:
          'El representante se compromete a cancelar puntualmente los aranceles establecidos por la institución, los días 1 al 10 de cada mes. En caso de incumplimiento por más de dos meses consecutivos, la institución procederá según el reglamento interno vigente.',
        clausula_tercera:
          'El representante y el estudiante declaran conocer y aceptar el Reglamento Interno de la institución, el Manual de Convivencia y el Código de Conducta Estudiantil, comprometiéndose a su cumplimiento durante toda la vigencia de este contrato.',
        clausula_cuarta:
          'Cualquier modificación al presente contrato deberá ser acordada por escrito entre ambas partes. La institución se reserva el derecho de actualizar los aranceles al inicio de cada año escolar, notificando a los representantes con al menos 30 días de anticipación.',
      },
      filename: 'contrato-inscripcion-nicolas-medina-1anio-secundaria-2025-2026.pdf',
      description: 'Contrato de Inscripción — Nicolás Medina, 1° Año Secundaria 2025-2026',
    },
  ];
}

// ── FINANCIEROS ───────────────────────────────────────────────

function getReciboArancelesData() {
  return [
    {
      formData: {
        numero_recibo: 'REC-2026-0047',
        nombre_estudiante: 'Santiago Andrés Ramírez Torres',
        identificacion: 'V-32.123.456',
        grado: '1° Año de Secundaria — Sección B',
        anio_escolar: '2025-2026',
        concepto1: 'Mensualidad — Febrero 2026',
        periodo1: 'Febrero 2026',
        monto1: 'Bs. 150,00',
        concepto2: 'Seguro estudiantil anual',
        periodo2: '2025-2026',
        monto2: 'Bs. 50,00',
        concepto3: 'Material didáctico — 2do Lapso',
        periodo3: 'Febrero 2026',
        monto3: 'Bs. 30,00',
        total: 'Bs. 230,00',
        forma_pago: 'Transferencia bancaria',
        fecha_pago: '2026-02-05',
        observaciones: 'Pago verificado por la secretaría. Recibo emitido al representante Carlos Ramírez (V-16.789.012).',
      },
      filename: 'recibo-aranceles-santiago-ramirez-feb-2026.pdf',
      description: 'Recibo de pago de aranceles — Santiago Ramírez, Febrero 2026',
    },
  ];
}

function getPresupuestoActividadData() {
  return [
    {
      formData: {
        nombre_actividad: 'Excursión de Fin de Año — Primaria',
        fecha_actividad: '2026-06-12',
        responsable: 'Ana Gabriela López — Coordinadora de Primaria',
        participantes: '196 estudiantes de 1° a 7° Grado + 14 docentes acompañantes',
        descripcion:
          'Excursión educativa al Parque Natural Metropolitano como actividad de cierre del año escolar. Incluye visita guiada a zonas de flora local, actividades de educación ambiental y convivencia estudiantil.',
        item1: 'Transporte (7 autobuses ida y vuelta)',
        cant1: 7,
        precio1: 'Bs. 800,00',
        subtotal1: 'Bs. 5.600,00',
        item2: 'Entrada al Parque Natural (estudiantes)',
        cant2: 196,
        precio2: 'Bs. 15,00',
        subtotal2: 'Bs. 2.940,00',
        item3: 'Almuerzo incluido (estudiantes y docentes)',
        cant3: 210,
        precio3: 'Bs. 35,00',
        subtotal3: 'Bs. 7.350,00',
        item4: 'Materiales de actividades ambientales (kits)',
        cant4: 196,
        precio4: 'Bs. 8,00',
        subtotal4: 'Bs. 1.568,00',
        total_estimado: 'Bs. 17.458,00',
        justificacion:
          'La excursión anual al Parque Natural forma parte del proyecto de Educación Ambiental institucional y permite reforzar los contenidos del área de Ciencias Naturales de todos los grados de Primaria en un entorno real. La actividad ha sido aprobada por la Dirección General según Circular DIR-2026-008.',
      },
      filename: 'presupuesto-excursion-fin-anio-primaria-2026.pdf',
      description: 'Presupuesto de Excursión de Fin de Año — Primaria 2025-2026',
    },
  ];
}

// ============================================================
// Numeración institucional (replica DocumentNumberingService)
// ============================================================

function derivePrefix(name?: string | null): string | null {
  if (!name) return null;
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z\s]/g, '')
    .trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (words.length === 1) return words[0].substring(0, 3).toUpperCase();
  return words
    .map((w) => w[0])
    .join('')
    .substring(0, 6)
    .toUpperCase();
}

async function resolvePrefixes(categoryId: number | null): Promise<{ sectionPrefix: string; categoryPrefix: string }> {
  if (!categoryId) return { sectionPrefix: 'DOC', categoryPrefix: 'GEN' };

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { name: true, prefix: true },
  });
  if (!category) return { sectionPrefix: 'DOC', categoryPrefix: 'GEN' };

  // Category.section fue removido del schema; el prefijo de sección queda
  // fijo en 'DOC' (replica el mismo cambio en DocumentNumberingService).
  const sectionPrefix = 'DOC';
  const categoryPrefix = category.prefix ?? derivePrefix(category.name) ?? 'GEN';
  return { sectionPrefix, categoryPrefix };
}

function formatDocumentNumber(sectionPrefix: string, categoryPrefix: string, year: number, seq: number): string {
  return `${sectionPrefix}-${categoryPrefix}-${year}-${seq.toString().padStart(4, '0')}`;
}

async function assignDocumentNumber(documentId: number, categoryId: number | null): Promise<string> {
  const existing = await prisma.document.findUnique({
    where: { id: documentId },
    select: { documentNumber: true },
  });
  if (existing?.documentNumber) return existing.documentNumber;

  const year = new Date().getFullYear();
  const { sectionPrefix, categoryPrefix } = await resolvePrefixes(categoryId);

  const seq = await prisma.$transaction(async (tx) => {
    await tx.documentCounter.upsert({
      where: { sectionPrefix_categoryPrefix_year: { sectionPrefix, categoryPrefix, year } },
      create: { sectionPrefix, categoryPrefix, year, lastNumber: 0 },
      update: {},
    });
    const updated = await tx.documentCounter.update({
      where: { sectionPrefix_categoryPrefix_year: { sectionPrefix, categoryPrefix, year } },
      data: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    });
    return updated.lastNumber;
  });

  const documentNumber = formatDocumentNumber(sectionPrefix, categoryPrefix, year, seq);
  await prisma.document.update({ where: { id: documentId }, data: { documentNumber } });
  return documentNumber;
}

// ============================================================
// Lookups cargados una vez al inicio (reemplazan login() + apiGet())
// ============================================================

interface LoadedTemplate {
  id: number;
  categoryId: number | null;
}

interface StateDefinition {
  state: string;
  role: string;
  order: number;
}

interface LoadedWorkflowTemplate {
  id: number;
  stateDefinitions: StateDefinition[];
}

let userIdByEmail: Record<string, string> = {};
let templateByName: Record<string, LoadedTemplate> = {};
let workflowTemplateByName: Record<string, LoadedWorkflowTemplate> = {};
let currentAcademicYearId: number | null = null;

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

async function loadLookups() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  userIdByEmail = Object.fromEntries(users.map((u) => [u.email, u.id]));

  const templates = await prisma.documentTemplate.findMany({
    select: { id: true, name: true, categoryId: true },
  });
  templateByName = Object.fromEntries(templates.map((t) => [t.name, { id: t.id, categoryId: t.categoryId }]));

  const workflowTemplates = await prisma.workflowTemplate.findMany({
    select: { id: true, name: true, stateDefinitions: true },
  });
  workflowTemplateByName = Object.fromEntries(
    workflowTemplates.map((t) => [
      t.name,
      {
        id: t.id,
        stateDefinitions: ((t.stateDefinitions as unknown as StateDefinition[]) ?? [])
          .slice()
          .sort((a, b) => a.order - b.order),
      },
    ]),
  );

  const academicYear = await prisma.academicYear.findFirst({
    where: { isCurrent: true, isActive: true },
    select: { id: true },
  });
  currentAcademicYearId = academicYear?.id ?? null;

  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ============================================================
// Creación de documentos
// (replica DocumentTemplateService.generateAndPersistDocument, sin
// renderizado real de PDF vía Puppeteer)
// ============================================================

async function createDocumentFromTemplate(
  userEmail: string,
  templateName: string,
  data: { formData: Record<string, any>; filename: string; description: string },
): Promise<{ id: number; categoryId: number | null } | null> {
  const uploadedById = userIdByEmail[userEmail];
  if (!uploadedById) {
    console.error(`  ❌ Usuario no encontrado: ${userEmail} — se omite "${data.filename}"`);
    return null;
  }

  const template = templateByName[templateName];
  if (!template) {
    console.error(`  ❌ Plantilla "${templateName}" no encontrada — se omite "${data.filename}"`);
    return null;
  }

  // Idempotencia: si el usuario ya tiene un documento con este archivo,
  // se reutiliza en vez de duplicarlo en reejecuciones del seed.
  const existing = await prisma.document.findFirst({
    where: { uploadedById, deletedAt: null, versions: { some: { filename: data.filename } } },
    select: { id: true, categoryId: true },
  });
  if (existing) {
    return existing;
  }

  const mimetype = data.filename.endsWith('.html') ? 'text/html' : 'application/pdf';
  const storedName = `${Date.now()}-${data.filename}`;
  const filePath = path.join(UPLOADS_DIR, storedName);

  // Placeholder: este script no invoca Puppeteer/Handlebars (requiere el
  // contexto completo de Nest). Se escribe un archivo con el mismo nombre
  // y mimetype para que el registro de DocumentVersion sea consistente.
  const placeholderContent = Buffer.from(
    `Documento generado por seed-documents.ts\n\n${data.description}\n\n${JSON.stringify(data.formData, null, 2)}\n`,
    'utf-8',
  );
  fs.writeFileSync(filePath, placeholderContent);

  const document = await prisma.document.create({
    data: {
      description: data.description,
      isPublic: false,
      uploadedById,
      categoryId: template.categoryId,
      versions: {
        create: {
          version: 1,
          filename: data.filename,
          storedName,
          mimetype,
          size: placeholderContent.length,
          path: filePath,
          createdById: uploadedById,
          source: DocumentVersionSource.UPLOAD_INICIAL,
        },
      },
      templateData: {
        create: { templateId: template.id, formData: data.formData },
      },
      ...(currentAcademicYearId ? { academic: { create: { academicYearId: currentAcademicYearId } } } : {}),
    },
    select: { id: true, categoryId: true },
  });

  await assignDocumentNumber(document.id, document.categoryId);

  return document;
}

// ============================================================
// Workflows (replica WorkflowService.initiateWorkflow / processApproval)
// ============================================================

async function startWorkflow(
  userEmail: string,
  documentId: number,
  workflowTemplateName: string,
): Promise<{ id: number } | null> {
  const initiatedById = userIdByEmail[userEmail];
  const template = workflowTemplateByName[workflowTemplateName];
  if (!initiatedById || !template || !documentId) {
    console.error(`  ❌ No se pudo iniciar workflow "${workflowTemplateName}" para el documento ${documentId}`);
    return null;
  }

  const firstState = template.stateDefinitions[0];
  if (!firstState) return null;

  const existing = await prisma.documentWorkflow.findUnique({ where: { documentId } });
  if (existing) return { id: existing.id };

  const workflow = await prisma.documentWorkflow.create({
    data: {
      documentId,
      templateId: template.id,
      status: WorkflowStatus.IN_PROGRESS,
      currentState: firstState.state,
      currentStateOrder: firstState.order,
      initiatedById,
    },
    select: { id: true },
  });

  const approvers = await prisma.user.findMany({
    where: { role: firstState.role as UserRole },
    select: { id: true },
  });
  await Promise.all(
    approvers
      .filter((u) => u.id !== initiatedById)
      .map((u) =>
        prisma.workflowApproval.create({
          data: {
            workflowId: workflow.id,
            state: firstState.state,
            stateOrder: firstState.order,
            action: null,
            userId: u.id,
            comment: null,
          },
        }),
      ),
  );

  return workflow;
}

async function approveWorkflow(
  userEmail: string,
  workflowId: number | undefined,
  action: 'APPROVED' | 'REJECTED' | 'REQUESTED_CHANGES',
  comment?: string,
): Promise<void> {
  const userId = userIdByEmail[userEmail];
  if (!userId || !workflowId) return;

  const workflow = await prisma.documentWorkflow.findUnique({
    where: { id: workflowId },
    include: { template: { select: { stateDefinitions: true } } },
  });
  if (!workflow) return;

  const stateDefinitions = ((workflow.template.stateDefinitions as unknown as StateDefinition[]) ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);

  let approval = await prisma.workflowApproval.findFirst({
    where: { workflowId, userId, state: workflow.currentState, action: null },
  });
  if (!approval) {
    approval = await prisma.workflowApproval.create({
      data: {
        workflowId,
        state: workflow.currentState,
        stateOrder: workflow.currentStateOrder,
        action: null,
        userId,
        comment: null,
      },
    });
  }

  const currentVersion = await prisma.documentVersion.findFirst({
    where: { documentId: workflow.documentId },
    orderBy: { version: 'desc' },
    select: { id: true },
  });

  await prisma.workflowApproval.update({
    where: { id: approval.id },
    data: { action, comment: comment ?? null, documentVersionId: currentVersion?.id ?? null },
  });

  if (action === 'REJECTED') {
    await prisma.documentWorkflow.update({
      where: { id: workflowId },
      data: { status: WorkflowStatus.REJECTED, completedAt: new Date() },
    });
    return;
  }

  if (action === 'REQUESTED_CHANGES') {
    await prisma.documentWorkflow.update({
      where: { id: workflowId },
      data: { status: WorkflowStatus.CHANGES_REQUESTED },
    });
    return;
  }

  // APPROVED: avanzar al siguiente estado o completar el workflow
  const nextIndex = stateDefinitions.findIndex((s) => s.order === workflow.currentStateOrder) + 1;

  if (nextIndex >= stateDefinitions.length) {
    await prisma.documentWorkflow.update({
      where: { id: workflowId },
      data: { status: WorkflowStatus.APPROVED, completedAt: new Date() },
    });
    return;
  }

  const nextState = stateDefinitions[nextIndex];
  const prevState = workflow.currentState;

  await prisma.documentWorkflow.update({
    where: { id: workflowId },
    data: { currentState: nextState.state, currentStateOrder: nextState.order },
  });

  await prisma.workflowApproval.deleteMany({ where: { workflowId, state: prevState, action: null } });

  const approversNext = await prisma.user.findMany({
    where: { role: nextState.role as UserRole },
    select: { id: true },
  });
  await Promise.all(
    approversNext
      .filter((u) => u.id !== workflow.initiatedById)
      .map((u) =>
        prisma.workflowApproval.create({
          data: {
            workflowId,
            state: nextState.state,
            stateOrder: nextState.order,
            action: null,
            userId: u.id,
            comment: null,
          },
        }),
      ),
  );
}

// ============================================================
// Comentarios
// ============================================================

// ============================================================
// Script principal
// ============================================================

async function main() {
  console.log('📄 Generando documentos de ejemplo (PrismaClient, sin servidor HTTP)...\n');

  await loadLookups();
  console.log(
    `  ${Object.keys(userIdByEmail).length} usuarios, ${Object.keys(templateByName).length} plantillas de documento, ${Object.keys(workflowTemplateByName).length} plantillas de workflow cargadas\n`,
  );

  console.log('📝 Creando documentos desde plantillas...\n');

  let created = 0;
  const docsCreated: Record<string, number> = {};
  const docsCategory: Record<number, number | null> = {};

  const seedOne = async (
    templateName: string,
    userEmail: string,
    doc: { formData: Record<string, any>; filename: string; description: string },
  ) => {
    const result = await createDocumentFromTemplate(userEmail, templateName, doc);
    if (result) {
      created++;
      docsCategory[result.id] = result.categoryId;
      console.log(`  ✅ ${doc.filename}`);
    } else {
      console.error(`  ❌ ${doc.filename}`);
    }
    return result;
  };

  // --- Actas de Reunión de Personal (Directora) ---
  for (const acta of getActaReunionPersonalData()) {
    const doc = await seedOne('Acta de Reunión de Personal', 'rector@colegio.edu', acta);
    if (doc && !docsCreated.actaReunionConsejo) docsCreated.actaReunionConsejo = doc.id;
  }

  // --- Constancias de Estudio (Secretaria) ---
  for (const constancia of getConstanciaEstudioData()) {
    const doc = await seedOne('Constancia de Estudio', 'secretaria@colegio.edu', constancia);
    if (doc) {
      if (!docsCreated.constanciaValentina) docsCreated.constanciaValentina = doc.id;
      else docsCreated.constanciaSantiago = doc.id;
    }
  }

  // --- Constancia de Buena Conducta (Secretaria) ---
  for (const cert of getConstanciaBuenaConductaData()) {
    await seedOne('Constancia de Buena Conducta', 'secretaria@colegio.edu', cert);
  }

  // --- Memorándums Internos (Directora) ---
  for (const memo of getMemorandumInternoData()) {
    await seedOne('Memorándum Interno', 'rector@colegio.edu', memo);
  }

  // --- Documentos de la Vicerrectora ---
  const viceMemoData = {
    formData: {
      numero: 'MEM-2026-003',
      fecha: '2026-03-10',
      para: 'Coordinadores de Primaria y Secundaria',
      de: 'Lucía Fernanda Castillo - Vicerrectora',
      asunto: 'Protocolo de Atención a Estudiantes con Necesidades Educativas Especiales',
      contenido:
        'Por instrucciones de la Dirección General, se comunica a los coordinadores de nivel la actualización del protocolo institucional para la atención de estudiantes con necesidades educativas especiales (NEE).\n\nA partir del 17 de marzo de 2026 se implementarán las siguientes disposiciones:\n\n1. Todo docente que identifique a un estudiante con posible NEE debe notificarlo por escrito a su coordinación en un lapso no mayor a 5 días hábiles.\n\n2. La coordinación iniciará el proceso de observación y diagnóstico pedagógico en un período de 10 días hábiles.\n\n3. Los ajustes curriculares requeridos serán gestionados conjuntamente con la Vicerrectoría y los docentes de aula.\n\n4. Se habilitará un expediente digital por cada caso en la sección "Administrativos" del sistema documental.\n\nAgradezco la atención y puntual cumplimiento de estas directrices.',
    },
    filename: 'memorandum-protocolo-nee-2026.pdf',
    description: 'Memorándum — Protocolo de atención a estudiantes con NEE',
  };
  const viceMemo = await seedOne('Memorándum Interno', 'vicerrector@colegio.edu', viceMemoData);
  if (viceMemo) docsCreated.vicerrectorMemo = viceMemo.id;

  const viceActaData = {
    formData: {
      numero_acta: 'ACTA-VICE-2026-001',
      fecha: '2026-03-12',
      hora_inicio: '09:00',
      hora_fin: '11:30',
      lugar: 'Sala de Conferencias — Vicerrectoría',
      titulo: 'Reunión de Coordinación Pedagógica — Segundo Lapso 2026',
      tipo_reunion: 'Reunión de Coordinación Pedagógica',
      presidente: 'Lucía Fernanda Castillo - Vicerrectora',
      secretario: 'Carlos Alberto Mendoza - Secretario Académico',
      participantes:
        'Coord. Primaria: Andrea Patricia Salcedo\nCoord. Secundaria: Roberto Miguel Paredes\nMaestro 6° Grado: Natalia Cecilia Ortega\nProf. Matemática: Eduardo José Villareal',
      asistentes:
        'Coord. Primaria: Andrea Patricia Salcedo\nCoord. Secundaria: Roberto Miguel Paredes\nMaestro 6° Grado: Natalia Cecilia Ortega\nProf. Matemática: Eduardo José Villareal',
      agenda:
        '1. Seguimiento de metas pedagógicas del segundo lapso\n2. Revisión de indicadores de rendimiento por nivel\n3. Plan de tutorías para estudiantes con bajo rendimiento\n4. Próximas actividades institucionales',
      orden_del_dia:
        '1. Seguimiento de metas pedagógicas del segundo lapso\n2. Revisión de indicadores de rendimiento por nivel\n3. Plan de tutorías para estudiantes con bajo rendimiento\n4. Próximas actividades institucionales',
      desarrollo:
        'La Vicerrectora dio inicio a la reunión señalando los avances registrados en el segundo lapso. La Coord. de Primaria presentó los indicadores de rendimiento actualizados, destacando una mejora del 8% en lectura comprensiva. La Coord. de Secundaria informó sobre el plan de tutorías implementado en Matemática y Lengua. Se acordó reforzar el seguimiento individualizado de los 14 estudiantes identificados con bajo rendimiento.',
      acuerdos:
        '1. Entregar informe de rendimiento consolidado del segundo lapso antes del 20 de marzo.\n2. Implementar tutorías grupales los miércoles de 2:00 PM a 3:30 PM.\n3. Convocar reunión con representantes de estudiantes en riesgo para el 25 de marzo.\n4. Actualizar el registro de seguimiento en el sistema documental.',
      proxima_reunion: '26 de marzo de 2026, 9:00 AM',
    },
    filename: 'acta-reunion-coordinacion-pedagogica-2026-001.pdf',
    description: 'Acta de reunión de coordinación pedagógica — presidida por Vicerrectoría',
  };
  const viceActa = await seedOne('Acta de Reunión de Personal', 'vicerrector@colegio.edu', viceActaData);
  if (viceActa) docsCreated.vicerrectorActa = viceActa.id;

  // --- Informe Pedagógico de Grupo (Coordinadora de Primaria) ---
  for (const informe of getInformePedagogicoGrupoData()) {
    const doc = await seedOne('Informe Pedagógico de Grupo', 'coord.primaria@colegio.edu', informe);
    if (doc) docsCreated.informePedagogico = doc.id;
  }

  // --- Solicitud de Permiso Laboral (Profesora de Biología) ---
  for (const sol of getSolicitudPermisoLaboralData()) {
    await seedOne('Solicitud de Permiso Laboral', 'prof.biologia@colegio.edu', sol);
  }

  // --- Reporte de Incidencia Escolar (Maestro de 1° Grado) ---
  for (const rep of getReporteIncidenciaData()) {
    await seedOne('Reporte de Incidencia Escolar', 'maestro.1p@colegio.edu', rep);
  }

  // ── PLANIFICACIONES ──────────────────────────────────────────

  // --- Planificación Semanal de Clase (Maestro 3° Grado) ---
  for (const doc of getPlanificacionSemanalData()) {
    const created_doc = await seedOne('Planificación Semanal de Clase', 'maestro.3p@colegio.edu', doc);
    if (created_doc) docsCreated.planificacionSemanal3p = created_doc.id;
  }

  // --- Proyecto Pedagógico de Aula (Maestro 5° Grado) ---
  for (const doc of getProyectoPedagogicoData()) {
    const created_doc = await seedOne('Proyecto Pedagógico de Aula', 'maestro.5p@colegio.edu', doc);
    if (created_doc) docsCreated.proyectoPedagogico = created_doc.id;
  }

  // --- Plan de Evaluación Trimestral (Prof. Matemática) ---
  for (const doc of getPlanEvaluacionData()) {
    const created_doc = await seedOne('Plan de Evaluación Trimestral', 'prof.matematica@colegio.edu', doc);
    if (created_doc) docsCreated.planEvaluacion = created_doc.id;
  }

  // ── ACTAS Y REUNIONES ─────────────────────────────────────────

  // --- Acta de Consejo de Grado (Coord. Secundaria) ---
  for (const doc of getActaConsejoGradoData()) {
    const created_doc = await seedOne('Acta de Consejo de Grado', 'coord.secundaria@colegio.edu', doc);
    if (created_doc) docsCreated.actaConsejo = created_doc.id;
  }

  // --- Acta de Compromiso con Representantes (Coord. Primaria) ---
  for (const doc of getActaCompromisoData()) {
    const created_doc = await seedOne('Acta de Compromiso con Representantes', 'coord.primaria@colegio.edu', doc);
    if (created_doc) docsCreated.actaCompromiso = created_doc.id;
  }

  // ── CONSTANCIAS Y CERTIFICADOS ────────────────────────────────

  // --- Certificado de Culminación de Estudios (Secretaria) ---
  for (const doc of getCertificadoCulminacionData()) {
    await seedOne('Certificado de Culminación de Estudios', 'secretaria@colegio.edu', doc);
  }

  // ── INFORMES ACADÉMICOS ───────────────────────────────────────

  // --- Informe de Rendimiento Académico Individual (Prof. Lengua) ---
  for (const doc of getInformeRendimientoIndividualData()) {
    await seedOne('Informe de Rendimiento Académico Individual', 'prof.lengua@colegio.edu', doc);
  }

  // --- Boletín de Calificaciones (Maestra 4° Grado) ---
  for (const doc of getBoletinCalificacionesData()) {
    await seedOne('Boletín de Calificaciones', 'maestro.4p@colegio.edu', doc);
  }

  // ── ADMINISTRATIVOS ───────────────────────────────────────────

  // --- Circular Informativa (Directora) ---
  for (const doc of getCircularInformativaData()) {
    await seedOne('Circular Informativa', 'rector@colegio.edu', doc);
  }

  // --- Comunicado a Representantes (Maestra 6° Grado) ---
  for (const doc of getComunicadoRepresentantesData()) {
    await seedOne('Comunicado a Representantes', 'maestro.6p@colegio.edu', doc);
  }

  // ── OFICIOS ───────────────────────────────────────────────────

  // --- Oficio genérico ---
  for (const doc of getOficioData()) {
    await seedOne('Oficio', doc.user, doc);
  }

  // --- Oficio de Designación Docente ---
  for (const doc of getOficioDesignacionData()) {
    await seedOne('Oficio de Designación Docente', doc.user, doc);
  }

  // --- Oficio de Remisión de Documentos ---
  for (const doc of getOficioRemisionData()) {
    await seedOne('Oficio de Remisión de Documentos', doc.user, doc);
  }

  // ── LEGALES ───────────────────────────────────────────────────

  // --- Contrato de Inscripción Estudiantil (Directora) ---
  for (const doc of getContratoInscripcionData()) {
    await seedOne('Contrato de Inscripción Estudiantil', 'rector@colegio.edu', doc);
  }

  // ── FINANCIEROS ───────────────────────────────────────────────

  // --- Recibo de Pago de Aranceles (Secretaria) ---
  for (const doc of getReciboArancelesData()) {
    await seedOne('Recibo de Pago de Aranceles', 'secretaria@colegio.edu', doc);
  }

  // --- Presupuesto de Actividad Escolar (Secretaria) ---
  for (const doc of getPresupuestoActividadData()) {
    await seedOne('Presupuesto de Actividad Escolar', 'secretaria@colegio.edu', doc);
  }

  // ============================================================
  // FASE 2: Iniciar workflows
  // ============================================================
  console.log('\n📋 Fase 2: Iniciando workflows...');

  const wfRevisionPlan = 'Revisión de Planificación';
  const wfAprobacionAcademica = 'Aprobación Académica';
  const wfRevisionActa = 'Revisión de Acta';
  const wfEmisionConstancia = 'Emisión de Constancia';

  // Planificación semanal 3° Grado → pendiente para coordinador de primaria
  const wfPlanificacion3p = await startWorkflow('maestro.3p@colegio.edu', docsCreated.planificacionSemanal3p, wfRevisionPlan);
  if (wfPlanificacion3p) console.log('  ✅ Workflow iniciado: Planificación Semanal 3° Grado → pendiente coordinador');

  // Proyecto Pedagógico → pendiente para coordinador de primaria
  if (await startWorkflow('maestro.5p@colegio.edu', docsCreated.proyectoPedagogico, wfRevisionPlan)) {
    console.log('  ✅ Workflow iniciado: Proyecto Pedagógico → pendiente coordinador');
  }

  // Acta de Consejo de Grado → pendiente para director
  if (await startWorkflow('coord.secundaria@colegio.edu', docsCreated.actaConsejo, wfRevisionActa)) {
    console.log('  ✅ Workflow iniciado: Acta de Consejo de Grado → pendiente director');
  }

  // Constancia Valentina → pendiente para director
  if (await startWorkflow('secretaria@colegio.edu', docsCreated.constanciaValentina, wfEmisionConstancia)) {
    console.log('  ✅ Workflow iniciado: Constancia Valentina → pendiente director');
  }

  // Plan de Evaluación → flujo multi-paso: coord.secundaria aprobará en Fase 3 → después pendiente director
  const wfPlanEval = await startWorkflow('prof.matematica@colegio.edu', docsCreated.planEvaluacion, wfAprobacionAcademica);
  if (wfPlanEval) console.log('  ✅ Workflow iniciado: Plan de Evaluación → Aprobación Académica (2 pasos)');

  // Constancia Santiago → secretaria inicia, director aprobará en Fase 3
  const wfConstanciaSantiago = await startWorkflow('secretaria@colegio.edu', docsCreated.constanciaSantiago, wfEmisionConstancia);
  if (wfConstanciaSantiago) console.log('  ✅ Workflow iniciado: Constancia Santiago → para aprobar');

  // Acta de coordinación pedagógica → vicerrectora inicia, pendiente para director
  if (await startWorkflow('vicerrector@colegio.edu', docsCreated.vicerrectorActa, wfRevisionActa)) {
    console.log('  ✅ Workflow iniciado: Acta Coordinación Pedagógica (Vicerrectoría) → pendiente director');
  }

  // Acta de Compromiso → coord.primaria inicia, director rechazará en Fase 3
  const wfActaCompromiso = await startWorkflow('coord.primaria@colegio.edu', docsCreated.actaCompromiso, wfRevisionActa);
  if (wfActaCompromiso) console.log('  ✅ Workflow iniciado: Acta de Compromiso → para rechazar');

  // ============================================================
  // FASE 3: Procesar aprobaciones
  // ============================================================
  console.log('\n✅ Fase 3: Procesando aprobaciones...');

  // Plan de Evaluación — coord.secundaria aprueba paso 1 → avanza al director
  if (wfPlanEval) {
    await approveWorkflow(
      'coord.secundaria@colegio.edu',
      wfPlanEval.id,
      'APPROVED',
      'Planificación revisada. Criterios de evaluación correctos y alineados al programa.',
    );
    console.log('  ✅ Coord. Secundaria aprobó Plan de Evaluación (paso 1/2) → ahora pendiente director');
  }

  // Constancia Santiago — director aprueba → APROBADO
  if (wfConstanciaSantiago) {
    await approveWorkflow('rector@colegio.edu', wfConstanciaSantiago.id, 'APPROVED');
    console.log('  ✅ Director aprobó Constancia de Santiago → APROBADA');
  }

  // Acta de Compromiso — director rechaza con motivo
  if (wfActaCompromiso) {
    await approveWorkflow(
      'rector@colegio.edu',
      wfActaCompromiso.id,
      'REJECTED',
      'El acta no incluye las firmas originales de los representantes ni del docente. Favor adjuntar la documentación completa escaneada antes de reenviar.',
    );
    console.log('  ✅ Director rechazó Acta de Compromiso con motivo → RECHAZADA');
  }

  // ============================================================
  // FASE 4: Agregar comentarios
  // ============================================================
  console.log('\n💬 Fase 4: Agregando comentarios...');

  // Planificación Semanal — coordinadora solicita cambio
  if (docsCreated.planificacionSemanal3p && wfPlanificacion3p) {
    await approveWorkflow(
      'coord.primaria@colegio.edu',
      wfPlanificacion3p.id,
      'REQUESTED_CHANGES',
      'Agregar los indicadores de evaluación para cada objetivo y especificar los tiempos estimados por actividad. El resto de la planificación está muy bien estructurada.',
    );
    console.log('  ✅ Coord. Primaria solicitó cambios en Planificación Semanal 3° Grado');
  }

  console.log(`\n🎉 ${created} documentos generados exitosamente!`);
  console.log('\nDocumentos creados por:');
  console.log('  • Directora: actas de reunión, memorándums, circular informativa, contrato de inscripción');
  console.log('  • Vicerrectora: memorándum protocolo NEE, acta de coordinación pedagógica');
  console.log('  • Secretaria: constancias de estudio, buena conducta, certificado de culminación, recibo de aranceles');
  console.log('  • Coord. Primaria: informe pedagógico de grupo, presupuesto de actividad');
  console.log('  • Coord. Secundaria: acta de consejo de grado');
  console.log('  • Maestro 1° Grado: reporte de incidencia');
  console.log('  • Maestra 2° Grado: acta de compromiso con representantes');
  console.log('  • Maestro 3° Grado: planificación semanal de clase');
  console.log('  • Maestra 4° Grado: boletín de calificaciones');
  console.log('  • Maestro 5° Grado: proyecto pedagógico de aula');
  console.log('  • Maestra 6° Grado: comunicado a representantes');
  console.log('  • Prof. Biología: solicitud de permiso laboral');
  console.log('  • Prof. Matemática: plan de evaluación trimestral');
  console.log('  • Prof. Lengua: informe de rendimiento académico individual');
  console.log('\nEstado de workflows para la demo:');
  console.log('  📌 Pendientes para el Director: Acta Consejo de Grado, Constancia Valentina, Plan de Evaluación, Acta Coordinación Pedagógica (Vicerrectoría)');
  console.log('  📌 Pendientes para Coord. Primaria: Proyecto Pedagógico');
  console.log('  ✅ Aprobados: Constancia Santiago Ramírez');
  console.log('  ❌ Rechazados: Acta de Compromiso (con motivo del director)');
  console.log('  🔄 Cambios solicitados: Planificación Semanal 3° Grado');
}

main()
  .catch((e) => {
    console.error('\n❌ Error:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
