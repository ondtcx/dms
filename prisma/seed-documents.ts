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
    categoryId?: number;
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

// ============================================================
// Datos de ejemplo para cada plantilla
// ============================================================

function getActaReunionData() {
  return [
    {
      formData: {
        titulo: 'Consejo de Docentes - Primer Lapso',
        fecha: '2026-01-15',
        hora_inicio: '08:00',
        hora_fin: '10:30',
        lugar: 'Salón de Conferencias',
        participantes: 'María Elena Rodríguez (Directora)\nAna Gabriela López (Coord. Primaria)\nRoberto Méndez (Coord. Secundaria)\nLuis García (Profesor)\nCarmen Martínez (Profesora)',
        agenda: '1. Revisión de resultados del primer lapso\n2. Planificación de actividades del segundo lapso\n3. Evaluación del rendimiento estudiantil\n4. Propuestas de mejora pedagógica',
        desarrollo: 'Se revisaron los resultados académicos del primer lapso, observando un rendimiento general satisfactorio. La Coord. de Primaria presentó los indicadores de su nivel mostrando un 85% de aprobación. El Coord. de Secundaria reportó un 78% de aprobación, identificando Matemáticas como el área que requiere mayor atención.',
        acuerdos: '1. Implementar talleres de refuerzo en Matemáticas para Secundaria\n2. Organizar jornada de integración para el segundo lapso\n3. Cada docente debe entregar su planificación actualizada antes del 30 de enero\n4. Próxima reunión: 15 de febrero de 2026',
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
        participantes: 'Ana Gabriela López (Coord. Primaria)\nLuis García (Profesor 1er Grado)\nPadres y representantes de 1er Grado',
        agenda: '1. Informe de rendimiento del primer lapso\n2. Actividades planificadas para el segundo lapso\n3. Normas de convivencia\n4. Preguntas y sugerencias',
        desarrollo: 'La Coordinadora de Primaria dio la bienvenida y presentó los resultados generales del nivel. El Prof. Luis García detalló el progreso de los estudiantes de 1er Grado, destacando avances en lectoescritura y pensamiento lógico-matemático.',
        acuerdos: '1. Los padres se comprometen a apoyar la lectura diaria en casa\n2. Se realizará una feria de ciencias el 15 de marzo\n3. Las comunicaciones se enviarán por el sistema digital\n4. Próxima reunión: 20 de abril de 2026',
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
        programa_academico: 'Educación Primaria',
        nivel: 'Primaria',
        semestre_actual: '1er Grado - Año Escolar 2025-2026',
        fecha_inicio: '2025-09-15',
        promedio: '18.5',
      },
      filename: 'constancia-estudio-valentina-perez.pdf',
      description: 'Constancia de estudio de Valentina Sofía Pérez González',
    },
    {
      formData: {
        nombre_estudiante: 'Santiago Andrés Ramírez Torres',
        identificacion: 'V-32.123.456',
        programa_academico: 'Educación Secundaria',
        nivel: 'Secundaria',
        semestre_actual: '1er Año - Año Escolar 2025-2026',
        fecha_inicio: '2025-09-15',
        promedio: '16.8',
      },
      filename: 'constancia-estudio-santiago-ramirez.pdf',
      description: 'Constancia de estudio de Santiago Andrés Ramírez Torres',
    },
  ];
}

function getCertificadoTrabajoData() {
  return [
    {
      formData: {
        nombre_empleado: 'Luis Fernando García',
        identificacion: 'V-18.234.567',
        cargo: 'Profesor de Educación Primaria',
        fecha_ingreso: '2020-09-01',
        funciones: 'Planificación y ejecución de clases de Matemáticas y Lengua para 1er Grado de Primaria. Elaboración de evaluaciones y seguimiento del rendimiento estudiantil. Participación en consejos de docentes y actividades extracurriculares. Atención a padres y representantes.',
        observaciones: 'El Prof. García ha demostrado excelente desempeño y compromiso con la institución durante su trayectoria.',
      },
      filename: 'certificado-trabajo-luis-garcia.pdf',
      description: 'Certificado de trabajo del Prof. Luis Fernando García',
    },
  ];
}

function getMemorandumData() {
  return [
    {
      formData: {
        numero: 'MEM-2026-001',
        fecha: '2026-02-01',
        para: 'Todo el Personal Docente y Administrativo',
        de: 'María Elena Rodríguez - Directora General',
        asunto: 'Inicio del Segundo Lapso Académico 2025-2026',
        contenido: 'Por medio del presente se comunica al personal docente y administrativo que el segundo lapso académico dará inicio el día lunes 03 de febrero de 2026.\n\nSe recuerda lo siguiente:\n\n1. Las planificaciones del segundo lapso deben estar entregadas a la coordinación correspondiente antes del viernes 07 de febrero.\n\n2. Los horarios de clase se mantienen sin modificaciones.\n\n3. El día viernes 07 de febrero se realizará un consejo de docentes a las 2:00 PM en el Salón de Conferencias.\n\n4. Se solicita puntualidad y asistencia regular.\n\nSin más que agregar, quedo atenta a cualquier consulta.',
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
        contenido: 'Se solicita a los Coordinadores de cada nivel la entrega del informe consolidado de rendimiento académico del primer lapso, el cual debe incluir:\n\n1. Porcentaje de aprobación por materia\n2. Identificación de estudiantes con bajo rendimiento\n3. Estrategias implementadas para mejora\n4. Propuestas para el segundo lapso\n\nFecha límite de entrega: viernes 21 de febrero de 2026.\n\nEl informe debe ser cargado al Sistema de Gestión Documental en la categoría "Informes Académicos".',
      },
      filename: 'memorandum-informes-rendimiento-2026.pdf',
      description: 'Memorándum solicitando informes de rendimiento',
    },
  ];
}

function getInformeAcademicoData() {
  return [
    {
      formData: {
        titulo: 'Informe de Rendimiento Académico - Primaria - Primer Lapso',
        fecha: '2026-02-18',
        autor: 'Ana Gabriela López - Coordinadora de Primaria',
        resumen_ejecutivo: 'El presente informe muestra los resultados académicos del nivel de Primaria durante el primer lapso del año escolar 2025-2026, con un porcentaje de aprobación general del 85%.',
        introduccion: 'El primer lapso académico comprendió desde septiembre 2025 hasta enero 2026. Se evaluaron las áreas de Lengua, Matemáticas, Ciencias Naturales, Ciencias Sociales y Educación Física.',
        objetivo: 'Analizar el rendimiento académico de los estudiantes de Primaria durante el primer lapso para identificar fortalezas y áreas de mejora.',
        metodologia: 'Se recopilaron las calificaciones de todas las materias, se calcularon promedios por grado y por materia, y se identificaron los estudiantes con rendimiento por debajo del promedio esperado.',
        resultados: '1er Grado: 92% de aprobación (destacado en lectoescritura)\n2do Grado: 88% de aprobación\n3er Grado: 85% de aprobación\n4to Grado: 82% de aprobación\n5to Grado: 80% de aprobación\n6to Grado: 83% de aprobación\n\nMaterias con mayor rendimiento: Educación Física (95%), Ciencias Sociales (88%)\nMaterias con menor rendimiento: Matemáticas (78%), Lengua (82%)',
        conclusiones: 'El rendimiento general es satisfactorio. Se identifica la necesidad de reforzar las áreas de Matemáticas y Lengua, especialmente en los grados superiores (4to a 6to). Los grados iniciales muestran resultados sobresalientes.',
        recomendaciones: '1. Implementar talleres de refuerzo en Matemáticas los días sábados\n2. Crear grupos de lectura para fortalecer comprensión lectora\n3. Incorporar estrategias lúdicas en la enseñanza de Matemáticas\n4. Reconocer públicamente a los estudiantes con mejor rendimiento',
      },
      filename: 'informe-rendimiento-primaria-1er-lapso-2026.pdf',
      description: 'Informe de rendimiento académico del nivel de Primaria - Primer Lapso',
    },
  ];
}

function getSolicitudPermisoData() {
  return [
    {
      formData: {
        nombre_empleado: 'Carmen Teresa Martínez',
        cargo: 'Profesora de Secundaria',
        departamento: 'Coordinación de Secundaria',
        fecha_inicio: '2026-03-10',
        fecha_fin: '2026-03-14',
        dias_solicitados: '5',
        motivo: 'Asistencia a curso de actualización docente "Estrategias Innovadoras para la Enseñanza de Ciencias Naturales" organizado por el Ministerio de Educación en la ciudad capital.',
        observaciones: 'Se deja planificación de actividades para los estudiantes durante el período de ausencia. La Prof. suplente será notificada por la Coordinación.',
      },
      filename: 'solicitud-permiso-carmen-martinez-marzo-2026.pdf',
      description: 'Solicitud de permiso de la Prof. Carmen Martínez para curso de actualización',
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
        reportado_por: 'Luis Fernando García - Profesor de guardia',
        tipo_incidente: 'Accidente menor durante actividad deportiva',
        descripcion: 'Durante la clase de Educación Física, el estudiante Miguel Ángel Torres (1er Grado) sufrió una caída mientras corría en la cancha deportiva, presentando una raspadura leve en la rodilla derecha.',
        personas_involucradas: 'Miguel Ángel Torres - Estudiante de 1er Grado\nProf. Luis Fernando García - Profesor de guardia\nEnfermera Rosa Campos - Atención de primeros auxilios',
        acciones_tomadas: '1. Se brindaron primeros auxilios inmediatos (limpieza y curación de la herida)\n2. Se notificó a la representante del estudiante vía telefónica\n3. El estudiante continuó sus actividades normales después de la atención\n4. Se registró en el libro de incidencias de la institución',
        seguimiento: 'Verificar estado del estudiante al día siguiente. Revisar condiciones de la superficie de la cancha deportiva.',
      },
      filename: 'reporte-incidencia-feb-2026-003.pdf',
      description: 'Reporte de incidencia menor en cancha deportiva',
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
    'coord.primaria@colegio.edu',
    'coord.secundaria@colegio.edu',
    'profesor1@colegio.edu',
    'profesor2@colegio.edu',
    'secretaria@colegio.edu',
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

  // Obtener IDs de templates y categorías
  const token = sessions['admin@colegio.edu'].token;
  const allTemplates = await apiGet<Template[]>('/workflows/templates', token);

  // Obtener categorías - usar endpoint de categorías
  const allCategories = await apiGet<Category[]>('/categories', token);
  const allSectionsRes = await apiGet<{ data: Section[] } | Section[]>('/sections', token);
  const allSections = Array.isArray(allSectionsRes) ? allSectionsRes : (allSectionsRes as any).data;

  // Mapas de lookup
  const templateByName: Record<string, number> = {};
  for (const t of allTemplates) {
    templateByName[t.name] = t.id;
  }

  // Obtener templates de documentos (no de workflow)
  const docTemplatesRes = await apiGet<{ data: { id: number; name: string }[] } | { id: number; name: string }[]>(
    '/document-templates?limit=50',
    token,
  );
  const docTemplates = Array.isArray(docTemplatesRes) ? docTemplatesRes : (docTemplatesRes as any).data;
  const docTemplateByName: Record<string, number> = {};
  for (const t of docTemplates) {
    docTemplateByName[t.name] = t.id;
  }

  const catByName: Record<string, number> = {};
  for (const c of allCategories) {
    catByName[c.name] = c.id;
  }

  const secByName: Record<string, number> = {};
  for (const s of allSections) {
    secByName[s.name] = s.id;
  }

  console.log('\n📝 Creando documentos desde plantillas...\n');

  let created = 0;

  // --- Actas de Reunión (creadas por la Directora) ---
  for (const acta of getActaReunionData()) {
    try {
      await createFromTemplate(sessions['director@colegio.edu'].token, {
        templateId: docTemplateByName['Acta de Reunión'],
        formData: acta.formData,
        filename: acta.filename,
        description: acta.description,
        categoryId: catByName['Actas y Reuniones'],
        sectionId: secByName['Gestión Académica'],
      });
      console.log(`  ✅ ${acta.filename}`);
      created++;
    } catch (e: any) {
      console.error(`  ❌ ${acta.filename}: ${e.message}`);
    }
    await delay(500);
  }

  // --- Constancias de Estudio (creadas por la Secretaria) ---
  for (const constancia of getConstanciaEstudioData()) {
    try {
      await createFromTemplate(sessions['secretaria@colegio.edu'].token, {
        templateId: docTemplateByName['Constancia de Estudio'],
        formData: constancia.formData,
        filename: constancia.filename,
        description: constancia.description,
        categoryId: catByName['Constancias y Certificados'],
        sectionId: secByName['Gestión Institucional'],
      });
      console.log(`  ✅ ${constancia.filename}`);
      created++;
    } catch (e: any) {
      console.error(`  ❌ ${constancia.filename}: ${e.message}`);
    }
    await delay(500);
  }

  // --- Certificado de Trabajo (creado por la Secretaria) ---
  for (const cert of getCertificadoTrabajoData()) {
    try {
      await createFromTemplate(sessions['secretaria@colegio.edu'].token, {
        templateId: docTemplateByName['Certificado de Trabajo'],
        formData: cert.formData,
        filename: cert.filename,
        description: cert.description,
        categoryId: catByName['Constancias y Certificados'],
        sectionId: secByName['Gestión Institucional'],
      });
      console.log(`  ✅ ${cert.filename}`);
      created++;
    } catch (e: any) {
      console.error(`  ❌ ${cert.filename}: ${e.message}`);
    }
    await delay(500);
  }

  // --- Memorándums (creados por la Directora) ---
  for (const memo of getMemorandumData()) {
    try {
      await createFromTemplate(sessions['director@colegio.edu'].token, {
        templateId: docTemplateByName['Memorándum'],
        formData: memo.formData,
        filename: memo.filename,
        description: memo.description,
        categoryId: catByName['Administrativos'],
        sectionId: secByName['Gestión Administrativa'],
      });
      console.log(`  ✅ ${memo.filename}`);
      created++;
    } catch (e: any) {
      console.error(`  ❌ ${memo.filename}: ${e.message}`);
    }
    await delay(500);
  }

  // --- Informe Académico (creado por Coordinadora de Primaria) ---
  for (const informe of getInformeAcademicoData()) {
    try {
      await createFromTemplate(sessions['coord.primaria@colegio.edu'].token, {
        templateId: docTemplateByName['Informe Académico'],
        formData: informe.formData,
        filename: informe.filename,
        description: informe.description,
        categoryId: catByName['Informes Académicos'],
        sectionId: secByName['Gestión Académica'],
      });
      console.log(`  ✅ ${informe.filename}`);
      created++;
    } catch (e: any) {
      console.error(`  ❌ ${informe.filename}: ${e.message}`);
    }
    await delay(500);
  }

  // --- Solicitud de Permiso (creada por Profesora) ---
  for (const sol of getSolicitudPermisoData()) {
    try {
      await createFromTemplate(sessions['profesor2@colegio.edu'].token, {
        templateId: docTemplateByName['Solicitud de Permiso'],
        formData: sol.formData,
        filename: sol.filename,
        description: sol.description,
        categoryId: catByName['Administrativos'],
        sectionId: secByName['Gestión Administrativa'],
      });
      console.log(`  ✅ ${sol.filename}`);
      created++;
    } catch (e: any) {
      console.error(`  ❌ ${sol.filename}: ${e.message}`);
    }
    await delay(500);
  }

  // --- Reporte de Incidencia (creado por Profesor) ---
  for (const rep of getReporteIncidenciaData()) {
    try {
      await createFromTemplate(sessions['profesor1@colegio.edu'].token, {
        templateId: docTemplateByName['Reporte de Incidencia Escolar'],
        formData: rep.formData,
        filename: rep.filename,
        description: rep.description,
        categoryId: catByName['Administrativos'],
        sectionId: secByName['Gestión Administrativa'],
      });
      console.log(`  ✅ ${rep.filename}`);
      created++;
    } catch (e: any) {
      console.error(`  ❌ ${rep.filename}: ${e.message}`);
    }
  }

  console.log(`\n🎉 ${created} documentos generados exitosamente!`);
  console.log('\nLos documentos fueron creados por diferentes usuarios:');
  console.log('  • Directora: actas de reunión, memorándums');
  console.log('  • Secretaria: constancias de estudio, certificados de trabajo');
  console.log('  • Coordinadora: informe académico');
  console.log('  • Profesores: solicitudes de permiso, reportes de incidencia');
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  console.error('\n¿Está el backend corriendo en', API_URL, '?');
  process.exit(1);
});
