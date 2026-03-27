/**
 * Script para generar documentos de ejemplo usando la API.
 *
 * Requisitos:
 *   1. Backend corriendo en http://localhost:3001
 *   2. Seed base ejecutado (npm run seed)
 *
 * Uso:
 *   npm run seed:documents
 */

const API_URL = 'http://localhost:3001/api';

interface LoginResponse {
  user: { id: string; name: string; role: string };
  access_token: string;
}

interface Template {
  id: number;
  name: string;
  type: string;
}

interface Category {
  id: number;
  name: string;
}

interface Section {
  id: number;
  name: string;
}

// ============================================================
// Helpers
// ============================================================

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function login(email: string, retries = 3): Promise<LoginResponse> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Demo123!' }),
      });
      if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}`);
      return res.json();
    } catch (e) {
      if (i < retries - 1) {
        await delay(1000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Login failed for ${email} after ${retries} retries`);
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function createFromTemplate(
  token: string,
  data: {
    templateId: number;
    formData: Record<string, any>;
    filename: string;
    description: string;
    sectionId?: number;
    isPublic?: boolean;
  },
) {
  const res = await fetch(`${API_URL}/documents/from-template`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Create from template failed: ${res.status} - ${error}`);
  }
  return res.json();
}

async function apiPost(path: string, token: string, body: object): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`POST ${path} failed: ${res.status} - ${error}`);
  }
  return res.json();
}

async function startWorkflow(token: string, documentId: number, templateId: number): Promise<{ id: number }> {
  return apiPost(`/workflows/documents/${documentId}/initiate`, token, { templateId });
}

async function approveWorkflow(token: string, workflowId: number, action: string, comment?: string): Promise<void> {
  await apiPost(`/workflows/${workflowId}/approve`, token, { action, ...(comment ? { comment } : {}) });
}

async function addComment(token: string, documentId: number, content: string, parentId?: number): Promise<{ id: number }> {
  return apiPost(`/documents/${documentId}/comments`, token, { content, ...(parentId ? { parentId } : {}) });
}

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
// Script principal
// ============================================================

async function main() {
  console.log('📄 Generando documentos de ejemplo...\n');
  console.log('Conectando al backend en', API_URL, '...\n');

  // Login con cada usuario
  const sessions: Record<string, { token: string; name: string }> = {};
  const users = [
    'admin@colegio.edu',
    'director@colegio.edu',
    'vicerrector@colegio.edu',
    'coord.primaria@colegio.edu',
    'coord.secundaria@colegio.edu',
    'secretaria@colegio.edu',
    'maestro.1p@colegio.edu',
    'maestro.2p@colegio.edu',
    'maestro.3p@colegio.edu',
    'maestro.4p@colegio.edu',
    'maestro.5p@colegio.edu',
    'maestro.6p@colegio.edu',
    'prof.biologia@colegio.edu',
    'prof.matematica@colegio.edu',
    'prof.lengua@colegio.edu',
  ];

  for (const email of users) {
    try {
      const { user, access_token } = await login(email);
      sessions[email] = { token: access_token, name: user.name };
      console.log(`  ✅ Login: ${user.name} (${email})`);
    } catch (e: any) {
      console.error(`  ❌ Login falló: ${email} - ${e.message}`);
      return;
    }
    await delay(300);
  }

  // Obtener IDs de templates de documentos
  const token = sessions['admin@colegio.edu'].token;

  const docTemplatesRes = await apiGet<{ data: { id: number; name: string }[] } | { id: number; name: string }[]>(
    '/document-templates?limit=50',
    token,
  );
  const docTemplates = Array.isArray(docTemplatesRes) ? docTemplatesRes : (docTemplatesRes as any).data;
  const docTemplateByName: Record<string, number> = {};
  for (const t of docTemplates) {
    docTemplateByName[t.name] = t.id;
  }

  const allSectionsRes = await apiGet<{ data: Section[] } | Section[]>('/sections', token);
  const allSections = Array.isArray(allSectionsRes) ? allSectionsRes : (allSectionsRes as any).data;
  const secByName: Record<string, number> = {};
  for (const s of allSections) {
    secByName[s.name] = s.id;
  }

  // Obtener IDs de workflow templates
  const wfTemplatesRaw = await apiGet<any[]>('/workflows/templates', token);
  const wfByName: Record<string, number> = {};
  for (const t of wfTemplatesRaw) {
    wfByName[t.name] = t.id;
  }

  console.log('\n📝 Creando documentos desde plantillas...\n');

  let created = 0;
  const docsCreated: Record<string, number> = {};

  // --- Actas de Reunión de Personal (Directora) ---
  const actaId = docTemplateByName['Acta de Reunión de Personal'];
  if (!actaId) {
    console.error('  ❌ Plantilla "Acta de Reunión de Personal" no encontrada');
  } else {
    for (const acta of getActaReunionPersonalData()) {
      try {
        const doc = await createFromTemplate(sessions['director@colegio.edu'].token, {
          templateId: actaId,
          formData: acta.formData,
          filename: acta.filename,
          description: acta.description,
          sectionId: secByName['Gestión Académica'],
        });
        if (!docsCreated.actaReunionConsejo) docsCreated.actaReunionConsejo = doc.id;
        console.log(`  ✅ ${acta.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${acta.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // --- Constancias de Estudio (Secretaria) ---
  const constanciaId = docTemplateByName['Constancia de Estudio'];
  if (!constanciaId) {
    console.error('  ❌ Plantilla "Constancia de Estudio" no encontrada');
  } else {
    for (const constancia of getConstanciaEstudioData()) {
      try {
        const doc = await createFromTemplate(sessions['secretaria@colegio.edu'].token, {
          templateId: constanciaId,
          formData: constancia.formData,
          filename: constancia.filename,
          description: constancia.description,
          sectionId: secByName['Gestión Institucional'],
        });
        if (!docsCreated.constanciaValentina) docsCreated.constanciaValentina = doc.id;
        else docsCreated.constanciaSantiago = doc.id;
        console.log(`  ✅ ${constancia.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${constancia.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // --- Constancia de Buena Conducta (Secretaria) ---
  const conductaId = docTemplateByName['Constancia de Buena Conducta'];
  if (!conductaId) {
    console.error('  ❌ Plantilla "Constancia de Buena Conducta" no encontrada');
  } else {
    for (const cert of getConstanciaBuenaConductaData()) {
      try {
        await createFromTemplate(sessions['secretaria@colegio.edu'].token, {
          templateId: conductaId,
          formData: cert.formData,
          filename: cert.filename,
          description: cert.description,
          sectionId: secByName['Gestión Institucional'],
        });
        console.log(`  ✅ ${cert.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${cert.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // --- Memorándums Internos (Directora) ---
  const memoId = docTemplateByName['Memorándum Interno'];
  if (!memoId) {
    console.error('  ❌ Plantilla "Memorándum Interno" no encontrada');
  } else {
    for (const memo of getMemorandumInternoData()) {
      try {
        await createFromTemplate(sessions['director@colegio.edu'].token, {
          templateId: memoId,
          formData: memo.formData,
          filename: memo.filename,
          description: memo.description,
          sectionId: secByName['Gestión Administrativa'],
        });
        console.log(`  ✅ ${memo.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${memo.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // --- Documentos de la Vicerrectora ---
  if (memoId) {
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
    try {
      const viceMemo = await createFromTemplate(sessions['vicerrector@colegio.edu'].token, {
        templateId: memoId,
        formData: viceMemoData.formData,
        filename: viceMemoData.filename,
        description: viceMemoData.description,
        sectionId: secByName['Gestión Administrativa'],
      });
      docsCreated.vicerrectorMemo = viceMemo.id;
      console.log(`  ✅ ${viceMemoData.filename}`);
      created++;
    } catch (e: any) {
      console.error(`  ❌ ${viceMemoData.filename}: ${e.message}`);
    }
    await delay(500);
  }

  if (actaId) {
    const viceActaData = {
      formData: {
        numero_acta: 'ACTA-VICE-2026-001',
        fecha: '2026-03-12',
        hora_inicio: '09:00',
        hora_fin: '11:30',
        lugar: 'Sala de Conferencias — Vicerrectoría',
        tipo_reunion: 'Reunión de Coordinación Pedagógica',
        presidente: 'Lucía Fernanda Castillo - Vicerrectora',
        secretario: 'Carlos Alberto Mendoza - Secretario Académico',
        asistentes: 'Coord. Primaria: Andrea Patricia Salcedo\nCoord. Secundaria: Roberto Miguel Paredes\nMaestro 6° Grado: Natalia Cecilia Ortega\nProf. Matemática: Eduardo José Villareal',
        orden_del_dia: '1. Seguimiento de metas pedagógicas del segundo lapso\n2. Revisión de indicadores de rendimiento por nivel\n3. Plan de tutorías para estudiantes con bajo rendimiento\n4. Próximas actividades institucionales',
        desarrollo: 'La Vicerrectora dio inicio a la reunión señalando los avances registrados en el segundo lapso. La Coord. de Primaria presentó los indicadores de rendimiento actualizados, destacando una mejora del 8% en lectura comprensiva. La Coord. de Secundaria informó sobre el plan de tutorías implementado en Matemática y Lengua. Se acordó reforzar el seguimiento individualizado de los 14 estudiantes identificados con bajo rendimiento.',
        acuerdos: '1. Entregar informe de rendimiento consolidado del segundo lapso antes del 20 de marzo.\n2. Implementar tutorías grupales los miércoles de 2:00 PM a 3:30 PM.\n3. Convocar reunión con representantes de estudiantes en riesgo para el 25 de marzo.\n4. Actualizar el registro de seguimiento en el sistema documental.',
        proxima_reunion: '26 de marzo de 2026, 9:00 AM',
      },
      filename: 'acta-reunion-coordinacion-pedagogica-2026-001.pdf',
      description: 'Acta de reunión de coordinación pedagógica — presidida por Vicerrectoría',
    };
    try {
      const viceActa = await createFromTemplate(sessions['vicerrector@colegio.edu'].token, {
        templateId: actaId,
        formData: viceActaData.formData,
        filename: viceActaData.filename,
        description: viceActaData.description,
        sectionId: secByName['Gestión Administrativa'],
      });
      docsCreated.vicerrectorActa = viceActa.id;
      console.log(`  ✅ ${viceActaData.filename}`);
      created++;
    } catch (e: any) {
      console.error(`  ❌ ${viceActaData.filename}: ${e.message}`);
    }
    await delay(500);
  }

  // --- Informe Pedagógico de Grupo (Coordinadora de Primaria) ---
  const informeId = docTemplateByName['Informe Pedagógico de Grupo'];
  if (!informeId) {
    console.error('  ❌ Plantilla "Informe Pedagógico de Grupo" no encontrada');
  } else {
    for (const informe of getInformePedagogicoGrupoData()) {
      try {
        const doc = await createFromTemplate(sessions['coord.primaria@colegio.edu'].token, {
          templateId: informeId,
          formData: informe.formData,
          filename: informe.filename,
          description: informe.description,
          sectionId: secByName['Gestión Académica'],
        });
        docsCreated.informePedagogico = doc.id;
        console.log(`  ✅ ${informe.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${informe.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // --- Solicitud de Permiso Laboral (Profesora de Biología) ---
  const permisoId = docTemplateByName['Solicitud de Permiso Laboral'];
  if (!permisoId) {
    console.error('  ❌ Plantilla "Solicitud de Permiso Laboral" no encontrada');
  } else {
    for (const sol of getSolicitudPermisoLaboralData()) {
      try {
        await createFromTemplate(sessions['prof.biologia@colegio.edu'].token, {
          templateId: permisoId,
          formData: sol.formData,
          filename: sol.filename,
          description: sol.description,
          sectionId: secByName['Gestión Administrativa'],
        });
        console.log(`  ✅ ${sol.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${sol.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // --- Reporte de Incidencia Escolar (Maestro de 1° Grado) ---
  const reporteId = docTemplateByName['Reporte de Incidencia Escolar'];
  if (!reporteId) {
    console.error('  ❌ Plantilla "Reporte de Incidencia Escolar" no encontrada');
  } else {
    for (const rep of getReporteIncidenciaData()) {
      try {
        await createFromTemplate(sessions['maestro.1p@colegio.edu'].token, {
          templateId: reporteId,
          formData: rep.formData,
          filename: rep.filename,
          description: rep.description,
          sectionId: secByName['Gestión Administrativa'],
        });
        console.log(`  ✅ ${rep.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${rep.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // ── PLANIFICACIONES ──────────────────────────────────────────

  // --- Planificación Semanal de Clase (Maestro 3° Grado) ---
  const planSemanalId = docTemplateByName['Planificación Semanal de Clase'];
  if (!planSemanalId) {
    console.error('  ❌ Plantilla "Planificación Semanal de Clase" no encontrada');
  } else {
    for (const doc of getPlanificacionSemanalData()) {
      try {
        const created_doc = await createFromTemplate(sessions['maestro.3p@colegio.edu'].token, {
          templateId: planSemanalId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Académica'],
        });
        docsCreated.planificacionSemanal3p = created_doc.id;
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // --- Proyecto Pedagógico de Aula (Maestro 5° Grado) ---
  const proyectoId = docTemplateByName['Proyecto Pedagógico de Aula'];
  if (!proyectoId) {
    console.error('  ❌ Plantilla "Proyecto Pedagógico de Aula" no encontrada');
  } else {
    for (const doc of getProyectoPedagogicoData()) {
      try {
        const created_doc = await createFromTemplate(sessions['maestro.5p@colegio.edu'].token, {
          templateId: proyectoId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Académica'],
        });
        docsCreated.proyectoPedagogico = created_doc.id;
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // --- Plan de Evaluación Trimestral (Prof. Matemática) ---
  const planEvalId = docTemplateByName['Plan de Evaluación Trimestral'];
  if (!planEvalId) {
    console.error('  ❌ Plantilla "Plan de Evaluación Trimestral" no encontrada');
  } else {
    for (const doc of getPlanEvaluacionData()) {
      try {
        const created_doc = await createFromTemplate(sessions['prof.matematica@colegio.edu'].token, {
          templateId: planEvalId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Académica'],
        });
        docsCreated.planEvaluacion = created_doc.id;
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // ── ACTAS Y REUNIONES ─────────────────────────────────────────

  // --- Acta de Consejo de Grado (Coord. Secundaria) ---
  const actaConsejoId = docTemplateByName['Acta de Consejo de Grado'];
  if (!actaConsejoId) {
    console.error('  ❌ Plantilla "Acta de Consejo de Grado" no encontrada');
  } else {
    for (const doc of getActaConsejoGradoData()) {
      try {
        const created_doc = await createFromTemplate(sessions['coord.secundaria@colegio.edu'].token, {
          templateId: actaConsejoId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Académica'],
        });
        docsCreated.actaConsejo = created_doc.id;
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // --- Acta de Compromiso con Representantes (Maestra 2° Grado) ---
  const actaCompromisoId = docTemplateByName['Acta de Compromiso con Representantes'];
  if (!actaCompromisoId) {
    console.error('  ❌ Plantilla "Acta de Compromiso con Representantes" no encontrada');
  } else {
    for (const doc of getActaCompromisoData()) {
      try {
        const created_doc = await createFromTemplate(sessions['coord.primaria@colegio.edu'].token, {
          templateId: actaCompromisoId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Académica'],
        });
        docsCreated.actaCompromiso = created_doc.id;
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // ── CONSTANCIAS Y CERTIFICADOS ────────────────────────────────

  // --- Certificado de Culminación de Estudios (Secretaria) ---
  const certificadoId = docTemplateByName['Certificado de Culminación de Estudios'];
  if (!certificadoId) {
    console.error('  ❌ Plantilla "Certificado de Culminación de Estudios" no encontrada');
  } else {
    for (const doc of getCertificadoCulminacionData()) {
      try {
        await createFromTemplate(sessions['secretaria@colegio.edu'].token, {
          templateId: certificadoId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Institucional'],
        });
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // ── INFORMES ACADÉMICOS ───────────────────────────────────────

  // --- Informe de Rendimiento Académico Individual (Prof. Lengua) ---
  const informeIndId = docTemplateByName['Informe de Rendimiento Académico Individual'];
  if (!informeIndId) {
    console.error('  ❌ Plantilla "Informe de Rendimiento Académico Individual" no encontrada');
  } else {
    for (const doc of getInformeRendimientoIndividualData()) {
      try {
        await createFromTemplate(sessions['prof.lengua@colegio.edu'].token, {
          templateId: informeIndId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Académica'],
        });
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // --- Boletín de Calificaciones (Maestra 4° Grado) ---
  const boletinId = docTemplateByName['Boletín de Calificaciones'];
  if (!boletinId) {
    console.error('  ❌ Plantilla "Boletín de Calificaciones" no encontrada');
  } else {
    for (const doc of getBoletinCalificacionesData()) {
      try {
        await createFromTemplate(sessions['maestro.4p@colegio.edu'].token, {
          templateId: boletinId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Académica'],
        });
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // ── ADMINISTRATIVOS ───────────────────────────────────────────

  // --- Circular Informativa (Directora) ---
  const circularId = docTemplateByName['Circular Informativa'];
  if (!circularId) {
    console.error('  ❌ Plantilla "Circular Informativa" no encontrada');
  } else {
    for (const doc of getCircularInformativaData()) {
      try {
        await createFromTemplate(sessions['director@colegio.edu'].token, {
          templateId: circularId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Administrativa'],
        });
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // --- Comunicado a Representantes (Maestra 6° Grado) ---
  const comunicadoId = docTemplateByName['Comunicado a Representantes'];
  if (!comunicadoId) {
    console.error('  ❌ Plantilla "Comunicado a Representantes" no encontrada');
  } else {
    for (const doc of getComunicadoRepresentantesData()) {
      try {
        await createFromTemplate(sessions['maestro.6p@colegio.edu'].token, {
          templateId: comunicadoId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Administrativa'],
        });
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // ── LEGALES ───────────────────────────────────────────────────

  // --- Contrato de Inscripción Estudiantil (Directora) ---
  const contratoId = docTemplateByName['Contrato de Inscripción Estudiantil'];
  if (!contratoId) {
    console.error('  ❌ Plantilla "Contrato de Inscripción Estudiantil" no encontrada');
  } else {
    for (const doc of getContratoInscripcionData()) {
      try {
        await createFromTemplate(sessions['director@colegio.edu'].token, {
          templateId: contratoId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Institucional'],
        });
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // ── FINANCIEROS ───────────────────────────────────────────────

  // --- Recibo de Pago de Aranceles (Secretaria) ---
  const reciboId = docTemplateByName['Recibo de Pago de Aranceles'];
  if (!reciboId) {
    console.error('  ❌ Plantilla "Recibo de Pago de Aranceles" no encontrada');
  } else {
    for (const doc of getReciboArancelesData()) {
      try {
        await createFromTemplate(sessions['secretaria@colegio.edu'].token, {
          templateId: reciboId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Institucional'],
        });
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // --- Presupuesto de Actividad Escolar (Coord. Primaria) ---
  const presupuestoId = docTemplateByName['Presupuesto de Actividad Escolar'];
  if (!presupuestoId) {
    console.error('  ❌ Plantilla "Presupuesto de Actividad Escolar" no encontrada');
  } else {
    for (const doc of getPresupuestoActividadData()) {
      try {
        await createFromTemplate(sessions['secretaria@colegio.edu'].token, {
          templateId: presupuestoId,
          formData: doc.formData,
          filename: doc.filename,
          description: doc.description,
          sectionId: secByName['Gestión Institucional'],
        });
        console.log(`  ✅ ${doc.filename}`);
        created++;
      } catch (e: any) {
        console.error(`  ❌ ${doc.filename}: ${e.message}`);
      }
      await delay(500);
    }
  }

  // ============================================================
  // FASE 2: Iniciar workflows
  // ============================================================
  console.log('\n📋 Fase 2: Iniciando workflows...');

  const wfRevisionPlan = wfByName['Revisión de Planificación'];
  const wfAprobacionAcademica = wfByName['Aprobación Académica'];
  const wfRevisionActa = wfByName['Revisión de Acta'];
  const wfEmisionConstancia = wfByName['Emisión de Constancia'];

  // Planificación semanal 3° Grado → pendiente para coordinador de primaria
  let wfPlanificacion3p: { id: number } | null = null;
  if (wfRevisionPlan && docsCreated.planificacionSemanal3p) {
    try {
      wfPlanificacion3p = await startWorkflow(sessions['maestro.3p@colegio.edu'].token, docsCreated.planificacionSemanal3p, wfRevisionPlan);
      console.log('  ✅ Workflow iniciado: Planificación Semanal 3° Grado → pendiente coordinador');
    } catch (e: any) {
      console.error(`  ❌ Workflow Planificación 3°: ${e.message}`);
    }
    await delay(400);
  }

  // Proyecto Pedagógico → pendiente para coordinador de primaria
  if (wfRevisionPlan && docsCreated.proyectoPedagogico) {
    try {
      await startWorkflow(sessions['maestro.5p@colegio.edu'].token, docsCreated.proyectoPedagogico, wfRevisionPlan);
      console.log('  ✅ Workflow iniciado: Proyecto Pedagógico → pendiente coordinador');
    } catch (e: any) {
      console.error(`  ❌ Workflow Proyecto Pedagógico: ${e.message}`);
    }
    await delay(400);
  }

  // Acta de Consejo de Grado → pendiente para director
  if (wfRevisionActa && docsCreated.actaConsejo) {
    try {
      await startWorkflow(sessions['coord.secundaria@colegio.edu'].token, docsCreated.actaConsejo, wfRevisionActa);
      console.log('  ✅ Workflow iniciado: Acta de Consejo de Grado → pendiente director');
    } catch (e: any) {
      console.error(`  ❌ Workflow Acta Consejo: ${e.message}`);
    }
    await delay(400);
  }

  // Constancia Valentina → pendiente para director
  if (wfEmisionConstancia && docsCreated.constanciaValentina) {
    try {
      await startWorkflow(sessions['secretaria@colegio.edu'].token, docsCreated.constanciaValentina, wfEmisionConstancia);
      console.log('  ✅ Workflow iniciado: Constancia Valentina → pendiente director');
    } catch (e: any) {
      console.error(`  ❌ Workflow Constancia Valentina: ${e.message}`);
    }
    await delay(400);
  }

  // Plan de Evaluación → flujo multi-paso: coord.secundaria aprobará en Fase 3 → después pendiente director
  let wfPlanEval: { id: number } | null = null;
  if (wfAprobacionAcademica && docsCreated.planEvaluacion) {
    try {
      wfPlanEval = await startWorkflow(sessions['prof.matematica@colegio.edu'].token, docsCreated.planEvaluacion, wfAprobacionAcademica);
      console.log('  ✅ Workflow iniciado: Plan de Evaluación → Aprobación Académica (2 pasos)');
    } catch (e: any) {
      console.error(`  ❌ Workflow Plan Evaluación: ${e.message}`);
    }
    await delay(400);
  }

  // Constancia Santiago → secretaria inicia, director aprobará en Fase 3
  let wfConstanciaSantiago: { id: number } | null = null;
  if (wfEmisionConstancia && docsCreated.constanciaSantiago) {
    try {
      wfConstanciaSantiago = await startWorkflow(sessions['secretaria@colegio.edu'].token, docsCreated.constanciaSantiago, wfEmisionConstancia);
      console.log('  ✅ Workflow iniciado: Constancia Santiago → para aprobar');
    } catch (e: any) {
      console.error(`  ❌ Workflow Constancia Santiago: ${e.message}`);
    }
    await delay(400);
  }

  // Acta de coordinación pedagógica → vicerrectora inicia, pendiente para director
  if (wfRevisionActa && docsCreated.vicerrectorActa) {
    try {
      await startWorkflow(sessions['vicerrector@colegio.edu'].token, docsCreated.vicerrectorActa, wfRevisionActa);
      console.log('  ✅ Workflow iniciado: Acta Coordinación Pedagógica (Vicerrectoría) → pendiente director');
    } catch (e: any) {
      console.error(`  ❌ Workflow Acta Vicerrectoría: ${e.message}`);
    }
    await delay(400);
  }

  // Acta de Compromiso → coord.primaria inicia, director rechazará en Fase 3
  let wfActaCompromiso: { id: number } | null = null;
  if (wfRevisionActa && docsCreated.actaCompromiso) {
    try {
      wfActaCompromiso = await startWorkflow(sessions['coord.primaria@colegio.edu'].token, docsCreated.actaCompromiso, wfRevisionActa);
      console.log('  ✅ Workflow iniciado: Acta de Compromiso → para rechazar');
    } catch (e: any) {
      console.error(`  ❌ Workflow Acta Compromiso: ${e.message}`);
    }
    await delay(400);
  }

  // ============================================================
  // FASE 3: Procesar aprobaciones
  // ============================================================
  console.log('\n✅ Fase 3: Procesando aprobaciones...');

  // Plan de Evaluación — coord.secundaria aprueba paso 1 → avanza al director
  if (wfPlanEval) {
    try {
      await approveWorkflow(sessions['coord.secundaria@colegio.edu'].token, wfPlanEval.id, 'APPROVED', 'Planificación revisada. Criterios de evaluación correctos y alineados al programa.');
      console.log('  ✅ Coord. Secundaria aprobó Plan de Evaluación (paso 1/2) → ahora pendiente director');
    } catch (e: any) {
      console.error(`  ❌ Aprobación Plan Evaluación paso 1: ${e.message}`);
    }
    await delay(400);
  }

  // Constancia Santiago — director aprueba → APROBADO
  if (wfConstanciaSantiago) {
    try {
      await approveWorkflow(sessions['director@colegio.edu'].token, wfConstanciaSantiago.id, 'APPROVED');
      console.log('  ✅ Director aprobó Constancia de Santiago → APROBADA');
    } catch (e: any) {
      console.error(`  ❌ Aprobación Constancia Santiago: ${e.message}`);
    }
    await delay(400);
  }

  // Acta de Compromiso — director rechaza con motivo
  if (wfActaCompromiso) {
    try {
      await approveWorkflow(
        sessions['director@colegio.edu'].token,
        wfActaCompromiso.id,
        'REJECTED',
        'El acta no incluye las firmas originales de los representantes ni del docente. Favor adjuntar la documentación completa escaneada antes de reenviar.',
      );
      console.log('  ✅ Director rechazó Acta de Compromiso con motivo → RECHAZADA');
    } catch (e: any) {
      console.error(`  ❌ Rechazo Acta Compromiso: ${e.message}`);
    }
    await delay(400);
  }

  // ============================================================
  // FASE 4: Agregar comentarios
  // ============================================================
  console.log('\n💬 Fase 4: Agregando comentarios...');

  // Proyecto Pedagógico — coordinadora comenta y maestro responde (threading)
  if (docsCreated.proyectoPedagogico) {
    try {
      const comment1 = await addComment(
        sessions['coord.primaria@colegio.edu'].token,
        docsCreated.proyectoPedagogico,
        'Revisar los objetivos específicos de la Unidad 3. La metodología propuesta para Ciencias Naturales requiere mayor detalle en las actividades experimentales y los recursos necesarios.',
      );
      console.log('  ✅ Comentario de Coord. Primaria en Proyecto Pedagógico');
      await delay(300);

      await addComment(
        sessions['maestro.5p@colegio.edu'].token,
        docsCreated.proyectoPedagogico,
        'Actualizado según las indicaciones. Se incorporaron las actividades de laboratorio con materiales reciclados y se amplió la bibliografía de referencia para cada semana.',
        comment1.id,
      );
      console.log('  ✅ Respuesta del Maestro 5° Grado (reply en thread)');
    } catch (e: any) {
      console.error(`  ❌ Comentarios Proyecto Pedagógico: ${e.message}`);
    }
    await delay(400);
  }

  // Acta de Reunión Consejo Docente — director agrega nota
  if (docsCreated.actaReunionConsejo) {
    try {
      await addComment(
        sessions['director@colegio.edu'].token,
        docsCreated.actaReunionConsejo,
        'Confirmar asistencia del representante de 3°C antes de la firma definitiva del acta. Pendiente también el cierre de los acuerdos del punto 4.',
      );
      console.log('  ✅ Comentario de Director en Acta de Reunión Consejo Docente');
    } catch (e: any) {
      console.error(`  ❌ Comentario Acta Reunión: ${e.message}`);
    }
    await delay(400);
  }

  // Informe Pedagógico — coordinadora agrega observación
  if (docsCreated.informePedagogico) {
    try {
      await addComment(
        sessions['coord.primaria@colegio.edu'].token,
        docsCreated.informePedagogico,
        'Excelente informe. Compartir este análisis con los maestros de apoyo para coordinar el plan de intervención de los alumnos identificados con dificultades lectoras.',
      );
      console.log('  ✅ Comentario de Coord. Primaria en Informe Pedagógico');
    } catch (e: any) {
      console.error(`  ❌ Comentario Informe Pedagógico: ${e.message}`);
    }
    await delay(400);
  }

  // Planificación Semanal — coordinadora solicita cambio
  if (docsCreated.planificacionSemanal3p && wfPlanificacion3p) {
    try {
      await approveWorkflow(
        sessions['coord.primaria@colegio.edu'].token,
        wfPlanificacion3p.id,
        'REQUESTED_CHANGES',
        'Agregar los indicadores de evaluación para cada objetivo y especificar los tiempos estimados por actividad. El resto de la planificación está muy bien estructurada.',
      );
      console.log('  ✅ Coord. Primaria solicitó cambios en Planificación Semanal 3° Grado');
    } catch (e: any) {
      console.error(`  ❌ Solicitud de cambios Planificación: ${e.message}`);
    }
    await delay(400);
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

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  console.error('\n¿Está el backend corriendo en', API_URL, '?');
  process.exit(1);
});
