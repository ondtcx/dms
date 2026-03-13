import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../src/auth/role.enum';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...\n');

  const password = await bcrypt.hash('Demo123!', 10);

  // ============================================================
  // DEPARTAMENTOS
  // ============================================================
  console.log('🏢 Creando departamentos...');

  const deptDireccion = await prisma.department.upsert({
    where: { code: 'DIR' },
    update: {},
    create: {
      name: 'Dirección General',
      code: 'DIR',
      description: 'Dirección general de la institución educativa',
      color: '#7c3aed',
      icon: 'Building2',
    },
  });

  const deptPrimaria = await prisma.department.upsert({
    where: { code: 'PRIM' },
    update: {},
    create: {
      name: 'Coordinación de Primaria',
      code: 'PRIM',
      description: 'Coordinación del nivel de educación primaria',
      color: '#2563eb',
      icon: 'BookOpen',
    },
  });

  const deptSecundaria = await prisma.department.upsert({
    where: { code: 'SEC' },
    update: {},
    create: {
      name: 'Coordinación de Secundaria',
      code: 'SEC',
      description: 'Coordinación del nivel de educación secundaria',
      color: '#059669',
      icon: 'GraduationCap',
    },
  });

  const deptSecretaria = await prisma.department.upsert({
    where: { code: 'SECR' },
    update: {},
    create: {
      name: 'Secretaría Académica',
      code: 'SECR',
      description: 'Gestión administrativa y emisión de constancias',
      color: '#d97706',
      icon: 'ClipboardList',
    },
  });

  console.log('✅ 4 departamentos creados\n');

  // ============================================================
  // USUARIOS
  // ============================================================
  console.log('👥 Creando usuarios...');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@colegio.edu' },
    update: {},
    create: {
      email: 'admin@colegio.edu',
      password,
      name: 'Carlos Administrador',
      role: UserRole.ADMIN,
      position: 'Administrador del Sistema',
    },
  });

  const director = await prisma.user.upsert({
    where: { email: 'director@colegio.edu' },
    update: {},
    create: {
      email: 'director@colegio.edu',
      password,
      name: 'María Elena Rodríguez',
      role: UserRole.DIRECTOR,
      position: 'Directora General',
      departmentId: deptDireccion.id,
      phoneNumber: '0412-5551234',
    },
  });

  const coordPrimaria = await prisma.user.upsert({
    where: { email: 'coord.primaria@colegio.edu' },
    update: {},
    create: {
      email: 'coord.primaria@colegio.edu',
      password,
      name: 'Ana Gabriela López',
      role: UserRole.COORDINADOR,
      position: 'Coordinadora de Primaria',
      departmentId: deptPrimaria.id,
      phoneNumber: '0414-5552345',
    },
  });

  const coordSecundaria = await prisma.user.upsert({
    where: { email: 'coord.secundaria@colegio.edu' },
    update: {},
    create: {
      email: 'coord.secundaria@colegio.edu',
      password,
      name: 'Roberto Alejandro Méndez',
      role: UserRole.COORDINADOR,
      position: 'Coordinador de Secundaria',
      departmentId: deptSecundaria.id,
      phoneNumber: '0424-5553456',
    },
  });

  const profesor1 = await prisma.user.upsert({
    where: { email: 'profesor1@colegio.edu' },
    update: {},
    create: {
      email: 'profesor1@colegio.edu',
      password,
      name: 'Luis Fernando García',
      role: UserRole.PROFESOR,
      position: 'Profesor de Primaria',
      departmentId: deptPrimaria.id,
      phoneNumber: '0416-5554567',
    },
  });

  const profesor2 = await prisma.user.upsert({
    where: { email: 'profesor2@colegio.edu' },
    update: {},
    create: {
      email: 'profesor2@colegio.edu',
      password,
      name: 'Carmen Teresa Martínez',
      role: UserRole.PROFESOR,
      position: 'Profesora de Secundaria',
      departmentId: deptSecundaria.id,
      phoneNumber: '0426-5555678',
    },
  });

  const secretaria = await prisma.user.upsert({
    where: { email: 'secretaria@colegio.edu' },
    update: {},
    create: {
      email: 'secretaria@colegio.edu',
      password,
      name: 'Patricia Isabel Hernández',
      role: UserRole.SECRETARIO,
      position: 'Secretaria Académica',
      departmentId: deptSecretaria.id,
      phoneNumber: '0412-5556789',
    },
  });

  console.log('✅ 7 usuarios creados (contraseña: Demo123!)\n');
  console.log('   📧 admin@colegio.edu          → Administrador');
  console.log('   📧 director@colegio.edu       → Directora');
  console.log('   📧 coord.primaria@colegio.edu → Coordinadora Primaria');
  console.log('   📧 coord.secundaria@colegio.edu → Coordinador Secundaria');
  console.log('   📧 profesor1@colegio.edu      → Profesor Primaria');
  console.log('   📧 profesor2@colegio.edu      → Profesora Secundaria');
  console.log('   📧 secretaria@colegio.edu     → Secretaria\n');

  // ============================================================
  // SECCIONES
  // ============================================================
  console.log('📂 Creando secciones...');

  const sections = [
    {
      name: 'Gestión Académica',
      description: 'Planificaciones, evaluaciones, actas de notas e informes pedagógicos',
      color: '#2563eb',
      icon: 'BookOpen',
    },
    {
      name: 'Gestión Administrativa',
      description: 'Solicitudes, memorándums, permisos y comunicaciones internas',
      color: '#d97706',
      icon: 'FileText',
    },
    {
      name: 'Gestión Institucional',
      description: 'Constancias, certificados, reglamentos y documentos oficiales',
      color: '#7c3aed',
      icon: 'Building',
    },
  ];

  for (const section of sections) {
    await prisma.section.upsert({
      where: { name: section.name },
      update: {},
      create: section,
    });
  }

  console.log('✅ 3 secciones creadas\n');

  // ============================================================
  // CATEGORÍAS
  // ============================================================
  console.log('🏷️ Creando categorías...');

  const categories = [
    {
      name: 'Planificaciones',
      description: 'Planificaciones de clase, proyectos pedagógicos y programas',
      color: '#2563eb',
      icon: 'CalendarDays',
    },
    {
      name: 'Actas y Reuniones',
      description: 'Actas de reuniones, consejos de docentes y asambleas',
      color: '#7c3aed',
      icon: 'Users',
    },
    {
      name: 'Constancias y Certificados',
      description: 'Constancias de estudio, trabajo, buena conducta y certificados',
      color: '#059669',
      icon: 'Award',
    },
    {
      name: 'Informes Académicos',
      description: 'Boletines, informes de rendimiento y evaluaciones',
      color: '#dc2626',
      icon: 'BarChart3',
    },
    {
      name: 'Administrativos',
      description: 'Memorándums, circulares, solicitudes y comunicaciones oficiales',
      color: '#d97706',
      icon: 'FolderKanban',
    },
    {
      name: 'Legales',
      description: 'Contratos, reglamentos internos y documentos normativos',
      color: '#0891b2',
      icon: 'Scale',
    },
    {
      name: 'Financieros',
      description: 'Presupuestos, facturas, nóminas e informes financieros',
      color: '#16a34a',
      icon: 'DollarSign',
    },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }

  console.log('✅ 7 categorías creadas\n');

  // ============================================================
  // CURSOS Y MATERIAS
  // ============================================================
  console.log('🎓 Creando cursos y materias...');

  const curso1eroPrimaria = await prisma.course.upsert({
    where: { code: 'PRIM-1' },
    update: {},
    create: {
      name: '1er Grado de Primaria',
      code: 'PRIM-1',
      level: 'PRIMARIA',
      departmentId: deptPrimaria.id,
      academicYear: '2025-2026',
    },
  });

  const curso1eroSecundaria = await prisma.course.upsert({
    where: { code: 'SEC-1' },
    update: {},
    create: {
      name: '1er Año de Secundaria',
      code: 'SEC-1',
      level: 'SECUNDARIA',
      departmentId: deptSecundaria.id,
      academicYear: '2025-2026',
    },
  });

  // Materias de 1er Grado Primaria
  const matPrimMate = await prisma.subject.upsert({
    where: { code: 'PRIM1-MAT' },
    update: {},
    create: {
      name: 'Matemáticas',
      code: 'PRIM1-MAT',
      description: 'Matemáticas de 1er Grado de Primaria',
      courseId: curso1eroPrimaria.id,
    },
  });

  const matPrimLengua = await prisma.subject.upsert({
    where: { code: 'PRIM1-LEN' },
    update: {},
    create: {
      name: 'Lengua y Literatura',
      code: 'PRIM1-LEN',
      description: 'Lengua y Literatura de 1er Grado de Primaria',
      courseId: curso1eroPrimaria.id,
    },
  });

  // Materias de 1er Año Secundaria
  const matSecMate = await prisma.subject.upsert({
    where: { code: 'SEC1-MAT' },
    update: {},
    create: {
      name: 'Matemáticas',
      code: 'SEC1-MAT',
      description: 'Matemáticas de 1er Año de Secundaria',
      courseId: curso1eroSecundaria.id,
    },
  });

  const matSecCiencias = await prisma.subject.upsert({
    where: { code: 'SEC1-CIE' },
    update: {},
    create: {
      name: 'Ciencias Naturales',
      code: 'SEC1-CIE',
      description: 'Ciencias Naturales de 1er Año de Secundaria',
      courseId: curso1eroSecundaria.id,
    },
  });

  // Asignar profesores a cursos
  await prisma.userCourse.upsert({
    where: { userId_courseId: { userId: profesor1.id, courseId: curso1eroPrimaria.id } },
    update: {},
    create: { userId: profesor1.id, courseId: curso1eroPrimaria.id, role: 'TEACHER' },
  });

  await prisma.userCourse.upsert({
    where: { userId_courseId: { userId: profesor2.id, courseId: curso1eroSecundaria.id } },
    update: {},
    create: { userId: profesor2.id, courseId: curso1eroSecundaria.id, role: 'TEACHER' },
  });

  // Asignar profesores a materias
  await prisma.userSubject.upsert({
    where: { userId_subjectId: { userId: profesor1.id, subjectId: matPrimMate.id } },
    update: {},
    create: { userId: profesor1.id, subjectId: matPrimMate.id },
  });

  await prisma.userSubject.upsert({
    where: { userId_subjectId: { userId: profesor1.id, subjectId: matPrimLengua.id } },
    update: {},
    create: { userId: profesor1.id, subjectId: matPrimLengua.id },
  });

  await prisma.userSubject.upsert({
    where: { userId_subjectId: { userId: profesor2.id, subjectId: matSecMate.id } },
    update: {},
    create: { userId: profesor2.id, subjectId: matSecMate.id },
  });

  await prisma.userSubject.upsert({
    where: { userId_subjectId: { userId: profesor2.id, subjectId: matSecCiencias.id } },
    update: {},
    create: { userId: profesor2.id, subjectId: matSecCiencias.id },
  });

  console.log('✅ 2 cursos, 4 materias y asignaciones de profesores creados\n');

  // ============================================================
  // PLANTILLAS DE DOCUMENTOS
  // ============================================================
  console.log('📄 Creando plantillas de documentos...');

  const actaReunionHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Acta de Reunión</title>
  <style>
    body { font-family: 'Times New Roman', serif; margin: 40px 60px; color: #333; line-height: 1.6; }
    .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; }
    .header h1 { color: #2563eb; font-size: 22px; margin: 0; }
    .header p { color: #666; margin: 5px 0 0; font-size: 12px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; }
    .info-item { font-size: 13px; }
    .info-item strong { color: #1e40af; }
    .section { margin-bottom: 18px; }
    .section h2 { color: #2563eb; font-size: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 8px; }
    .section p { font-size: 13px; white-space: pre-line; }
    .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 15px; text-align: center; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <h1>ACTA DE REUNIÓN</h1>
    <p>{{titulo}}</p>
  </div>
  <div class="info-grid">
    <div class="info-item"><strong>Fecha:</strong> {{fecha}}</div>
    <div class="info-item"><strong>Lugar:</strong> {{lugar}}</div>
    <div class="info-item"><strong>Hora inicio:</strong> {{hora_inicio}}</div>
    <div class="info-item"><strong>Hora fin:</strong> {{hora_fin}}</div>
  </div>
  <div class="section">
    <h2>Participantes</h2>
    <p>{{participantes}}</p>
  </div>
  <div class="section">
    <h2>Agenda</h2>
    <p>{{agenda}}</p>
  </div>
  <div class="section">
    <h2>Desarrollo</h2>
    <p>{{desarrollo}}</p>
  </div>
  <div class="section">
    <h2>Acuerdos y Compromisos</h2>
    <p>{{acuerdos}}</p>
  </div>
  <div class="footer">
    <p>Documento generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p>
  </div>
</body>
</html>`;

  const constanciaEstudioHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Constancia de Estudio</title>
  <style>
    body { font-family: 'Times New Roman', serif; margin: 60px 80px; color: #333; line-height: 1.8; }
    .header { text-align: center; margin-bottom: 40px; }
    .header h1 { color: #059669; font-size: 24px; margin: 0; letter-spacing: 3px; text-transform: uppercase; }
    .header .institution { font-size: 16px; color: #666; margin-top: 5px; }
    .body-text { font-size: 14px; text-align: justify; margin: 30px 0; }
    .body-text .name { font-weight: bold; text-transform: uppercase; }
    .data-field { font-weight: bold; color: #065f46; }
    .signature { margin-top: 80px; text-align: center; }
    .signature .line { border-top: 1px solid #333; width: 250px; margin: 0 auto; padding-top: 5px; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Constancia de Estudio</h1>
    <p class="institution">Institución Educativa</p>
  </div>
  <div class="body-text">
    <p>Quien suscribe, en su carácter de Director(a) de esta institución educativa, hace constar por medio de la presente que el/la estudiante:</p>
    <p style="text-align: center; font-size: 16px; margin: 20px 0;">
      <span class="name">{{nombre_estudiante}}</span><br>
      <span style="font-size: 13px;">C.I.: {{identificacion}}</span>
    </p>
    <p>Se encuentra debidamente inscrito(a) y cursando estudios en esta institución, en el programa de <span class="data-field">{{programa_academico}}</span>, nivel <span class="data-field">{{nivel}}</span>, período <span class="data-field">{{semestre_actual}}</span>, desde el <span class="data-field">{{fecha_inicio}}</span>.</p>
    {{#if promedio}}
    <p>El/la estudiante mantiene un promedio académico de <span class="data-field">{{promedio}}</span> puntos.</p>
    {{/if}}
    <p>Constancia que se expide a petición de la parte interesada, en la ciudad a los {{_metadata.generatedDate}}.</p>
  </div>
  <div class="signature">
    <div class="line">Director(a) de la Institución</div>
  </div>
  <div class="footer">
    <p>Documento generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p>
  </div>
</body>
</html>`;

  const certificadoTrabajoHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Certificado de Trabajo</title>
  <style>
    body { font-family: 'Times New Roman', serif; margin: 60px 80px; color: #333; line-height: 1.8; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 3px double #7c3aed; padding-bottom: 20px; }
    .header h1 { color: #7c3aed; font-size: 24px; margin: 0; letter-spacing: 3px; text-transform: uppercase; }
    .body-text { font-size: 14px; text-align: justify; margin: 30px 0; }
    .data-field { font-weight: bold; color: #5b21b6; }
    .section { margin: 15px 0; }
    .section h3 { color: #7c3aed; font-size: 14px; margin-bottom: 5px; }
    .signature { margin-top: 80px; text-align: center; }
    .signature .line { border-top: 1px solid #333; width: 250px; margin: 0 auto; padding-top: 5px; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Certificado de Trabajo</h1>
  </div>
  <div class="body-text">
    <p>Por medio de la presente se certifica que el/la ciudadano(a) <span class="data-field">{{nombre_empleado}}</span>, titular de la cédula de identidad N° <span class="data-field">{{identificacion}}</span>, prestó sus servicios en esta institución desempeñando el cargo de <span class="data-field">{{cargo}}</span>, desde el <span class="data-field">{{fecha_ingreso}}</span>{{#if fecha_retiro}} hasta el <span class="data-field">{{fecha_retiro}}</span>{{/if}}.</p>
    <div class="section">
      <h3>Funciones desempeñadas:</h3>
      <p>{{funciones}}</p>
    </div>
    {{#if observaciones}}
    <div class="section">
      <h3>Observaciones:</h3>
      <p>{{observaciones}}</p>
    </div>
    {{/if}}
    <p>Certificado que se expide a solicitud de la parte interesada, en la ciudad a los {{_metadata.generatedDate}}.</p>
  </div>
  <div class="signature">
    <div class="line">Director(a) de la Institución</div>
  </div>
  <div class="footer">
    <p>Documento generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p>
  </div>
</body>
</html>`;

  const memorandumHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Memorándum</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px 60px; color: #333; line-height: 1.6; }
    .header { border-bottom: 2px solid #d97706; padding-bottom: 15px; margin-bottom: 25px; }
    .header h1 { color: #d97706; font-size: 20px; margin: 0; }
    .header .numero { font-size: 14px; color: #92400e; font-weight: bold; }
    .meta { margin-bottom: 20px; font-size: 13px; }
    .meta p { margin: 4px 0; }
    .meta strong { display: inline-block; width: 80px; color: #92400e; }
    .content { font-size: 14px; text-align: justify; white-space: pre-line; border-left: 3px solid #fbbf24; padding-left: 15px; }
    .footer { margin-top: 50px; font-size: 11px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>MEMORÁNDUM</h1>
    <span class="numero">N° {{numero}}</span>
  </div>
  <div class="meta">
    <p><strong>Fecha:</strong> {{fecha}}</p>
    <p><strong>Para:</strong> {{para}}</p>
    <p><strong>De:</strong> {{de}}</p>
    <p><strong>Asunto:</strong> {{asunto}}</p>
  </div>
  <div class="content">{{contenido}}</div>
  <div class="footer">
    <p>Documento generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p>
  </div>
</body>
</html>`;

  const informeAcademicoHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe Académico</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px 60px; color: #333; line-height: 1.6; }
    .header { text-align: center; border-bottom: 2px solid #dc2626; padding-bottom: 15px; margin-bottom: 25px; }
    .header h1 { color: #dc2626; font-size: 22px; margin: 0; }
    .header .subtitle { font-size: 13px; color: #666; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 20px; font-size: 13px; }
    .meta strong { color: #991b1b; }
    .section { margin-bottom: 18px; }
    .section h2 { color: #dc2626; font-size: 15px; border-bottom: 1px solid #fca5a5; padding-bottom: 5px; }
    .section p { font-size: 13px; white-space: pre-line; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <h1>INFORME ACADÉMICO</h1>
    <p class="subtitle">{{titulo}}</p>
  </div>
  <div class="meta">
    <p><strong>Fecha:</strong> {{fecha}}</p>
    <p><strong>Autor:</strong> {{autor}}</p>
  </div>
  <div class="section"><h2>Resumen Ejecutivo</h2><p>{{resumen_ejecutivo}}</p></div>
  <div class="section"><h2>Introducción</h2><p>{{introduccion}}</p></div>
  <div class="section"><h2>Objetivo</h2><p>{{objetivo}}</p></div>
  <div class="section"><h2>Metodología</h2><p>{{metodologia}}</p></div>
  <div class="section"><h2>Resultados</h2><p>{{resultados}}</p></div>
  <div class="section"><h2>Conclusiones</h2><p>{{conclusiones}}</p></div>
  {{#if recomendaciones}}
  <div class="section"><h2>Recomendaciones</h2><p>{{recomendaciones}}</p></div>
  {{/if}}
  <div class="footer">
    <p>Documento generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p>
  </div>
</body>
</html>`;

  const solicitudPermisoHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Solicitud de Permiso</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px 60px; color: #333; line-height: 1.6; }
    .header { text-align: center; border-bottom: 2px solid #0891b2; padding-bottom: 15px; margin-bottom: 25px; }
    .header h1 { color: #0891b2; font-size: 22px; margin: 0; }
    .data { margin-bottom: 20px; }
    .data p { margin: 5px 0; font-size: 13px; }
    .data strong { color: #0e7490; display: inline-block; width: 180px; }
    .observations { border-left: 3px solid #06b6d4; padding-left: 15px; margin-top: 15px; }
    .observations h3 { color: #0891b2; font-size: 14px; }
    .signature { margin-top: 60px; display: flex; justify-content: space-around; }
    .signature .block { text-align: center; }
    .signature .line { border-top: 1px solid #333; width: 200px; margin-top: 50px; padding-top: 5px; font-size: 12px; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <h1>SOLICITUD DE PERMISO</h1>
  </div>
  <div class="data">
    <p><strong>Nombre del solicitante:</strong> {{nombre_empleado}}</p>
    <p><strong>Cargo:</strong> {{cargo}}</p>
    <p><strong>Departamento:</strong> {{departamento}}</p>
    <p><strong>Fecha de inicio:</strong> {{fecha_inicio}}</p>
    <p><strong>Fecha de fin:</strong> {{fecha_fin}}</p>
    <p><strong>Días solicitados:</strong> {{dias_solicitados}}</p>
    <p><strong>Motivo:</strong> {{motivo}}</p>
  </div>
  {{#if observaciones}}
  <div class="observations">
    <h3>Observaciones</h3>
    <p>{{observaciones}}</p>
  </div>
  {{/if}}
  <div class="signature">
    <div class="block"><div class="line">Solicitante</div></div>
    <div class="block"><div class="line">Autorizado por</div></div>
  </div>
  <div class="footer">
    <p>Documento generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p>
  </div>
</body>
</html>`;

  const reporteIncidenciaHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte de Incidencia Escolar</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px 60px; color: #333; line-height: 1.6; }
    .header { background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px 20px; margin-bottom: 25px; }
    .header h1 { color: #dc2626; font-size: 20px; margin: 0; }
    .header .numero { font-size: 13px; color: #991b1b; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 20px; font-size: 13px; }
    .meta strong { color: #991b1b; }
    .section { margin-bottom: 15px; }
    .section h2 { color: #dc2626; font-size: 14px; border-bottom: 1px solid #fca5a5; padding-bottom: 5px; }
    .section p { font-size: 13px; white-space: pre-line; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <h1>REPORTE DE INCIDENCIA ESCOLAR</h1>
    <span class="numero">N° {{numero_incidente}}</span>
  </div>
  <div class="meta">
    <p><strong>Fecha:</strong> {{fecha_incidente}}</p>
    <p><strong>Hora:</strong> {{hora_incidente}}</p>
    <p><strong>Lugar:</strong> {{lugar}}</p>
    <p><strong>Reportado por:</strong> {{reportado_por}}</p>
    <p><strong>Tipo:</strong> {{tipo_incidente}}</p>
  </div>
  <div class="section"><h2>Descripción del Incidente</h2><p>{{descripcion}}</p></div>
  {{#if personas_involucradas}}
  <div class="section"><h2>Personas Involucradas</h2><p>{{personas_involucradas}}</p></div>
  {{/if}}
  <div class="section"><h2>Acciones Tomadas</h2><p>{{acciones_tomadas}}</p></div>
  {{#if seguimiento}}
  <div class="section"><h2>Seguimiento Requerido</h2><p>{{seguimiento}}</p></div>
  {{/if}}
  <div class="footer">
    <p>Documento generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p>
  </div>
</body>
</html>`;

  const templates = [
    {
      name: 'Acta de Reunión',
      type: 'acta',
      description: 'Plantilla para registrar actas de reuniones, consejos de docentes y asambleas',
      htmlTemplate: actaReunionHtml,
      fields: {
        fields: [
          { name: 'titulo', label: 'Título de la reunión', type: 'text', required: true },
          { name: 'fecha', label: 'Fecha de la reunión', type: 'date', required: true },
          { name: 'hora_inicio', label: 'Hora de inicio', type: 'time', required: true },
          { name: 'hora_fin', label: 'Hora de finalización', type: 'time', required: true },
          { name: 'lugar', label: 'Lugar', type: 'text', required: true },
          { name: 'participantes', label: 'Participantes', type: 'textarea', required: true },
          { name: 'agenda', label: 'Agenda', type: 'textarea', required: true },
          { name: 'desarrollo', label: 'Desarrollo de la reunión', type: 'textarea', required: true },
          { name: 'acuerdos', label: 'Acuerdos y compromisos', type: 'textarea', required: true },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Constancia de Estudio',
      type: 'constancia',
      description: 'Constancia oficial de inscripción y estudios activos del estudiante',
      htmlTemplate: constanciaEstudioHtml,
      fields: {
        fields: [
          { name: 'nombre_estudiante', label: 'Nombre completo del estudiante', type: 'text', required: true },
          { name: 'identificacion', label: 'Cédula de identidad', type: 'text', required: true },
          { name: 'programa_academico', label: 'Programa académico', type: 'text', required: true },
          { name: 'nivel', label: 'Nivel (Primaria, Secundaria, etc.)', type: 'text', required: true },
          { name: 'semestre_actual', label: 'Período o año actual', type: 'text', required: true },
          { name: 'fecha_inicio', label: 'Fecha de inicio de estudios', type: 'date', required: true },
          { name: 'promedio', label: 'Promedio académico', type: 'number', required: false },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Certificado de Trabajo',
      type: 'certificado',
      description: 'Certificación de relación laboral para personal de la institución',
      htmlTemplate: certificadoTrabajoHtml,
      fields: {
        fields: [
          { name: 'nombre_empleado', label: 'Nombre completo', type: 'text', required: true },
          { name: 'identificacion', label: 'Cédula de identidad', type: 'text', required: true },
          { name: 'cargo', label: 'Cargo desempeñado', type: 'text', required: true },
          { name: 'fecha_ingreso', label: 'Fecha de ingreso', type: 'date', required: true },
          { name: 'fecha_retiro', label: 'Fecha de retiro (si aplica)', type: 'date', required: false },
          { name: 'funciones', label: 'Funciones desempeñadas', type: 'textarea', required: true },
          { name: 'observaciones', label: 'Observaciones', type: 'textarea', required: false },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Memorándum',
      type: 'memorandum',
      description: 'Comunicación interna oficial entre departamentos o personal',
      htmlTemplate: memorandumHtml,
      fields: {
        fields: [
          { name: 'numero', label: 'Número de memorándum', type: 'text', required: true },
          { name: 'fecha', label: 'Fecha', type: 'date', required: true },
          { name: 'para', label: 'Para (Destinatario)', type: 'text', required: true },
          { name: 'de', label: 'De (Remitente)', type: 'text', required: true },
          { name: 'asunto', label: 'Asunto', type: 'text', required: true },
          { name: 'contenido', label: 'Contenido del memorándum', type: 'textarea', required: true },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Informe Académico',
      type: 'informe',
      description: 'Informe de rendimiento académico, evaluaciones y resultados pedagógicos',
      htmlTemplate: informeAcademicoHtml,
      fields: {
        fields: [
          { name: 'titulo', label: 'Título del informe', type: 'text', required: true },
          { name: 'fecha', label: 'Fecha del informe', type: 'date', required: true },
          { name: 'autor', label: 'Autor del informe', type: 'text', required: true },
          { name: 'resumen_ejecutivo', label: 'Resumen ejecutivo', type: 'textarea', required: true },
          { name: 'introduccion', label: 'Introducción', type: 'textarea', required: true },
          { name: 'objetivo', label: 'Objetivo', type: 'textarea', required: true },
          { name: 'metodologia', label: 'Metodología', type: 'textarea', required: true },
          { name: 'resultados', label: 'Resultados', type: 'textarea', required: true },
          { name: 'conclusiones', label: 'Conclusiones', type: 'textarea', required: true },
          { name: 'recomendaciones', label: 'Recomendaciones', type: 'textarea', required: false },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Solicitud de Permiso',
      type: 'solicitud',
      description: 'Solicitud de permiso laboral para el personal de la institución',
      htmlTemplate: solicitudPermisoHtml,
      fields: {
        fields: [
          { name: 'nombre_empleado', label: 'Nombre del solicitante', type: 'text', required: true },
          { name: 'cargo', label: 'Cargo', type: 'text', required: true },
          { name: 'departamento', label: 'Departamento', type: 'text', required: true },
          { name: 'fecha_inicio', label: 'Fecha de inicio del permiso', type: 'date', required: true },
          { name: 'fecha_fin', label: 'Fecha de fin del permiso', type: 'date', required: true },
          { name: 'dias_solicitados', label: 'Número de días solicitados', type: 'number', required: true },
          { name: 'motivo', label: 'Motivo del permiso', type: 'textarea', required: true },
          { name: 'observaciones', label: 'Observaciones', type: 'textarea', required: false },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Reporte de Incidencia Escolar',
      type: 'reporte',
      description: 'Registro de incidencias, accidentes o situaciones disciplinarias',
      htmlTemplate: reporteIncidenciaHtml,
      fields: {
        fields: [
          { name: 'numero_incidente', label: 'Número de incidencia', type: 'text', required: true },
          { name: 'fecha_incidente', label: 'Fecha del incidente', type: 'date', required: true },
          { name: 'hora_incidente', label: 'Hora del incidente', type: 'time', required: true },
          { name: 'lugar', label: 'Lugar del incidente', type: 'text', required: true },
          { name: 'reportado_por', label: 'Reportado por', type: 'text', required: true },
          { name: 'tipo_incidente', label: 'Tipo de incidencia', type: 'text', required: true },
          { name: 'descripcion', label: 'Descripción del incidente', type: 'textarea', required: true },
          { name: 'personas_involucradas', label: 'Personas involucradas', type: 'textarea', required: false },
          { name: 'acciones_tomadas', label: 'Acciones tomadas', type: 'textarea', required: true },
          { name: 'seguimiento', label: 'Seguimiento requerido', type: 'textarea', required: false },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
  ];

  for (const templateData of templates) {
    await prisma.documentTemplate.upsert({
      where: { name: templateData.name },
      update: {},
      create: templateData,
    });
  }

  console.log(`✅ ${templates.length} plantillas de documentos creadas\n`);

  // ============================================================
  // WORKFLOW TEMPLATES
  // ============================================================
  console.log('🔄 Creando plantillas de workflow...');

  await prisma.workflowTemplate.upsert({
    where: { name: 'Aprobación Académica' },
    update: {},
    create: {
      name: 'Aprobación Académica',
      description: 'Flujo de aprobación para documentos académicos: Profesor → Coordinador → Director',
      documentType: 'academico',
      stateDefinitions: [
        { state: 'pending_coordinador', role: 'coordinador', order: 1, label: 'Revisión del Coordinador' },
        { state: 'pending_director', role: 'director', order: 2, label: 'Aprobación del Director' },
      ],
      autoAssign: true,
      requiresComment: false,
      isActive: true,
    },
  });

  await prisma.workflowTemplate.upsert({
    where: { name: 'Aprobación Administrativa' },
    update: {},
    create: {
      name: 'Aprobación Administrativa',
      description: 'Flujo de aprobación para documentos administrativos: Secretario → Director',
      documentType: 'administrativo',
      stateDefinitions: [
        { state: 'pending_director', role: 'director', order: 1, label: 'Aprobación del Director' },
      ],
      autoAssign: true,
      requiresComment: true,
      isActive: true,
    },
  });

  await prisma.workflowTemplate.upsert({
    where: { name: 'Revisión de Planificación' },
    update: {},
    create: {
      name: 'Revisión de Planificación',
      description: 'Flujo corto para planificaciones de clase: Profesor → Coordinador',
      documentType: 'planificacion',
      stateDefinitions: [
        { state: 'pending_coordinador', role: 'coordinador', order: 1, label: 'Revisión del Coordinador' },
      ],
      autoAssign: true,
      requiresComment: false,
      isActive: true,
    },
  });

  console.log('✅ 3 plantillas de workflow creadas\n');

  // ============================================================
  console.log('🎉 Seed completado exitosamente!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Contraseña universal: Demo123!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
