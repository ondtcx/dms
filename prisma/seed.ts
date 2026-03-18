import { PrismaClient, CategoryContext } from '@prisma/client';
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

  // --- Personal directivo y administrativo ---
  const admin = await prisma.user.upsert({
    where: { email: 'admin@colegio.edu' },
    update: {},
    create: { email: 'admin@colegio.edu', password, name: 'Carlos Administrador', role: UserRole.ADMIN, position: 'Administrador del Sistema' },
  });

  await prisma.user.upsert({
    where: { email: 'director@colegio.edu' },
    update: {},
    create: { email: 'director@colegio.edu', password, name: 'María Elena Rodríguez', role: UserRole.DIRECTOR, position: 'Directora General', departmentId: deptDireccion.id, phoneNumber: '0412-5551234' },
  });

  const coordPrimaria = await prisma.user.upsert({
    where: { email: 'coord.primaria@colegio.edu' },
    update: {},
    create: { email: 'coord.primaria@colegio.edu', password, name: 'Ana Gabriela López', role: UserRole.COORDINADOR, position: 'Coordinadora de Primaria', departmentId: deptPrimaria.id, phoneNumber: '0414-5552345' },
  });

  const coordSecundaria = await prisma.user.upsert({
    where: { email: 'coord.secundaria@colegio.edu' },
    update: {},
    create: { email: 'coord.secundaria@colegio.edu', password, name: 'Roberto Alejandro Méndez', role: UserRole.COORDINADOR, position: 'Coordinador de Secundaria', departmentId: deptSecundaria.id, phoneNumber: '0424-5553456' },
  });

  await prisma.user.upsert({
    where: { email: 'secretaria@colegio.edu' },
    update: {},
    create: { email: 'secretaria@colegio.edu', password, name: 'Patricia Isabel Hernández', role: UserRole.SECRETARIO, position: 'Secretaria Académica', departmentId: deptSecretaria.id, phoneNumber: '0412-5556789' },
  });

  // --- Maestros de primaria (un maestro por grado, cubre todas las materias) ---
  const maestro1p = await prisma.user.upsert({
    where: { email: 'maestro.1p@colegio.edu' },
    update: {},
    create: { email: 'maestro.1p@colegio.edu', password, name: 'Juan Manuel Suárez', role: UserRole.PROFESOR, position: 'Maestra de 1° Grado', departmentId: deptPrimaria.id },
  });
  const maestro2p = await prisma.user.upsert({
    where: { email: 'maestro.2p@colegio.edu' },
    update: {},
    create: { email: 'maestro.2p@colegio.edu', password, name: 'Sofía Andrea Ruiz', role: UserRole.PROFESOR, position: 'Maestra de 2° Grado', departmentId: deptPrimaria.id },
  });
  const maestro3p = await prisma.user.upsert({
    where: { email: 'maestro.3p@colegio.edu' },
    update: {},
    create: { email: 'maestro.3p@colegio.edu', password, name: 'Diego Ernesto Vargas', role: UserRole.PROFESOR, position: 'Maestro de 3° Grado', departmentId: deptPrimaria.id },
  });
  const maestro4p = await prisma.user.upsert({
    where: { email: 'maestro.4p@colegio.edu' },
    update: {},
    create: { email: 'maestro.4p@colegio.edu', password, name: 'Laura Beatriz Morales', role: UserRole.PROFESOR, position: 'Maestra de 4° Grado', departmentId: deptPrimaria.id },
  });
  const maestro5p = await prisma.user.upsert({
    where: { email: 'maestro.5p@colegio.edu' },
    update: {},
    create: { email: 'maestro.5p@colegio.edu', password, name: 'Pablo Alberto Jiménez', role: UserRole.PROFESOR, position: 'Maestro de 5° Grado', departmentId: deptPrimaria.id },
  });
  const maestro6p = await prisma.user.upsert({
    where: { email: 'maestro.6p@colegio.edu' },
    update: {},
    create: { email: 'maestro.6p@colegio.edu', password, name: 'Natalia Cecilia Ortega', role: UserRole.PROFESOR, position: 'Maestra de 6° Grado', departmentId: deptPrimaria.id },
  });
  const maestro7p = await prisma.user.upsert({
    where: { email: 'maestro.7p@colegio.edu' },
    update: {},
    create: { email: 'maestro.7p@colegio.edu', password, name: 'Fernando José Castro', role: UserRole.PROFESOR, position: 'Maestro de 7° Grado', departmentId: deptPrimaria.id },
  });
  const maestrosPrimaria = [maestro1p, maestro2p, maestro3p, maestro4p, maestro5p, maestro6p, maestro7p];

  // --- Profesores de secundaria (por materia, cubren varios cursos) ---
  const profMatematica = await prisma.user.upsert({
    where: { email: 'prof.matematica@colegio.edu' },
    update: {},
    create: { email: 'prof.matematica@colegio.edu', password, name: 'Ricardo Andrés Torres', role: UserRole.PROFESOR, position: 'Profesor de Matemática', departmentId: deptSecundaria.id },
  });
  const profLengua = await prisma.user.upsert({
    where: { email: 'prof.lengua@colegio.edu' },
    update: {},
    create: { email: 'prof.lengua@colegio.edu', password, name: 'Valentina Isabel Reyes', role: UserRole.PROFESOR, position: 'Profesora de Lengua y Literatura', departmentId: deptSecundaria.id },
  });
  const profHistoria = await prisma.user.upsert({
    where: { email: 'prof.historia@colegio.edu' },
    update: {},
    create: { email: 'prof.historia@colegio.edu', password, name: 'Marcelo Fabián Sosa', role: UserRole.PROFESOR, position: 'Profesor de Historia', departmentId: deptSecundaria.id },
  });
  const profCsSociales = await prisma.user.upsert({
    where: { email: 'prof.cs.sociales@colegio.edu' },
    update: {},
    create: { email: 'prof.cs.sociales@colegio.edu', password, name: 'Elena Patricia Rojas', role: UserRole.PROFESOR, position: 'Profesora de Geografía y Filosofía', departmentId: deptSecundaria.id },
  });
  const profBiologia = await prisma.user.upsert({
    where: { email: 'prof.biologia@colegio.edu' },
    update: {},
    create: { email: 'prof.biologia@colegio.edu', password, name: 'Adrián Gustavo Pérez', role: UserRole.PROFESOR, position: 'Profesor de Cs. Naturales y Biología', departmentId: deptSecundaria.id },
  });
  const profFisica = await prisma.user.upsert({
    where: { email: 'prof.fisica@colegio.edu' },
    update: {},
    create: { email: 'prof.fisica@colegio.edu', password, name: 'Claudia Fernanda Núñez', role: UserRole.PROFESOR, position: 'Profesora de Física', departmentId: deptSecundaria.id },
  });
  const profQuimica = await prisma.user.upsert({
    where: { email: 'prof.quimica@colegio.edu' },
    update: {},
    create: { email: 'prof.quimica@colegio.edu', password, name: 'Sebastián Horacio Vega', role: UserRole.PROFESOR, position: 'Profesor de Química', departmentId: deptSecundaria.id },
  });
  const profIngles = await prisma.user.upsert({
    where: { email: 'prof.ingles@colegio.edu' },
    update: {},
    create: { email: 'prof.ingles@colegio.edu', password, name: 'Jennifer Michelle Roberts', role: UserRole.PROFESOR, position: 'Profesora de Inglés', departmentId: deptSecundaria.id },
  });
  const profEdFisica = await prisma.user.upsert({
    where: { email: 'prof.ed.fisica@colegio.edu' },
    update: {},
    create: { email: 'prof.ed.fisica@colegio.edu', password, name: 'Maximiliano Darío Flores', role: UserRole.PROFESOR, position: 'Profesor de Educación Física', departmentId: deptSecundaria.id },
  });
  const profArte = await prisma.user.upsert({
    where: { email: 'prof.arte@colegio.edu' },
    update: {},
    create: { email: 'prof.arte@colegio.edu', password, name: 'Verónica Liliana Castro', role: UserRole.PROFESOR, position: 'Profesora de Arte e Informática', departmentId: deptSecundaria.id },
  });

  console.log('✅ 22 usuarios creados (contraseña: Demo123!)\n');
  console.log('   Personal directivo: admin, director, coord.primaria, coord.secundaria, secretaria');
  console.log('   Maestros primaria: maestro.1p … maestro.7p @colegio.edu');
  console.log('   Profesores secundaria: prof.matematica, prof.lengua, prof.historia,');
  console.log('     prof.cs.sociales, prof.biologia, prof.fisica, prof.quimica,');
  console.log('     prof.ingles, prof.ed.fisica, prof.arte @colegio.edu\n');

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
      context: CategoryContext.ACADEMIC,
      requiresCourse: true,
      allowedRoles: ['profesor', 'coordinador'],
    },
    {
      name: 'Actas y Reuniones',
      description: 'Actas de reuniones, consejos de docentes y asambleas',
      color: '#7c3aed',
      icon: 'Users',
      context: CategoryContext.ADMINISTRATIVE,
      requiresCourse: false,
      allowedRoles: ['coordinador', 'secretario', 'director', 'admin'],
    },
    {
      name: 'Constancias y Certificados',
      description: 'Constancias de estudio, trabajo, buena conducta y certificados',
      color: '#059669',
      icon: 'Award',
      context: CategoryContext.ADMINISTRATIVE,
      requiresCourse: false,
      allowedRoles: ['secretario', 'director', 'admin'],
    },
    {
      name: 'Informes Académicos',
      description: 'Boletines, informes de rendimiento y evaluaciones',
      color: '#dc2626',
      icon: 'BarChart3',
      context: CategoryContext.ACADEMIC,
      requiresCourse: false,
      allowedRoles: ['profesor', 'coordinador', 'director'],
    },
    {
      name: 'Administrativos',
      description: 'Memorándums, circulares, solicitudes y comunicaciones oficiales',
      color: '#d97706',
      icon: 'FolderKanban',
      context: CategoryContext.ADMINISTRATIVE,
      requiresCourse: false,
      allowedRoles: ['coordinador', 'secretario', 'director', 'admin'],
    },
    {
      name: 'Legales',
      description: 'Contratos, reglamentos internos y documentos normativos',
      color: '#0891b2',
      icon: 'Scale',
      context: CategoryContext.INSTITUTIONAL,
      requiresCourse: false,
      allowedRoles: ['director', 'admin'],
    },
    {
      name: 'Financieros',
      description: 'Presupuestos, facturas, nóminas e informes financieros',
      color: '#16a34a',
      icon: 'DollarSign',
      context: CategoryContext.INSTITUTIONAL,
      requiresCourse: false,
      allowedRoles: ['secretario', 'director', 'admin'],
    },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {
        context: category.context,
        requiresCourse: category.requiresCourse,
        allowedRoles: category.allowedRoles,
      },
      create: category,
    });
  }

  console.log('✅ 7 categorías creadas\n');

  // ============================================================
  // CURSOS Y MATERIAS
  // ============================================================
  console.log('🎓 Creando cursos y materias...');

  const subCode = (courseCode: string, abbr: string) => `${courseCode}-${abbr}`;

  // ---- PRIMARIA: 7 grados (un maestro cubre todas las materias) ----

  const primaryGrades = [
    { name: '1° Grado de Primaria', code: 'PRIM-1', maestro: maestro1p },
    { name: '2° Grado de Primaria', code: 'PRIM-2', maestro: maestro2p },
    { name: '3° Grado de Primaria', code: 'PRIM-3', maestro: maestro3p },
    { name: '4° Grado de Primaria', code: 'PRIM-4', maestro: maestro4p },
    { name: '5° Grado de Primaria', code: 'PRIM-5', maestro: maestro5p },
    { name: '6° Grado de Primaria', code: 'PRIM-6', maestro: maestro6p },
    { name: '7° Grado de Primaria', code: 'PRIM-7', maestro: maestro7p },
  ];

  const pBaseSubjects = [
    { abbr: 'LEN', name: 'Lengua' },
    { abbr: 'MAT', name: 'Matemática' },
    { abbr: 'CNT', name: 'Ciencias Naturales' },
    { abbr: 'CSO', name: 'Ciencias Sociales' },
    { abbr: 'ING', name: 'Inglés' },
    { abbr: 'EDF', name: 'Educación Física' },
    { abbr: 'ART', name: 'Arte' },
  ];
  const pSubjectsFrom4 = [...pBaseSubjects, { abbr: 'INF', name: 'Informática' }];

  for (let i = 0; i < primaryGrades.length; i++) {
    const gradeNum = i + 1;
    const { name, code, maestro } = primaryGrades[i];

    const course = await prisma.course.upsert({
      where: { code },
      update: {},
      create: { name, code, level: 'PRIMARIA', departmentId: deptPrimaria.id, academicYear: '2025-2026' },
    });

    await prisma.userCourse.upsert({
      where: { userId_courseId: { userId: maestro.id, courseId: course.id } },
      update: {},
      create: { userId: maestro.id, courseId: course.id, role: 'TEACHER' },
    });

    const subjectList = gradeNum >= 4 ? pSubjectsFrom4 : pBaseSubjects;
    for (const { abbr, name: subjectName } of subjectList) {
      const subject = await prisma.subject.upsert({
        where: { code: subCode(code, abbr) },
        update: {},
        create: { name: subjectName, code: subCode(code, abbr), courseId: course.id },
      });
      await prisma.userSubject.upsert({
        where: { userId_subjectId: { userId: maestro.id, subjectId: subject.id } },
        update: {},
        create: { userId: maestro.id, subjectId: subject.id },
      });
    }
  }

  // ---- SECUNDARIA: 6 años (profesores por materia cubren varios cursos) ----

  type SecSubjectDef = { abbr: string; name: string; prof: { id: string } };

  const secYears: { name: string; code: string; subjects: SecSubjectDef[] }[] = [
    {
      name: '1° Año de Secundaria', code: 'SEC-1',
      subjects: [
        { abbr: 'MAT', name: 'Matemática',         prof: profMatematica },
        { abbr: 'LYL', name: 'Lengua y Literatura', prof: profLengua },
        { abbr: 'HIS', name: 'Historia',            prof: profHistoria },
        { abbr: 'GEO', name: 'Geografía',           prof: profCsSociales },
        { abbr: 'CNT', name: 'Ciencias Naturales',  prof: profBiologia },
        { abbr: 'ING', name: 'Inglés',              prof: profIngles },
        { abbr: 'EDF', name: 'Educación Física',    prof: profEdFisica },
        { abbr: 'ART', name: 'Arte',                prof: profArte },
        { abbr: 'INF', name: 'Informática',         prof: profArte },
      ],
    },
    {
      name: '2° Año de Secundaria', code: 'SEC-2',
      subjects: [
        { abbr: 'MAT', name: 'Matemática',          prof: profMatematica },
        { abbr: 'LYL', name: 'Lengua y Literatura', prof: profLengua },
        { abbr: 'HIS', name: 'Historia',            prof: profHistoria },
        { abbr: 'GEO', name: 'Geografía',           prof: profCsSociales },
        { abbr: 'BIO', name: 'Biología',            prof: profBiologia },
        { abbr: 'ING', name: 'Inglés',              prof: profIngles },
        { abbr: 'EDF', name: 'Educación Física',    prof: profEdFisica },
        { abbr: 'ART', name: 'Arte',                prof: profArte },
      ],
    },
    {
      name: '3° Año de Secundaria', code: 'SEC-3',
      subjects: [
        { abbr: 'MAT', name: 'Matemática',          prof: profMatematica },
        { abbr: 'LYL', name: 'Lengua y Literatura', prof: profLengua },
        { abbr: 'HIS', name: 'Historia',            prof: profHistoria },
        { abbr: 'GEO', name: 'Geografía',           prof: profCsSociales },
        { abbr: 'BIO', name: 'Biología',            prof: profBiologia },
        { abbr: 'QUI', name: 'Química',             prof: profQuimica },
        { abbr: 'ING', name: 'Inglés',              prof: profIngles },
        { abbr: 'EDF', name: 'Educación Física',    prof: profEdFisica },
      ],
    },
    {
      name: '4° Año de Secundaria', code: 'SEC-4',
      subjects: [
        { abbr: 'MAT', name: 'Matemática',          prof: profMatematica },
        { abbr: 'LYL', name: 'Lengua y Literatura', prof: profLengua },
        { abbr: 'HIS', name: 'Historia',            prof: profHistoria },
        { abbr: 'GEO', name: 'Geografía',           prof: profCsSociales },
        { abbr: 'FIS', name: 'Física',              prof: profFisica },
        { abbr: 'QUI', name: 'Química',             prof: profQuimica },
        { abbr: 'ING', name: 'Inglés',              prof: profIngles },
        { abbr: 'EDF', name: 'Educación Física',    prof: profEdFisica },
      ],
    },
    {
      name: '5° Año de Secundaria', code: 'SEC-5',
      subjects: [
        { abbr: 'MAT', name: 'Matemática',          prof: profMatematica },
        { abbr: 'LYL', name: 'Lengua y Literatura', prof: profLengua },
        { abbr: 'HIS', name: 'Historia',            prof: profHistoria },
        { abbr: 'FIL', name: 'Filosofía',           prof: profCsSociales },
        { abbr: 'FIS', name: 'Física',              prof: profFisica },
        { abbr: 'QUO', name: 'Química Orgánica',    prof: profQuimica },
        { abbr: 'ING', name: 'Inglés',              prof: profIngles },
        { abbr: 'EDF', name: 'Educación Física',    prof: profEdFisica },
      ],
    },
    {
      name: '6° Año de Secundaria', code: 'SEC-6',
      subjects: [
        { abbr: 'MAT', name: 'Matemática',          prof: profMatematica },
        { abbr: 'LYL', name: 'Lengua y Literatura', prof: profLengua },
        { abbr: 'HIS', name: 'Historia',            prof: profHistoria },
        { abbr: 'FIL', name: 'Filosofía',           prof: profCsSociales },
        { abbr: 'FIS', name: 'Física',              prof: profFisica },
        { abbr: 'QUI', name: 'Química',             prof: profQuimica },
        { abbr: 'ING', name: 'Inglés',              prof: profIngles },
        { abbr: 'EDF', name: 'Educación Física',    prof: profEdFisica },
      ],
    },
  ];

  for (const { name, code, subjects } of secYears) {
    const course = await prisma.course.upsert({
      where: { code },
      update: {},
      create: { name, code, level: 'SECUNDARIA', departmentId: deptSecundaria.id, academicYear: '2025-2026' },
    });

    const assignedProfIds = new Set<string>();

    for (const { abbr, name: subjectName, prof } of subjects) {
      const subject = await prisma.subject.upsert({
        where: { code: subCode(code, abbr) },
        update: {},
        create: { name: subjectName, code: subCode(code, abbr), courseId: course.id },
      });
      await prisma.userSubject.upsert({
        where: { userId_subjectId: { userId: prof.id, subjectId: subject.id } },
        update: {},
        create: { userId: prof.id, subjectId: subject.id },
      });
      if (!assignedProfIds.has(prof.id)) {
        assignedProfIds.add(prof.id);
        await prisma.userCourse.upsert({
          where: { userId_courseId: { userId: prof.id, courseId: course.id } },
          update: {},
          create: { userId: prof.id, courseId: course.id, role: 'TEACHER' },
        });
      }
    }
  }

  console.log('✅ 13 cursos, ~100 materias y asignaciones de profesores creados\n');

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

  // Obtener categorías para linkear plantillas específicas
  const catPlanificaciones       = await prisma.category.findUnique({ where: { name: 'Planificaciones' } });
  const catActas                 = await prisma.category.findUnique({ where: { name: 'Actas y Reuniones' } });
  const catConstancias           = await prisma.category.findUnique({ where: { name: 'Constancias y Certificados' } });
  const catFinancieros           = await prisma.category.findUnique({ where: { name: 'Financieros' } });

  // 1. Aprobación Académica — contexto ACADEMIC, cualquier categoría académica
  await prisma.workflowTemplate.upsert({
    where: { name: 'Aprobación Académica' },
    update: { documentType: 'ACADEMIC', categoryId: null, allowedInitiatorRoles: ['profesor', 'coordinador'] },
    create: {
      name: 'Aprobación Académica',
      description: 'Flujo de aprobación para documentos académicos: Coordinador → Director',
      documentType: 'ACADEMIC',
      allowedInitiatorRoles: ['profesor', 'coordinador'],
      stateDefinitions: [
        { state: 'Revisión del Coordinador', role: 'coordinador', order: 1 },
        { state: 'Aprobación del Director',  role: 'director',    order: 2 },
      ],
      autoAssign: true,
      requiresComment: false,
      isActive: true,
    },
  });

  // 2. Revisión de Planificación — solo categoría Planificaciones, solo profesores
  await prisma.workflowTemplate.upsert({
    where: { name: 'Revisión de Planificación' },
    update: { documentType: 'ACADEMIC', categoryId: catPlanificaciones?.id ?? null, allowedInitiatorRoles: ['profesor'] },
    create: {
      name: 'Revisión de Planificación',
      description: 'Flujo corto para planificaciones de clase: Profesor inicia, Coordinador aprueba',
      documentType: 'ACADEMIC',
      categoryId: catPlanificaciones?.id ?? null,
      allowedInitiatorRoles: ['profesor'],
      stateDefinitions: [
        { state: 'Revisión del Coordinador', role: 'coordinador', order: 1 },
      ],
      autoAssign: true,
      requiresComment: false,
      isActive: true,
    },
  });

  // 3. Aprobación Administrativa — contexto ADMINISTRATIVE, cualquier categoría administrativa
  await prisma.workflowTemplate.upsert({
    where: { name: 'Aprobación Administrativa' },
    update: { documentType: 'ADMINISTRATIVE', categoryId: null, allowedInitiatorRoles: ['coordinador', 'secretario', 'director'] },
    create: {
      name: 'Aprobación Administrativa',
      description: 'Flujo de aprobación para documentos administrativos: Director aprueba',
      documentType: 'ADMINISTRATIVE',
      allowedInitiatorRoles: ['coordinador', 'secretario', 'director'],
      stateDefinitions: [
        { state: 'Aprobación del Director', role: 'director', order: 1 },
      ],
      autoAssign: true,
      requiresComment: true,
      isActive: true,
    },
  });

  // 4. Revisión de Acta — solo categoría Actas y Reuniones
  await prisma.workflowTemplate.upsert({
    where: { name: 'Revisión de Acta' },
    update: { documentType: 'ADMINISTRATIVE', categoryId: catActas?.id ?? null, allowedInitiatorRoles: ['coordinador', 'secretario'] },
    create: {
      name: 'Revisión de Acta',
      description: 'Flujo específico para actas de reuniones: Coordinador/Secretario inicia, Director aprueba',
      documentType: 'ADMINISTRATIVE',
      categoryId: catActas?.id ?? null,
      allowedInitiatorRoles: ['coordinador', 'secretario'],
      stateDefinitions: [
        { state: 'Aprobación del Director', role: 'director', order: 1 },
      ],
      autoAssign: true,
      requiresComment: true,
      isActive: true,
    },
  });

  // 5. Emisión de Constancia — solo categoría Constancias y Certificados
  await prisma.workflowTemplate.upsert({
    where: { name: 'Emisión de Constancia' },
    update: { documentType: 'ADMINISTRATIVE', categoryId: catConstancias?.id ?? null, allowedInitiatorRoles: ['secretario'] },
    create: {
      name: 'Emisión de Constancia',
      description: 'Flujo para constancias y certificados: Secretaria inicia, Director firma',
      documentType: 'ADMINISTRATIVE',
      categoryId: catConstancias?.id ?? null,
      allowedInitiatorRoles: ['secretario'],
      stateDefinitions: [
        { state: 'Firma del Director', role: 'director', order: 1 },
      ],
      autoAssign: true,
      requiresComment: false,
      isActive: true,
    },
  });

  // 6. Aprobación Institucional — contexto INSTITUTIONAL, cualquier categoría institucional
  await prisma.workflowTemplate.upsert({
    where: { name: 'Aprobación Institucional' },
    update: { documentType: 'INSTITUTIONAL', categoryId: null, allowedInitiatorRoles: ['director'] },
    create: {
      name: 'Aprobación Institucional',
      description: 'Flujo para documentos legales e institucionales: Director revisa y aprueba',
      documentType: 'INSTITUTIONAL',
      allowedInitiatorRoles: ['director'],
      stateDefinitions: [
        { state: 'Revisión del Director', role: 'director', order: 1 },
      ],
      autoAssign: true,
      requiresComment: true,
      isActive: true,
    },
  });

  // 7. Revisión Financiera — solo categoría Financieros
  await prisma.workflowTemplate.upsert({
    where: { name: 'Revisión Financiera' },
    update: { documentType: 'INSTITUTIONAL', categoryId: catFinancieros?.id ?? null, allowedInitiatorRoles: ['secretario', 'director'] },
    create: {
      name: 'Revisión Financiera',
      description: 'Flujo para documentos financieros: Secretaria/Director inicia, Director aprueba',
      documentType: 'INSTITUTIONAL',
      categoryId: catFinancieros?.id ?? null,
      allowedInitiatorRoles: ['secretario', 'director'],
      stateDefinitions: [
        { state: 'Revisión del Director', role: 'director', order: 1 },
      ],
      autoAssign: true,
      requiresComment: true,
      isActive: true,
    },
  });

  console.log('✅ 7 plantillas de workflow creadas\n');

  // ============================================================
  // CONFIGURACIÓN DEL SISTEMA (SystemSettings)
  // ============================================================
  console.log('⚙️  Creando configuración del sistema...');

  await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      institution: {
        name: 'Colegio Demo',
        logoPath: null,
        address: null,
        phone: null,
        email: null,
        website: null,
      },
      schoolYear: {
        name: '2025-2026',
        startDate: '2025-09-01',
        endDate: '2026-06-30',
        isActive: true,
      },
      appearance: {
        primaryColor: '#3b82f6',
        secondaryColor: '#10b981',
        theme: 'system',
      },
      documents: {
        maxFileSizeMb: 50,
        allowedMimeTypes: [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        trashRetentionDays: 30,
        maxVersionsPerDocument: 10,
      },
      notifications: {
        emailEnabled: false,
        senderEmail: null,
        senderName: null,
      },
      security: {
        sessionTimeoutMinutes: 480,
        maxLoginAttempts: 5,
        require2FA: false,
      },
    },
  });

  console.log('✅ Configuración del sistema creada\n');

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
