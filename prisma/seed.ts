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
  // AÑO LECTIVO
  // ============================================================
  console.log('📅 Creando año lectivo...');

  await prisma.academicYear.upsert({
    where: { name: '2025-2026' },
    update: { isCurrent: true, isActive: true },
    create: {
      name: '2025-2026',
      startDate: new Date('2025-03-01'),
      endDate: new Date('2026-02-28'),
      isCurrent: true,
      isActive: true,
    },
  });

  console.log('✅ Año lectivo 2025-2026 creado (activo y actual)\n');

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
    where: { email: 'rector@colegio.edu' },
    update: {},
    create: { email: 'rector@colegio.edu', password, name: 'María Elena Rodríguez', role: UserRole.RECTOR, position: 'Rectora General', departmentId: deptDireccion.id, phoneNumber: '0412-5551234' },
  });

  await prisma.user.upsert({
    where: { email: 'vicerrector@colegio.edu' },
    update: {},
    create: { email: 'vicerrector@colegio.edu', password, name: 'Lucía Fernanda Castillo', role: UserRole.VICERRECTOR, position: 'Vicerrectora', departmentId: deptDireccion.id, phoneNumber: '0412-5551235' },
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

  console.log('✅ 23 usuarios creados (contraseña: Demo123!)\n');
  console.log('   Personal directivo: admin, director, vicerrector, coord.primaria, coord.secundaria, secretaria');
  console.log('   Maestros primaria: maestro.1p … maestro.7p @colegio.edu');
  console.log('   Profesores secundaria: prof.matematica, prof.lengua, prof.historia,');
  console.log('     prof.cs.sociales, prof.biologia, prof.fisica, prof.quimica,');
  console.log('     prof.ingles, prof.ed.fisica, prof.arte @colegio.edu\n');

  // ============================================================
  // SECCIONES
  // ============================================================
  console.log('📂 Creando secciones...');

  const sectionAcademica = await prisma.section.upsert({
    where: { name: 'Gestión Académica' },
    update: { prefix: 'GA' },
    create: {
      name: 'Gestión Académica',
      description: 'Planificaciones, evaluaciones, actas de notas e informes pedagógicos',
      color: '#2563eb',
      icon: 'BookOpen',
      prefix: 'GA',
    },
  });

  const sectionAdministrativa = await prisma.section.upsert({
    where: { name: 'Gestión Administrativa' },
    update: { prefix: 'ADM' },
    create: {
      name: 'Gestión Administrativa',
      description: 'Solicitudes, memorándums, permisos y comunicaciones internas',
      color: '#d97706',
      icon: 'FileText',
      prefix: 'ADM',
    },
  });

  const sectionInstitucional = await prisma.section.upsert({
    where: { name: 'Gestión Institucional' },
    update: { prefix: 'GI' },
    create: {
      name: 'Gestión Institucional',
      description: 'Constancias, certificados, reglamentos y documentos oficiales',
      color: '#7c3aed',
      icon: 'Building',
      prefix: 'GI',
    },
  });

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
      requiresCourse: true,
      allowedRoles: ['profesor', 'coordinador'],
      prefix: 'PLN',
    },
    {
      name: 'Actas y Reuniones',
      description: 'Actas de reuniones, consejos de docentes y asambleas',
      color: '#7c3aed',
      icon: 'Users',
      requiresCourse: false,
      allowedRoles: ['coordinador', 'secretario', 'rector', 'vicerrector', 'admin'],
      prefix: 'ACT',
    },
    {
      name: 'Constancias y Certificados',
      description: 'Constancias de estudio, trabajo, buena conducta y certificados',
      color: '#059669',
      icon: 'Award',
      requiresCourse: false,
      allowedRoles: ['secretario', 'rector', 'vicerrector', 'admin'],
      prefix: 'CST',
    },
    {
      name: 'Informes Académicos',
      description: 'Boletines, informes de rendimiento y evaluaciones',
      color: '#dc2626',
      icon: 'BarChart3',
      requiresCourse: false,
      allowedRoles: ['profesor', 'coordinador', 'rector', 'vicerrector'],
      prefix: 'INF',
    },
    {
      name: 'Administrativos',
      description: 'Memorándums, circulares, solicitudes y comunicaciones oficiales',
      color: '#d97706',
      icon: 'FolderKanban',
      requiresCourse: false,
      allowedRoles: ['profesor', 'coordinador', 'secretario', 'rector', 'vicerrector', 'admin'],
      prefix: 'ADMD',
    },
    {
      name: 'Legales',
      description: 'Contratos, reglamentos internos y documentos normativos',
      color: '#0891b2',
      icon: 'Scale',
      requiresCourse: false,
      allowedRoles: ['rector', 'admin'],
      prefix: 'LEG',
    },
    {
      name: 'Financieros',
      description: 'Presupuestos, facturas, nóminas e informes financieros',
      color: '#16a34a',
      icon: 'DollarSign',
      requiresCourse: false,
      allowedRoles: ['secretario', 'rector', 'admin'],
      prefix: 'FIN',
    },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {
        requiresCourse: category.requiresCourse,
        allowedRoles: category.allowedRoles,
        prefix: category.prefix,
      },
      create: category,
    });
  }

  // Marcar categorías Legales y Financieros para que sus documentos
  // ignoren el filtro de año lectivo (tienen vigencia propia)
  await prisma.category.updateMany({
    where: { name: { in: ['Legales', 'Financieros'] } },
    data: { bypassAcademicYear: true },
  });

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

  // Obtener categorías para asignar a cada plantilla
  const catPlanificaciones  = await prisma.category.findUniqueOrThrow({ where: { name: 'Planificaciones' } });
  const catActas            = await prisma.category.findUniqueOrThrow({ where: { name: 'Actas y Reuniones' } });
  const catConstancias      = await prisma.category.findUniqueOrThrow({ where: { name: 'Constancias y Certificados' } });
  const catInformes         = await prisma.category.findUniqueOrThrow({ where: { name: 'Informes Académicos' } });
  const catAdministrativos  = await prisma.category.findUniqueOrThrow({ where: { name: 'Administrativos' } });
  const catLegales          = await prisma.category.findUniqueOrThrow({ where: { name: 'Legales' } });
  const catFinancieros      = await prisma.category.findUniqueOrThrow({ where: { name: 'Financieros' } });

  // ── Subtipos de documento (DocumentType) por categoría ──────────────────────
  console.log('🗂️  Creando subtipos de documento...');

  const upsertDocType = (name: string, categoryId: number, description?: string) =>
    prisma.documentType.upsert({
      where: { name_categoryId: { name, categoryId } },
      update: {},
      create: { name, description, categoryId, isActive: true },
    });

  const [
    dtPlanSemanal, dtProyecto, dtPlanEvaluacion,
    dtActaReunion, dtActaConsejo, dtActaCompromiso,
    dtConstanciaEstudios, dtConstanciaConducta, dtCertificado,
    dtInformeRendimiento, dtInformeGrupo, dtBoletin,
    dtMemorando, dtCircular, dtComunicado, dtSolicitudPermiso, dtReporteIncidencia, dtOficio,
    dtContratoInscripcion,
    dtReciboPago, dtPresupuesto,
  ] = await Promise.all([
    // Planificaciones
    upsertDocType('Planificación Semanal',    catPlanificaciones.id, 'Planificación semanal de clase por docente'),
    upsertDocType('Proyecto Pedagógico',      catPlanificaciones.id, 'Proyecto pedagógico de aula'),
    upsertDocType('Plan de Evaluación',       catPlanificaciones.id, 'Plan de evaluación trimestral'),
    // Actas y Reuniones
    upsertDocType('Acta de Reunión',          catActas.id, 'Acta de reunión general o de departamento'),
    upsertDocType('Acta de Consejo',          catActas.id, 'Acta de consejo directivo o académico'),
    upsertDocType('Acta de Compromiso',       catActas.id, 'Acta de compromiso de representante o estudiante'),
    // Constancias y Certificados
    upsertDocType('Constancia de Estudios',   catConstancias.id, 'Constancia de estudios activos'),
    upsertDocType('Constancia de Conducta',   catConstancias.id, 'Constancia de buena conducta'),
    upsertDocType('Certificado',              catConstancias.id, 'Certificado general'),
    // Informes Académicos
    upsertDocType('Informe de Rendimiento',   catInformes.id, 'Informe de rendimiento estudiantil'),
    upsertDocType('Informe de Grupo',         catInformes.id, 'Informe de rendimiento del grupo'),
    upsertDocType('Boletín de Calificaciones', catInformes.id, 'Boletín de calificaciones trimestral'),
    // Administrativos
    upsertDocType('Memorando',                catAdministrativos.id, 'Comunicación interna formal'),
    upsertDocType('Circular',                 catAdministrativos.id, 'Comunicado circular a la comunidad'),
    upsertDocType('Comunicado',               catAdministrativos.id, 'Comunicado general'),
    upsertDocType('Solicitud de Permiso',     catAdministrativos.id, 'Solicitud de permiso o ausencia'),
    upsertDocType('Reporte de Incidencia',    catAdministrativos.id, 'Reporte de incidencia disciplinaria'),
    upsertDocType('Oficio',                   catAdministrativos.id, 'Comunicación oficial externa o entre instituciones'),
    // Legales
    upsertDocType('Contrato de Inscripción',  catLegales.id, 'Contrato de inscripción y compromiso'),
    // Financieros
    upsertDocType('Recibo de Pago',           catFinancieros.id, 'Recibo de pago de aranceles'),
    upsertDocType('Presupuesto de Actividad', catFinancieros.id, 'Presupuesto estimado de actividad escolar'),
  ]);

  const _PLACEHOLDER_actaReunionHtml = `<!DOCTYPE html>
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

  const _old_constanciaEstudioHtml = `<!DOCTYPE html>
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

  const _old_memorandumHtml = `<!DOCTYPE html>
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

  const _old_solicitudPermisoHtml = `<!DOCTYPE html>
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

  const _old_reporteIncidenciaHtml = `<!DOCTYPE html>
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

  // ============================================================
  // HTML de plantillas por categoría
  // ============================================================

  // ── PLANIFICACIONES ──────────────────────────────────────────
  const planSemanalHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Planificación Semanal</title>
<style>body{font-family:Arial,sans-serif;margin:40px 60px;color:#333;line-height:1.6}
.header{text-align:center;border-bottom:3px solid #2563eb;padding-bottom:15px;margin-bottom:25px}
.header h1{color:#2563eb;font-size:20px;margin:0}.header p{color:#666;font-size:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;font-size:13px}
.grid strong{color:#1e40af}.section{margin-bottom:16px}.section h2{color:#2563eb;font-size:14px;border-bottom:1px solid #ddd;padding-bottom:4px}
.section p{font-size:13px;white-space:pre-line}.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>PLANIFICACIÓN SEMANAL DE CLASE</h1><p>{{_metadata.generatedDate}}</p></div>
<div class="grid"><div><strong>Docente:</strong> {{docente}}</div><div><strong>Grado/Año:</strong> {{grado}}</div>
<div><strong>Materia:</strong> {{materia}}</div><div><strong>Semana:</strong> {{semana}}</div></div>
<div class="section"><h2>Objetivos de la Semana</h2><p>{{objetivos}}</p></div>
<div class="section"><h2>Contenidos</h2><p>{{contenidos}}</p></div>
<div class="section"><h2>Estrategias y Actividades</h2><p>{{estrategias}}</p></div>
<div class="section"><h2>Recursos Didácticos</h2><p>{{recursos}}</p></div>
<div class="section"><h2>Criterios de Evaluación</h2><p>{{evaluacion}}</p></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p></div>
</body></html>`;

  const proyectoPedagogicoHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Proyecto Pedagógico</title>
<style>body{font-family:'Times New Roman',serif;margin:50px 70px;color:#333;line-height:1.7}
.header{text-align:center;border-bottom:2px solid #1d4ed8;padding-bottom:20px;margin-bottom:30px}
.header h1{color:#1d4ed8;font-size:22px;letter-spacing:1px}.header p{color:#666;font-size:13px}
.section{margin-bottom:20px}.section h2{color:#1d4ed8;font-size:15px;border-left:4px solid #1d4ed8;padding-left:10px}
.section p{font-size:13px;text-align:justify;white-space:pre-line}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#f0f9ff;padding:12px;border-radius:6px;margin-bottom:20px;font-size:13px}
.meta strong{color:#1d4ed8}.footer{margin-top:50px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>PROYECTO PEDAGÓGICO DE AULA</h1><p>Año Escolar {{anio_escolar}}</p></div>
<div class="meta"><div><strong>Docente:</strong> {{docente}}</div><div><strong>Grado/Sección:</strong> {{grado}}</div>
<div><strong>Área:</strong> {{area}}</div><div><strong>Duración:</strong> {{duracion}}</div></div>
<div class="section"><h2>Nombre del Proyecto</h2><p>{{nombre_proyecto}}</p></div>
<div class="section"><h2>Justificación</h2><p>{{justificacion}}</p></div>
<div class="section"><h2>Propósitos</h2><p>{{propositos}}</p></div>
<div class="section"><h2>Actividades Previstas</h2><p>{{actividades}}</p></div>
<div class="section"><h2>Evaluación del Proyecto</h2><p>{{evaluacion}}</p></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}}</p></div>
</body></html>`;

  const planEvaluacionHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Plan de Evaluación</title>
<style>body{font-family:Arial,sans-serif;margin:40px 60px;color:#333;line-height:1.6}
.header{text-align:center;border-bottom:2px solid #7c3aed;padding-bottom:15px;margin-bottom:25px}
.header h1{color:#7c3aed;font-size:20px}
.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px;font-size:13px}
.meta strong{color:#5b21b6}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:15px}
th{background:#7c3aed;color:#fff;padding:8px;text-align:left}
td{padding:7px 8px;border-bottom:1px solid #e5e7eb}
.section{margin-bottom:18px}.section h2{color:#7c3aed;font-size:14px;border-bottom:1px solid #ddd;padding-bottom:4px}
.section p{font-size:13px;white-space:pre-line}
.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>PLAN DE EVALUACIÓN TRIMESTRAL</h1></div>
<div class="meta"><div><strong>Docente:</strong> {{docente}}</div><div><strong>Materia:</strong> {{materia}}</div>
<div><strong>Trimestre:</strong> {{trimestre}}</div><div><strong>Grado:</strong> {{grado}}</div>
<div><strong>Año Escolar:</strong> {{anio_escolar}}</div></div>
<div class="section"><h2>Criterios de Evaluación</h2><p>{{criterios}}</p></div>
<div class="section"><h2>Instrumentos de Evaluación</h2><p>{{instrumentos}}</p></div>
<div class="section"><h2>Ponderación</h2>
<table><tr><th>Actividad</th><th>Tipo</th><th>Porcentaje</th></tr>
<tr><td>{{actividad1}}</td><td>{{tipo1}}</td><td>{{ponderacion1}}%</td></tr>
<tr><td>{{actividad2}}</td><td>{{tipo2}}</td><td>{{ponderacion2}}%</td></tr>
<tr><td>{{actividad3}}</td><td>{{tipo3}}</td><td>{{ponderacion3}}%</td></tr></table></div>
<div class="section"><h2>Observaciones</h2><p>{{observaciones}}</p></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}}</p></div>
</body></html>`;

  // ── ACTAS Y REUNIONES ─────────────────────────────────────────
  const actaReunionPersonalHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Acta de Reunión</title>
<style>body{font-family:'Times New Roman',serif;margin:40px 60px;color:#333;line-height:1.6}
.header{text-align:center;border-bottom:2px solid #2563eb;padding-bottom:15px;margin-bottom:25px}
.header h1{color:#2563eb;font-size:22px;margin:0}.header p{color:#666;font-size:12px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;font-size:13px}
.info-item strong{color:#1e40af}
.section{margin-bottom:18px}.section h2{color:#2563eb;font-size:15px;border-bottom:1px solid #ddd;padding-bottom:5px}
.section p{font-size:13px;white-space:pre-line}
.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:15px;text-align:center;font-size:11px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>ACTA DE REUNIÓN</h1><p>{{titulo}}</p></div>
<div class="info-grid">
<div class="info-item"><strong>Fecha:</strong> {{fecha}}</div><div class="info-item"><strong>Lugar:</strong> {{lugar}}</div>
<div class="info-item"><strong>Hora inicio:</strong> {{hora_inicio}}</div><div class="info-item"><strong>Hora fin:</strong> {{hora_fin}}</div>
</div>
<div class="section"><h2>Participantes</h2><p>{{participantes}}</p></div>
<div class="section"><h2>Agenda</h2><p>{{agenda}}</p></div>
<div class="section"><h2>Desarrollo</h2><p>{{desarrollo}}</p></div>
<div class="section"><h2>Acuerdos y Compromisos</h2><p>{{acuerdos}}</p></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p></div>
</body></html>`;

  const actaConsejoGradoHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Acta de Consejo de Grado</title>
<style>body{font-family:'Times New Roman',serif;margin:40px 60px;color:#333;line-height:1.6}
.header{text-align:center;border-bottom:2px solid #059669;padding-bottom:15px;margin-bottom:25px}
.header h1{color:#059669;font-size:20px;margin:0}.header p{color:#666;font-size:12px}
.badge{display:inline-block;background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:12px;font-size:12px;margin-bottom:15px}
.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px;font-size:13px}
.meta strong{color:#065f46}
.section{margin-bottom:18px}.section h2{color:#059669;font-size:14px;border-bottom:1px solid #a7f3d0;padding-bottom:4px}
.section p{font-size:13px;white-space:pre-line}
.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>ACTA DE CONSEJO DE GRADO</h1><span class="badge">{{grado}}</span><p>Año Escolar {{anio_escolar}}</p></div>
<div class="meta"><div><strong>Fecha:</strong> {{fecha}}</div><div><strong>Lapso:</strong> {{lapso}}</div>
<div><strong>Coordinador:</strong> {{coordinador}}</div></div>
<div class="section"><h2>Docentes Presentes</h2><p>{{docentes_presentes}}</p></div>
<div class="section"><h2>Situación Académica del Grado</h2><p>{{situacion_academica}}</p></div>
<div class="section"><h2>Casos Especiales</h2><p>{{casos_especiales}}</p></div>
<div class="section"><h2>Acuerdos Pedagógicos</h2><p>{{acuerdos}}</p></div>
<div class="section"><h2>Observaciones</h2><p>{{observaciones}}</p></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}}</p></div>
</body></html>`;

  const actaCompromisoHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Acta de Compromiso</title>
<style>body{font-family:'Times New Roman',serif;margin:50px 70px;color:#333;line-height:1.8}
.header{text-align:center;border-bottom:2px solid #7c3aed;padding-bottom:15px;margin-bottom:30px}
.header h1{color:#7c3aed;font-size:20px}.body-text{font-size:14px;text-align:justify}
.highlight{font-weight:bold;color:#5b21b6}.section{margin:15px 0}
.signature{margin-top:70px;display:flex;justify-content:space-around}
.sign-block{text-align:center}.sign-line{border-top:1px solid #333;width:200px;margin-top:50px;padding-top:5px;font-size:12px}
.footer{margin-top:30px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>ACTA DE COMPROMISO CON REPRESENTANTES</h1></div>
<div class="body-text">
<p>En la ciudad, siendo las {{hora}} del día {{fecha}}, en las instalaciones de la institución educativa, se reúnen el/la representante del/la estudiante <span class="highlight">{{nombre_estudiante}}</span> del {{grado}}, ciudadano/a <span class="highlight">{{nombre_representante}}</span>, C.I. {{cedula_representante}}, junto con el/la docente <span class="highlight">{{nombre_docente}}</span>.</p>
<div class="section"><strong>Motivo de la reunión:</strong><p>{{motivo}}</p></div>
<div class="section"><strong>Situación presentada:</strong><p>{{situacion}}</p></div>
<div class="section"><strong>Compromisos asumidos:</strong><p>{{compromisos}}</p></div>
<div class="section"><strong>Seguimiento:</strong><p>{{seguimiento}}</p></div>
</div>
<div class="signature">
<div class="sign-block"><div class="sign-line">Representante</div></div>
<div class="sign-block"><div class="sign-line">Docente</div></div>
<div class="sign-block"><div class="sign-line">Coordinador/a</div></div>
</div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}}</p></div>
</body></html>`;

  // ── CONSTANCIAS Y CERTIFICADOS ───────────────────────────────
  const constanciaEstudioHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Constancia de Estudio</title>
<style>body{font-family:'Times New Roman',serif;margin:60px 80px;color:#333;line-height:1.8}
.header{text-align:center;margin-bottom:40px}
.header h1{color:#059669;font-size:24px;margin:0;letter-spacing:3px;text-transform:uppercase}
.header .inst{font-size:16px;color:#666;margin-top:5px}
.body-text{font-size:14px;text-align:justify;margin:30px 0}
.name{font-weight:bold;text-transform:uppercase}.data{font-weight:bold;color:#065f46}
.signature{margin-top:80px;text-align:center}
.sign-line{border-top:1px solid #333;width:250px;margin:0 auto;padding-top:5px}
.footer{margin-top:40px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>Constancia de Estudio</h1></div>
<div class="body-text">
<p>Quien suscribe certifica que el/la estudiante <span class="name">{{nombre_estudiante}}</span>, C.I. <span class="data">{{identificacion}}</span>, se encuentra debidamente inscrito/a en <span class="data">{{nivel}}</span>, cursando el <span class="data">{{grado_seccion}}</span>, período escolar <span class="data">{{anio_escolar}}</span>, desde el <span class="data">{{fecha_ingreso}}</span>.</p>
{{#if promedio}}<p>El/la estudiante mantiene un promedio de <span class="data">{{promedio}}</span> puntos.</p>{{/if}}
<p>Constancia que se expide a solicitud de la parte interesada en la ciudad, a los {{_metadata.generatedDate}}.</p>
</div>
<div class="signature"><div class="sign-line">Director/a de la Institución</div></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p></div>
</body></html>`;

  const constanciaBuenaConductaHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Constancia de Buena Conducta</title>
<style>body{font-family:'Times New Roman',serif;margin:60px 80px;color:#333;line-height:1.8}
.header{text-align:center;margin-bottom:40px}
.header h1{color:#2563eb;font-size:22px;letter-spacing:2px;text-transform:uppercase}
.body-text{font-size:14px;text-align:justify;margin:30px 0}
.name{font-weight:bold;text-transform:uppercase}.data{font-weight:bold;color:#1d4ed8}
.signature{margin-top:80px;text-align:center}
.sign-line{border-top:1px solid #333;width:250px;margin:0 auto;padding-top:5px}
.footer{margin-top:40px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>Constancia de Buena Conducta</h1></div>
<div class="body-text">
<p>Quien suscribe certifica que el/la estudiante <span class="name">{{nombre_estudiante}}</span>, C.I. <span class="data">{{identificacion}}</span>, cursante del <span class="data">{{grado_seccion}}</span>, año escolar <span class="data">{{anio_escolar}}</span>, ha demostrado durante su permanencia en esta institución una conducta <span class="data">{{calificacion_conducta}}</span>, caracterizada por el respeto a sus compañeros y al personal docente, el cumplimiento de las normas institucionales y una actitud ejemplar dentro y fuera del aula.</p>
{{#if observaciones}}<p><strong>Observaciones:</strong> {{observaciones}}</p>{{/if}}
<p>Constancia que se expide a solicitud de la parte interesada en la ciudad, a los {{_metadata.generatedDate}}.</p>
</div>
<div class="signature"><div class="sign-line">Director/a de la Institución</div></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}}</p></div>
</body></html>`;

  const certificadoCulminacionHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Certificado de Culminación</title>
<style>body{font-family:'Times New Roman',serif;margin:50px 70px;color:#333;line-height:1.8}
.header{text-align:center;border:3px double #d97706;padding:20px;margin-bottom:30px}
.header h1{color:#d97706;font-size:24px;margin:0;letter-spacing:3px}
.header p{color:#92400e;font-size:13px}
.body-text{font-size:14px;text-align:justify;margin:20px 0}
.name{font-size:20px;font-weight:bold;text-align:center;margin:20px 0;color:#92400e;text-transform:uppercase}
.data{font-weight:bold;color:#b45309}
.signature{margin-top:80px;display:flex;justify-content:space-around}
.sign-block{text-align:center}
.sign-line{border-top:1px solid #333;width:200px;margin-top:50px;padding-top:5px;font-size:12px}
.footer{margin-top:30px;text-align:center;font-size:10px;color:#999;border-top:1px solid #ddd;padding-top:10px}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>CERTIFICADO DE CULMINACIÓN DE ESTUDIOS</h1><p>{{_metadata.institutionName}} certifica que:</p></div>
<div class="name">{{nombre_estudiante}}</div>
<div class="body-text">
<p>Titular de la C.I. <span class="data">{{identificacion}}</span>, ha culminado satisfactoriamente los estudios de <span class="data">{{nivel}}</span> en esta institución educativa durante el año escolar <span class="data">{{anio_escolar}}</span>, habiendo aprobado todos los requisitos establecidos en el programa académico correspondiente, con un promedio general de <span class="data">{{promedio}}</span> puntos.</p>
<p>{{#if mencion}}Se otorga el presente certificado con mención <span class="data">{{mencion}}</span>.{{/if}}</p>
<p>Se expide el presente certificado en la ciudad, a los {{_metadata.generatedDate}}.</p>
</div>
<div class="signature">
<div class="sign-block"><div class="sign-line">Director/a</div></div>
<div class="sign-block"><div class="sign-line">Secretaria Académica</div></div>
</div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}}</p></div>
</body></html>`;

  // ── INFORMES ACADÉMICOS ───────────────────────────────────────
  const informeRendimientoHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe de Rendimiento</title>
<style>body{font-family:Arial,sans-serif;margin:40px 60px;color:#333;line-height:1.6}
.header{text-align:center;border-bottom:2px solid #dc2626;padding-bottom:15px;margin-bottom:25px}
.header h1{color:#dc2626;font-size:20px;margin:0}.header .sub{font-size:12px;color:#666}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:20px;font-size:13px}
.meta strong{color:#991b1b}
.section{margin-bottom:18px}.section h2{color:#dc2626;font-size:14px;border-bottom:1px solid #fca5a5;padding-bottom:5px}
.section p{font-size:13px;white-space:pre-line}
.scale{display:flex;gap:10px;font-size:12px;margin-top:8px}
.scale span{padding:3px 8px;border-radius:4px}
.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>INFORME DE RENDIMIENTO ACADÉMICO INDIVIDUAL</h1><p class="sub">{{_metadata.generatedDate}}</p></div>
<div class="meta"><div><strong>Estudiante:</strong> {{nombre_estudiante}}</div><div><strong>C.I.:</strong> {{identificacion}}</div>
<div><strong>Grado/Año:</strong> {{grado}}</div><div><strong>Lapso:</strong> {{lapso}}</div>
<div><strong>Docente:</strong> {{docente}}</div><div><strong>Año Escolar:</strong> {{anio_escolar}}</div></div>
<div class="section"><h2>Desempeño Académico</h2><p>{{desempeno_academico}}</p></div>
<div class="section"><h2>Áreas de Fortaleza</h2><p>{{fortalezas}}</p></div>
<div class="section"><h2>Áreas de Mejora</h2><p>{{areas_mejora}}</p></div>
<div class="section"><h2>Conducta y Actitud</h2><p>{{conducta}}</p></div>
<div class="section"><h2>Recomendaciones para el Representante</h2><p>{{recomendaciones}}</p></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p></div>
</body></html>`;

  const informePedagogicoGrupoHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe Pedagógico de Grupo</title>
<style>body{font-family:Arial,sans-serif;margin:40px 60px;color:#333;line-height:1.6}
.header{text-align:center;border-bottom:2px solid #0891b2;padding-bottom:15px;margin-bottom:25px}
.header h1{color:#0891b2;font-size:20px;margin:0}
.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:20px;font-size:13px}
.meta strong{color:#0e7490}
.section{margin-bottom:18px}.section h2{color:#0891b2;font-size:14px;border-bottom:1px solid #a5f3fc;padding-bottom:5px}
.section p{font-size:13px;white-space:pre-line}
.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>INFORME PEDAGÓGICO DE GRUPO</h1></div>
<div class="meta"><div><strong>Grado/Año:</strong> {{grado}}</div><div><strong>Materia:</strong> {{materia}}</div>
<div><strong>Lapso:</strong> {{lapso}}</div><div><strong>Docente:</strong> {{docente}}</div>
<div><strong>Total Estudiantes:</strong> {{total_estudiantes}}</div><div><strong>Año Escolar:</strong> {{anio_escolar}}</div></div>
<div class="section"><h2>Logros del Período</h2><p>{{logros}}</p></div>
<div class="section"><h2>Dificultades Identificadas</h2><p>{{dificultades}}</p></div>
<div class="section"><h2>Estrategias Aplicadas</h2><p>{{estrategias}}</p></div>
<div class="section"><h2>Indicadores de Rendimiento</h2><p>{{indicadores}}</p></div>
<div class="section"><h2>Plan de Acción para el Próximo Período</h2><p>{{plan_accion}}</p></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}}</p></div>
</body></html>`;

  const boletinCalificacionesHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Boletín de Calificaciones</title>
<style>body{font-family:Arial,sans-serif;margin:40px 60px;color:#333;line-height:1.5}
.header{text-align:center;background:#1e3a8a;color:#fff;padding:15px;border-radius:4px;margin-bottom:20px}
.header h1{font-size:18px;margin:0}.header p{font-size:12px;margin:4px 0 0}
.student-info{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#f8fafc;padding:12px;border-radius:4px;margin-bottom:20px;font-size:13px}
.student-info strong{color:#1e3a8a}
table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px}
th{background:#1e3a8a;color:#fff;padding:8px;text-align:left}td{padding:7px 8px;border-bottom:1px solid #e2e8f0}
tr:nth-child(even){background:#f8fafc}
.total{font-weight:bold;background:#dbeafe!important}
.section{margin-bottom:15px}.section h3{color:#1e3a8a;font-size:13px;margin-bottom:4px}
.section p{font-size:12px;white-space:pre-line}
.footer{margin-top:30px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>BOLETÍN DE CALIFICACIONES</h1><p>Año Escolar {{anio_escolar}} — {{lapso}}</p></div>
<div class="student-info">
<div><strong>Estudiante:</strong> {{nombre_estudiante}}</div><div><strong>C.I.:</strong> {{identificacion}}</div>
<div><strong>Grado/Sección:</strong> {{grado}}</div><div><strong>Docente Guía:</strong> {{docente_guia}}</div></div>
<table><tr><th>Materia</th><th>Nota 1</th><th>Nota 2</th><th>Nota 3</th><th>Promedio</th></tr>
<tr><td>{{materia1}}</td><td>{{nota1_1}}</td><td>{{nota1_2}}</td><td>{{nota1_3}}</td><td>{{prom1}}</td></tr>
<tr><td>{{materia2}}</td><td>{{nota2_1}}</td><td>{{nota2_2}}</td><td>{{nota2_3}}</td><td>{{prom2}}</td></tr>
<tr><td>{{materia3}}</td><td>{{nota3_1}}</td><td>{{nota3_2}}</td><td>{{nota3_3}}</td><td>{{prom3}}</td></tr>
<tr class="total"><td colspan="4">Promedio General</td><td>{{promedio_general}}</td></tr></table>
<div class="section"><h3>Observaciones del Docente</h3><p>{{observaciones}}</p></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}}</p></div>
</body></html>`;

  // ── ADMINISTRATIVOS ───────────────────────────────────────────
  const memorandumHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Memorándum</title>
<style>body{font-family:Arial,sans-serif;margin:40px 60px;color:#333;line-height:1.6}
.header{border-bottom:2px solid #d97706;padding-bottom:15px;margin-bottom:25px}
.header h1{color:#d97706;font-size:20px;margin:0}.header .numero{font-size:14px;color:#92400e;font-weight:bold}
.meta{margin-bottom:20px;font-size:13px}.meta p{margin:4px 0}
.meta strong{display:inline-block;width:80px;color:#92400e}
.content{font-size:14px;text-align:justify;white-space:pre-line;border-left:3px solid #fbbf24;padding-left:15px}
.footer{margin-top:50px;font-size:11px;color:#999;text-align:center}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>MEMORÁNDUM</h1><span class="numero">N° {{numero}}</span></div>
<div class="meta">
<p><strong>Fecha:</strong> {{fecha}}</p><p><strong>Para:</strong> {{para}}</p>
<p><strong>De:</strong> {{de}}</p><p><strong>Asunto:</strong> {{asunto}}</p>
</div>
<div class="content">{{contenido}}</div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p></div>
</body></html>`;

  const circularInformativaHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Circular Informativa</title>
<style>body{font-family:Arial,sans-serif;margin:40px 60px;color:#333;line-height:1.7}
.header{text-align:center;border-bottom:3px solid #0891b2;padding-bottom:15px;margin-bottom:25px}
.header h1{color:#0891b2;font-size:22px;margin:0}.header .numero{font-size:13px;color:#0e7490;margin-top:5px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;font-size:13px}
.meta strong{color:#0e7490}
.content{font-size:14px;text-align:justify;white-space:pre-line}
.firma{margin-top:60px;text-align:right}
.firma .line{border-top:1px solid #333;width:220px;margin-left:auto;padding-top:5px;font-size:12px}
.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>CIRCULAR INFORMATIVA</h1><p class="numero">N° {{numero}}</p></div>
<div class="meta"><div><strong>Fecha:</strong> {{fecha}}</div><div><strong>Dirigido a:</strong> {{dirigido_a}}</div>
<div><strong>Asunto:</strong> {{asunto}}</div><div><strong>Departamento:</strong> {{departamento}}</div></div>
<div class="content">{{contenido}}</div>
<div class="firma"><div class="line">{{firmante}}<br>{{cargo_firmante}}</div></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}}</p></div>
</body></html>`;

  const comunicadoRepresentantesHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Comunicado a Representantes</title>
<style>body{font-family:Arial,sans-serif;margin:40px 60px;color:#333;line-height:1.7}
.header{text-align:center;background:#f0fdf4;border:2px solid #16a34a;padding:15px;border-radius:6px;margin-bottom:25px}
.header h1{color:#15803d;font-size:20px;margin:0}.header p{color:#166534;font-size:12px}
.meta{font-size:13px;margin-bottom:20px}.meta p{margin:4px 0}
.meta strong{color:#15803d}
.content{font-size:14px;text-align:justify;white-space:pre-line}
.destacado{background:#f0fdf4;border-left:4px solid #16a34a;padding:10px 15px;margin:15px 0;font-size:13px}
.firma{margin-top:50px;text-align:center}
.sign-line{border-top:1px solid #333;width:220px;margin:50px auto 0;padding-top:5px;font-size:12px}
.footer{margin-top:30px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>COMUNICADO A REPRESENTANTES</h1><p>{{fecha}}</p></div>
<div class="meta"><p><strong>Estimado/a representante de:</strong> {{nombre_estudiante}}</p>
<p><strong>Grado/Año:</strong> {{grado}} | <strong>Docente:</strong> {{docente}}</p></div>
<div class="content">{{contenido}}</div>
{{#if informacion_importante}}<div class="destacado"><strong>Información importante:</strong> {{informacion_importante}}</div>{{/if}}
<div class="firma"><div class="sign-line">{{firmante}}<br>{{cargo_firmante}}</div></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}}</p></div>
</body></html>`;

  const solicitudPermisoHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Solicitud de Permiso</title>
<style>body{font-family:Arial,sans-serif;margin:40px 60px;color:#333;line-height:1.6}
.header{text-align:center;border-bottom:2px solid #0891b2;padding-bottom:15px;margin-bottom:25px}
.header h1{color:#0891b2;font-size:22px;margin:0}
.data{margin-bottom:20px}.data p{margin:5px 0;font-size:13px}
.data strong{color:#0e7490;display:inline-block;width:180px}
.observations{border-left:3px solid #06b6d4;padding-left:15px;margin-top:15px}
.observations h3{color:#0891b2;font-size:14px}
.signature{margin-top:60px;display:flex;justify-content:space-around}
.block{text-align:center}
.line{border-top:1px solid #333;width:200px;margin-top:50px;padding-top:5px;font-size:12px}
.footer{margin-top:40px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>SOLICITUD DE PERMISO LABORAL</h1></div>
<div class="data">
<p><strong>Nombre del solicitante:</strong> {{nombre_empleado}}</p>
<p><strong>Cargo:</strong> {{cargo}}</p>
<p><strong>Departamento:</strong> {{departamento}}</p>
<p><strong>Fecha de inicio:</strong> {{fecha_inicio}}</p>
<p><strong>Fecha de fin:</strong> {{fecha_fin}}</p>
<p><strong>Días solicitados:</strong> {{dias_solicitados}}</p>
<p><strong>Motivo:</strong> {{motivo}}</p>
</div>
{{#if observaciones}}<div class="observations"><h3>Observaciones</h3><p>{{observaciones}}</p></div>{{/if}}
<div class="signature">
<div class="block"><div class="line">Solicitante</div></div>
<div class="block"><div class="line">Autorizado por</div></div>
</div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p></div>
</body></html>`;

  // ── LEGALES ───────────────────────────────────────────────────
  const reporteIncidenciaHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte de Incidencia</title>
<style>body{font-family:Arial,sans-serif;margin:40px 60px;color:#333;line-height:1.6}
.header{background:#fef2f2;border-left:4px solid #dc2626;padding:15px 20px;margin-bottom:25px}
.header h1{color:#dc2626;font-size:20px;margin:0}.header .numero{font-size:13px;color:#991b1b}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:20px;font-size:13px}
.meta strong{color:#991b1b}
.section{margin-bottom:15px}.section h2{color:#dc2626;font-size:14px;border-bottom:1px solid #fca5a5;padding-bottom:5px}
.section p{font-size:13px;white-space:pre-line}
.footer{margin-top:40px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>REPORTE DE INCIDENCIA ESCOLAR</h1><span class="numero">N° {{numero_incidente}}</span></div>
<div class="meta">
<p><strong>Fecha:</strong> {{fecha_incidente}}</p><p><strong>Hora:</strong> {{hora_incidente}}</p>
<p><strong>Lugar:</strong> {{lugar}}</p><p><strong>Reportado por:</strong> {{reportado_por}}</p>
<p><strong>Tipo:</strong> {{tipo_incidente}}</p>
</div>
<div class="section"><h2>Descripción del Incidente</h2><p>{{descripcion}}</p></div>
{{#if personas_involucradas}}<div class="section"><h2>Personas Involucradas</h2><p>{{personas_involucradas}}</p></div>{{/if}}
<div class="section"><h2>Acciones Tomadas</h2><p>{{acciones_tomadas}}</p></div>
{{#if seguimiento}}<div class="section"><h2>Seguimiento Requerido</h2><p>{{seguimiento}}</p></div>{{/if}}
<div class="footer"><p>Generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p></div>
</body></html>`;

  const oficioHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Oficio</title>
<style>body{font-family:'Times New Roman',serif;margin:50px 70px;color:#333;line-height:1.8}
.header{text-align:center;border-bottom:2px solid #1d4ed8;padding-bottom:15px;margin-bottom:30px}
.header h1{color:#1d4ed8;font-size:20px;letter-spacing:1px;margin:0}
.meta{margin-bottom:20px;font-size:13px}
.meta-row{display:flex;justify-content:space-between;margin-bottom:4px}
.meta strong{color:#1e40af}
.destinatario{margin-bottom:20px;font-size:14px}
.destinatario .nombre{font-weight:bold;text-transform:uppercase}
.destinatario .cargo{font-style:italic;color:#555}
.asunto{margin-bottom:20px;font-size:14px}
.asunto strong{color:#1e40af}
.cuerpo{font-size:14px;text-align:justify;white-space:pre-line;margin-bottom:30px}
.cierre{font-size:14px;margin-bottom:60px}
.signature{text-align:left}
.sign-line{border-top:1px solid #333;width:250px;padding-top:5px;font-size:13px}
.sign-name{font-weight:bold}
.sign-cargo{font-style:italic;color:#555;font-size:12px}
.footer{margin-top:30px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}
<div class="header"><h1>OFICIO</h1></div>
<div class="meta">
<div class="meta-row"><span><strong>N°:</strong> {{numero}}</span><span><strong>Fecha:</strong> {{fecha}}</span></div>
<div class="meta-row"><span><strong>Lugar:</strong> {{lugar}}</span></div>
</div>
<div class="destinatario">
<p>Ciudadano/a:</p>
<p class="nombre">{{destinatario}}</p>
<p class="cargo">{{cargo_destinatario}}</p>
{{#if institucion_destinataria}}<p>{{institucion_destinataria}}</p>{{/if}}
<p>Presente.-</p>
</div>
<div class="asunto"><p><strong>Asunto:</strong> {{asunto}}</p></div>
<div class="cuerpo"><p>{{cuerpo}}</p></div>
<div class="cierre"><p>Sin otro particular, quedo de usted.</p><p>Atentamente,</p></div>
<div class="signature">
<div class="sign-line">
<p class="sign-name">{{firmante}}</p>
<p class="sign-cargo">{{cargo_firmante}}</p>
</div>
</div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p></div>
</body></html>`;

  const oficioDesignacionHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Oficio de Designación</title>
<style>body{font-family:'Times New Roman',serif;margin:50px 70px;color:#333;line-height:1.8}
.header{text-align:center;border-bottom:2px solid #1d4ed8;padding-bottom:15px;margin-bottom:30px}
.header h1{color:#1d4ed8;font-size:20px;letter-spacing:1px;margin:0}
.meta{margin-bottom:20px;font-size:13px;display:flex;justify-content:space-between}
.meta strong{color:#1e40af}
.intro{font-size:14px;margin-bottom:15px;text-align:justify}
.designado{background:#eff6ff;border-left:4px solid #1d4ed8;padding:12px 16px;margin-bottom:20px;font-size:14px}
.designado .nombre{font-weight:bold;font-size:15px;color:#1e40af}
.section{margin-bottom:15px;font-size:14px}
.section strong{color:#1e40af}
.section p{white-space:pre-line;text-align:justify}
.cierre{font-size:14px;margin:25px 0 60px}
.sign-line{border-top:1px solid #333;width:250px;padding-top:5px;font-size:13px}
.sign-name{font-weight:bold}.sign-cargo{font-style:italic;color:#555;font-size:12px}
.footer{margin-top:30px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}
<div class="header"><h1>OFICIO DE DESIGNACIÓN DOCENTE</h1></div>
<div class="meta"><span><strong>N°:</strong> {{numero}}</span><span><strong>Fecha:</strong> {{fecha}}</span><span><strong>Lugar:</strong> {{lugar}}</span></div>
<div class="intro"><p>Por medio del presente oficio, la Dirección General de esta institución educativa designa formalmente al siguiente docente:</p></div>
<div class="designado">
<p class="nombre">{{nombre_docente}}</p>
<p>Cargo: <strong>{{cargo_docente}}</strong></p>
<p>Función / Comisión: <strong>{{funcion}}</strong></p>
<p>Período: <strong>{{periodo}}</strong></p>
</div>
<div class="section"><strong>Actividades y Responsabilidades:</strong><p>{{actividades}}</p></div>
<div class="cierre"><p>Se emite el presente oficio a solicitud de la parte interesada, para los fines consiguientes.</p><p>Atentamente,</p></div>
<div class="sign-line"><p class="sign-name">{{firmante}}</p><p class="sign-cargo">{{cargo_firmante}}</p></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p></div>
</body></html>`;

  const oficioRemisionHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Oficio de Remisión</title>
<style>body{font-family:'Times New Roman',serif;margin:50px 70px;color:#333;line-height:1.8}
.header{text-align:center;border-bottom:2px solid #0891b2;padding-bottom:15px;margin-bottom:30px}
.header h1{color:#0891b2;font-size:20px;letter-spacing:1px;margin:0}
.meta{margin-bottom:20px;font-size:13px;display:flex;justify-content:space-between}
.meta strong{color:#0e7490}
.destinatario{margin-bottom:20px;font-size:14px}
.destinatario .nombre{font-weight:bold;text-transform:uppercase}
.destinatario .cargo{font-style:italic;color:#555}
.asunto{margin-bottom:20px;font-size:14px}
.asunto strong{color:#0e7490}
.intro{font-size:14px;margin-bottom:15px;text-align:justify}
.docs-table{width:100%;border-collapse:collapse;margin:15px 0;font-size:13px}
.docs-table th{background:#e0f2fe;color:#0e7490;padding:8px;text-align:left;border:1px solid #bae6fd}
.docs-table td{padding:7px 8px;border:1px solid #bae6fd;white-space:pre-line}
.section{margin-bottom:15px;font-size:14px}
.section strong{color:#0e7490}
.cierre{font-size:14px;margin:25px 0 60px}
.sign-line{border-top:1px solid #333;width:250px;padding-top:5px;font-size:13px}
.sign-name{font-weight:bold}.sign-cargo{font-style:italic;color:#555;font-size:12px}
.footer{margin-top:30px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}
<div class="header"><h1>OFICIO DE REMISIÓN DE DOCUMENTOS</h1></div>
<div class="meta"><span><strong>N°:</strong> {{numero}}</span><span><strong>Fecha:</strong> {{fecha}}</span><span><strong>Lugar:</strong> {{lugar}}</span></div>
<div class="destinatario">
<p>Ciudadano/a: <span class="nombre">{{destinatario}}</span></p>
<p class="cargo">{{cargo_destinatario}}</p>
<p>{{institucion_destinataria}}</p>
<p>Presente.-</p>
</div>
<div class="asunto"><p><strong>Asunto:</strong> {{motivo_remision}}</p></div>
<div class="intro"><p>Por medio del presente oficio, nos permitimos remitir a usted los documentos que se detallan a continuación:</p></div>
<table class="docs-table"><thead><tr><th>#</th><th>Documento Remitido</th></tr></thead>
<tbody><tr><td colspan="2" style="padding:8px;white-space:pre-line">{{documentos_remitidos}}</td></tr></tbody></table>
{{#if observaciones}}<div class="section"><strong>Observaciones:</strong><p>{{observaciones}}</p></div>{{/if}}
<div class="cierre"><p>Agradecemos su atención y quedamos a su disposición para cualquier información adicional.</p><p>Atentamente,</p></div>
<div class="sign-line"><p class="sign-name">{{firmante}}</p><p class="sign-cargo">{{cargo_firmante}}</p></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p></div>
</body></html>`;

  const contratoInscripcionHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Contrato de Inscripción</title>
<style>body{font-family:'Times New Roman',serif;margin:50px 70px;color:#333;line-height:1.7}
.header{text-align:center;border-bottom:2px solid #0891b2;padding-bottom:15px;margin-bottom:30px}
.header h1{color:#0891b2;font-size:20px;letter-spacing:1px}
.partes{margin-bottom:20px;font-size:14px;text-align:justify}
.partes strong{color:#0e7490}
.clausulas{margin-bottom:25px}
.clausulas h2{color:#0891b2;font-size:15px;border-bottom:1px solid #bae6fd;padding-bottom:5px}
.clausula{margin-bottom:12px;font-size:13px}
.clausula .num{font-weight:bold;color:#0e7490}
.signature{margin-top:60px;display:flex;justify-content:space-around}
.sign-block{text-align:center}
.sign-line{border-top:1px solid #333;width:200px;margin-top:50px;padding-top:5px;font-size:12px}
.footer{margin-top:30px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>CONTRATO DE INSCRIPCIÓN ESTUDIANTIL</h1></div>
<div class="partes">
<p>Entre la institución educativa, representada por su Director/a <strong>{{director}}</strong>, y el/la representante legal <strong>{{nombre_representante}}</strong>, C.I. <strong>{{cedula_representante}}</strong>, en representación del/la estudiante <strong>{{nombre_estudiante}}</strong>, C.I. <strong>{{cedula_estudiante}}</strong>, cursante del <strong>{{grado}}</strong>, año escolar <strong>{{anio_escolar}}</strong>, se celebra el presente contrato de inscripción.</p>
</div>
<div class="clausulas">
<h2>Cláusulas</h2>
<div class="clausula"><span class="num">PRIMERA.</span> {{clausula_primera}}</div>
<div class="clausula"><span class="num">SEGUNDA.</span> {{clausula_segunda}}</div>
<div class="clausula"><span class="num">TERCERA.</span> {{clausula_tercera}}</div>
{{#if clausula_cuarta}}<div class="clausula"><span class="num">CUARTA.</span> {{clausula_cuarta}}</div>{{/if}}
</div>
<p style="font-size:13px">En señal de conformidad, firman en la ciudad a los {{_metadata.generatedDate}}.</p>
<div class="signature">
<div class="sign-block"><div class="sign-line">Director/a de la Institución</div></div>
<div class="sign-block"><div class="sign-line">Representante Legal</div></div>
</div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}}</p></div>
</body></html>`;

  // ── FINANCIEROS ───────────────────────────────────────────────
  const reciboArancelesHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Recibo de Pago</title>
<style>body{font-family:Arial,sans-serif;margin:40px 60px;color:#333;line-height:1.6}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #16a34a;padding-bottom:15px;margin-bottom:25px}
.header h1{color:#16a34a;font-size:22px;margin:0}.header .recibo-num{font-size:14px;color:#166534;font-weight:bold}
.student{background:#f0fdf4;padding:12px;border-radius:6px;margin-bottom:20px;font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:6px}
.student strong{color:#15803d}
table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px}
th{background:#16a34a;color:#fff;padding:8px}td{padding:8px;border-bottom:1px solid #e2e8f0}
.total-row{font-weight:bold;background:#f0fdf4}
.nota{font-size:12px;color:#666;font-style:italic}
.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}
<div class="header"><h1>RECIBO DE PAGO DE ARANCELES</h1><span class="recibo-num">N° {{numero_recibo}}</span></div>
<div class="student">
<div><strong>Estudiante:</strong> {{nombre_estudiante}}</div><div><strong>C.I.:</strong> {{identificacion}}</div>
<div><strong>Grado:</strong> {{grado}}</div><div><strong>Año Escolar:</strong> {{anio_escolar}}</div>
</div>
<table>
<tr><th>Concepto</th><th>Mes/Período</th><th>Monto</th></tr>
<tr><td>{{concepto1}}</td><td>{{periodo1}}</td><td>{{monto1}}</td></tr>
<tr><td>{{concepto2}}</td><td>{{periodo2}}</td><td>{{monto2}}</td></tr>
{{#if concepto3}}<tr><td>{{concepto3}}</td><td>{{periodo3}}</td><td>{{monto3}}</td></tr>{{/if}}
<tr class="total-row"><td colspan="2">TOTAL PAGADO</td><td>{{total}}</td></tr>
</table>
<p><strong>Forma de pago:</strong> {{forma_pago}} | <strong>Fecha:</strong> {{fecha_pago}}</p>
<p class="nota">{{observaciones}}</p>
<div class="footer"><p>Generado el {{_metadata.generatedDate}}</p></div>
</body></html>`;

  const presupuestoActividadHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Presupuesto de Actividad</title>
<style>body{font-family:Arial,sans-serif;margin:40px 60px;color:#333;line-height:1.6}
.header{text-align:center;border-bottom:2px solid #7c3aed;padding-bottom:15px;margin-bottom:25px}
.header h1{color:#7c3aed;font-size:20px;margin:0}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;font-size:13px}
.meta strong{color:#5b21b6}
table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px}
th{background:#7c3aed;color:#fff;padding:8px}td{padding:7px 8px;border-bottom:1px solid #e5e7eb}
.total-row{font-weight:bold;background:#f5f3ff}
.section{margin-bottom:15px}.section h2{color:#7c3aed;font-size:14px;border-bottom:1px solid #ddd;padding-bottom:4px}
.section p{font-size:13px;white-space:pre-line}
.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#999}</style></head>
<body>{{> institutionHeader}}<div class="header"><h1>PRESUPUESTO DE ACTIVIDAD ESCOLAR</h1></div>
<div class="meta"><div><strong>Actividad:</strong> {{nombre_actividad}}</div><div><strong>Fecha:</strong> {{fecha_actividad}}</div>
<div><strong>Responsable:</strong> {{responsable}}</div><div><strong>Participantes:</strong> {{participantes}}</div></div>
<div class="section"><h2>Descripción de la Actividad</h2><p>{{descripcion}}</p></div>
<table>
<tr><th>Concepto</th><th>Cantidad</th><th>Precio Unit.</th><th>Total</th></tr>
<tr><td>{{item1}}</td><td>{{cant1}}</td><td>{{precio1}}</td><td>{{subtotal1}}</td></tr>
<tr><td>{{item2}}</td><td>{{cant2}}</td><td>{{precio2}}</td><td>{{subtotal2}}</td></tr>
<tr><td>{{item3}}</td><td>{{cant3}}</td><td>{{precio3}}</td><td>{{subtotal3}}</td></tr>
{{#if item4}}<tr><td>{{item4}}</td><td>{{cant4}}</td><td>{{precio4}}</td><td>{{subtotal4}}</td></tr>{{/if}}
<tr class="total-row"><td colspan="3">TOTAL ESTIMADO</td><td>{{total_estimado}}</td></tr>
</table>
<div class="section"><h2>Justificación</h2><p>{{justificacion}}</p></div>
<div class="footer"><p>Generado el {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</p></div>
</body></html>`;

  const templates = [
    // ── PLANIFICACIONES (roles: profesor, coordinador)
    {
      name: 'Planificación Semanal de Clase',
      documentTypeId: dtPlanSemanal.id,
      description: 'Planificación detallada de actividades, objetivos y estrategias para la semana de clases',
      htmlTemplate: planSemanalHtml,
      categoryId: catPlanificaciones.id,
      fields: { fields: [
        { name: 'docente',     label: 'Nombre del docente',   type: 'text',     required: true },
        { name: 'grado',       label: 'Grado / Año',           type: 'text',     required: true },
        { name: 'materia',     label: 'Materia / Área',        type: 'text',     required: true },
        { name: 'semana',      label: 'Semana (del / al)',     type: 'text',     required: true },
        { name: 'objetivos',   label: 'Objetivos de la semana', type: 'textarea', required: true },
        { name: 'contenidos',  label: 'Contenidos',            type: 'textarea', required: true },
        { name: 'estrategias', label: 'Estrategias y actividades', type: 'textarea', required: true },
        { name: 'recursos',    label: 'Recursos didácticos',   type: 'textarea', required: true },
        { name: 'evaluacion',  label: 'Criterios de evaluación', type: 'textarea', required: true },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Proyecto Pedagógico de Aula',
      documentTypeId: dtProyecto.id,
      description: 'Proyecto pedagógico integrador para el aula con propósitos, actividades y evaluación',
      htmlTemplate: proyectoPedagogicoHtml,
      categoryId: catPlanificaciones.id,
      fields: { fields: [
        { name: 'docente',          label: 'Nombre del docente',    type: 'text',     required: true },
        { name: 'grado',            label: 'Grado / Sección',       type: 'text',     required: true },
        { name: 'area',             label: 'Área de aprendizaje',   type: 'text',     required: true },
        { name: 'anio_escolar',     label: 'Año escolar',           type: 'text',     required: true },
        { name: 'duracion',         label: 'Duración estimada',     type: 'text',     required: true },
        { name: 'nombre_proyecto',  label: 'Nombre del proyecto',   type: 'text',     required: true },
        { name: 'justificacion',    label: 'Justificación',         type: 'textarea', required: true },
        { name: 'propositos',       label: 'Propósitos',            type: 'textarea', required: true },
        { name: 'actividades',      label: 'Actividades previstas', type: 'textarea', required: true },
        { name: 'evaluacion',       label: 'Evaluación del proyecto', type: 'textarea', required: true },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Plan de Evaluación Trimestral',
      documentTypeId: dtPlanEvaluacion.id,
      description: 'Plan de evaluación con criterios, instrumentos y ponderación para el trimestre',
      htmlTemplate: planEvaluacionHtml,
      categoryId: catPlanificaciones.id,
      fields: { fields: [
        { name: 'docente',       label: 'Nombre del docente',    type: 'text',     required: true },
        { name: 'materia',       label: 'Materia',               type: 'text',     required: true },
        { name: 'grado',         label: 'Grado / Año',           type: 'text',     required: true },
        { name: 'trimestre',     label: 'Trimestre',             type: 'text',     required: true },
        { name: 'anio_escolar',  label: 'Año escolar',           type: 'text',     required: true },
        { name: 'criterios',     label: 'Criterios de evaluación', type: 'textarea', required: true },
        { name: 'instrumentos',  label: 'Instrumentos de evaluación', type: 'textarea', required: true },
        { name: 'actividad1',    label: 'Actividad 1',           type: 'text',     required: true },
        { name: 'tipo1',         label: 'Tipo (Actividad 1)',    type: 'text',     required: true },
        { name: 'ponderacion1',  label: 'Porcentaje (Actividad 1)', type: 'number', required: true },
        { name: 'actividad2',    label: 'Actividad 2',           type: 'text',     required: true },
        { name: 'tipo2',         label: 'Tipo (Actividad 2)',    type: 'text',     required: true },
        { name: 'ponderacion2',  label: 'Porcentaje (Actividad 2)', type: 'number', required: true },
        { name: 'actividad3',    label: 'Actividad 3',           type: 'text',     required: true },
        { name: 'tipo3',         label: 'Tipo (Actividad 3)',    type: 'text',     required: true },
        { name: 'ponderacion3',  label: 'Porcentaje (Actividad 3)', type: 'number', required: true },
        { name: 'observaciones', label: 'Observaciones',         type: 'textarea', required: false },
      ]},
      createdById: admin.id, isActive: true,
    },

    // ── ACTAS Y REUNIONES (roles: coordinador, secretario, director)
    {
      name: 'Acta de Reunión de Personal',
      documentTypeId: dtActaReunion.id,
      description: 'Registro de reuniones de personal docente y administrativo con acuerdos y compromisos',
      htmlTemplate: actaReunionPersonalHtml,
      categoryId: catActas.id,
      fields: { fields: [
        { name: 'titulo',        label: 'Título de la reunión',        type: 'text',     required: true },
        { name: 'fecha',         label: 'Fecha',                        type: 'date',     required: true },
        { name: 'hora_inicio',   label: 'Hora de inicio',               type: 'time',     required: true },
        { name: 'hora_fin',      label: 'Hora de finalización',         type: 'time',     required: true },
        { name: 'lugar',         label: 'Lugar',                        type: 'text',     required: true },
        { name: 'participantes', label: 'Participantes',                type: 'textarea', required: true },
        { name: 'agenda',        label: 'Agenda',                       type: 'textarea', required: true },
        { name: 'desarrollo',    label: 'Desarrollo de la reunión',     type: 'textarea', required: true },
        { name: 'acuerdos',      label: 'Acuerdos y compromisos',       type: 'textarea', required: true },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Acta de Consejo de Grado',
      documentTypeId: dtActaConsejo.id,
      description: 'Acta de consejo de grado o año con la situación académica y acuerdos pedagógicos del período',
      htmlTemplate: actaConsejoGradoHtml,
      categoryId: catActas.id,
      fields: { fields: [
        { name: 'grado',               label: 'Grado / Año',              type: 'text',     required: true },
        { name: 'anio_escolar',        label: 'Año escolar',              type: 'text',     required: true },
        { name: 'fecha',               label: 'Fecha del consejo',        type: 'date',     required: true },
        { name: 'lapso',               label: 'Lapso evaluativo',         type: 'text',     required: true },
        { name: 'coordinador',         label: 'Coordinador/a',            type: 'text',     required: true },
        { name: 'docentes_presentes',  label: 'Docentes presentes',       type: 'textarea', required: true },
        { name: 'situacion_academica', label: 'Situación académica',      type: 'textarea', required: true },
        { name: 'casos_especiales',    label: 'Casos especiales',         type: 'textarea', required: false },
        { name: 'acuerdos',            label: 'Acuerdos pedagógicos',     type: 'textarea', required: true },
        { name: 'observaciones',       label: 'Observaciones',            type: 'textarea', required: false },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Acta de Compromiso con Representantes',
      documentTypeId: dtActaCompromiso.id,
      description: 'Registro formal de compromisos asumidos por representantes en reunión con el docente',
      htmlTemplate: actaCompromisoHtml,
      categoryId: catActas.id,
      fields: { fields: [
        { name: 'fecha',                label: 'Fecha',                         type: 'date',     required: true },
        { name: 'hora',                 label: 'Hora',                          type: 'time',     required: true },
        { name: 'nombre_estudiante',    label: 'Nombre del estudiante',         type: 'text',     required: true },
        { name: 'grado',                label: 'Grado / Año',                   type: 'text',     required: true },
        { name: 'nombre_representante', label: 'Nombre del representante',      type: 'text',     required: true },
        { name: 'cedula_representante', label: 'Cédula del representante',      type: 'text',     required: true },
        { name: 'nombre_docente',       label: 'Nombre del docente',            type: 'text',     required: true },
        { name: 'motivo',               label: 'Motivo de la reunión',          type: 'textarea', required: true },
        { name: 'situacion',            label: 'Situación presentada',          type: 'textarea', required: true },
        { name: 'compromisos',          label: 'Compromisos asumidos',          type: 'textarea', required: true },
        { name: 'seguimiento',          label: 'Plan de seguimiento',           type: 'textarea', required: false },
      ]},
      createdById: admin.id, isActive: true,
    },

    // ── CONSTANCIAS Y CERTIFICADOS (roles: secretario, director)
    {
      name: 'Constancia de Estudio',
      documentTypeId: dtConstanciaEstudios.id,
      description: 'Constancia oficial de inscripción y estudios activos del estudiante en la institución',
      htmlTemplate: constanciaEstudioHtml,
      categoryId: catConstancias.id,
      fields: { fields: [
        { name: 'nombre_estudiante', label: 'Nombre completo del estudiante', type: 'text',   required: true },
        { name: 'identificacion',    label: 'Cédula de identidad',           type: 'text',   required: true },
        { name: 'nivel',             label: 'Nivel (Primaria / Secundaria)', type: 'text',   required: true },
        { name: 'grado_seccion',     label: 'Grado y sección',              type: 'text',   required: true },
        { name: 'anio_escolar',      label: 'Año escolar',                  type: 'text',   required: true },
        { name: 'fecha_ingreso',     label: 'Fecha de ingreso a la institución', type: 'date', required: true },
        { name: 'promedio',          label: 'Promedio académico (opcional)', type: 'number', required: false },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Constancia de Buena Conducta',
      documentTypeId: dtConstanciaConducta.id,
      description: 'Constancia que acredita el comportamiento ejemplar del estudiante en la institución',
      htmlTemplate: constanciaBuenaConductaHtml,
      categoryId: catConstancias.id,
      fields: { fields: [
        { name: 'nombre_estudiante',  label: 'Nombre completo del estudiante', type: 'text',     required: true },
        { name: 'identificacion',     label: 'Cédula de identidad',           type: 'text',     required: true },
        { name: 'grado_seccion',      label: 'Grado y sección',              type: 'text',     required: true },
        { name: 'anio_escolar',       label: 'Año escolar',                  type: 'text',     required: true },
        { name: 'calificacion_conducta', label: 'Calificación de conducta',  type: 'text',     required: true },
        { name: 'observaciones',      label: 'Observaciones (opcional)',     type: 'textarea', required: false },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Certificado de Culminación de Estudios',
      documentTypeId: dtCertificado.id,
      description: 'Certificado oficial que acredita la culminación exitosa de un nivel educativo',
      htmlTemplate: certificadoCulminacionHtml,
      categoryId: catConstancias.id,
      fields: { fields: [
        { name: 'nombre_estudiante', label: 'Nombre completo del estudiante', type: 'text',   required: true },
        { name: 'identificacion',    label: 'Cédula de identidad',           type: 'text',   required: true },
        { name: 'nivel',             label: 'Nivel culminado',               type: 'text',   required: true },
        { name: 'anio_escolar',      label: 'Año escolar',                  type: 'text',   required: true },
        { name: 'promedio',          label: 'Promedio general',             type: 'number', required: true },
        { name: 'mencion',           label: 'Mención (opcional)',           type: 'text',   required: false },
      ]},
      createdById: admin.id, isActive: true,
    },

    // ── INFORMES ACADÉMICOS (roles: profesor, coordinador, director)
    {
      name: 'Informe de Rendimiento Académico Individual',
      documentTypeId: dtInformeRendimiento.id,
      description: 'Informe detallado del desempeño académico individual de un estudiante por período',
      htmlTemplate: informeRendimientoHtml,
      categoryId: catInformes.id,
      fields: { fields: [
        { name: 'nombre_estudiante', label: 'Nombre del estudiante',     type: 'text',     required: true },
        { name: 'identificacion',    label: 'Cédula de identidad',       type: 'text',     required: true },
        { name: 'grado',             label: 'Grado / Año',               type: 'text',     required: true },
        { name: 'lapso',             label: 'Lapso evaluativo',          type: 'text',     required: true },
        { name: 'docente',           label: 'Docente',                   type: 'text',     required: true },
        { name: 'anio_escolar',      label: 'Año escolar',               type: 'text',     required: true },
        { name: 'desempeno_academico', label: 'Desempeño académico',     type: 'textarea', required: true },
        { name: 'fortalezas',        label: 'Áreas de fortaleza',        type: 'textarea', required: true },
        { name: 'areas_mejora',      label: 'Áreas de mejora',           type: 'textarea', required: true },
        { name: 'conducta',          label: 'Conducta y actitud',        type: 'textarea', required: true },
        { name: 'recomendaciones',   label: 'Recomendaciones',           type: 'textarea', required: false },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Informe Pedagógico de Grupo',
      documentTypeId: dtInformeGrupo.id,
      description: 'Informe del desempeño pedagógico colectivo del grupo durante el período evaluativo',
      htmlTemplate: informePedagogicoGrupoHtml,
      categoryId: catInformes.id,
      fields: { fields: [
        { name: 'grado',              label: 'Grado / Año',                type: 'text',     required: true },
        { name: 'materia',            label: 'Materia / Área',             type: 'text',     required: true },
        { name: 'lapso',              label: 'Lapso evaluativo',           type: 'text',     required: true },
        { name: 'docente',            label: 'Docente',                    type: 'text',     required: true },
        { name: 'total_estudiantes',  label: 'Total de estudiantes',       type: 'number',   required: true },
        { name: 'anio_escolar',       label: 'Año escolar',                type: 'text',     required: true },
        { name: 'logros',             label: 'Logros del período',         type: 'textarea', required: true },
        { name: 'dificultades',       label: 'Dificultades identificadas', type: 'textarea', required: true },
        { name: 'estrategias',        label: 'Estrategias aplicadas',      type: 'textarea', required: true },
        { name: 'indicadores',        label: 'Indicadores de rendimiento', type: 'textarea', required: true },
        { name: 'plan_accion',        label: 'Plan de acción próximo período', type: 'textarea', required: false },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Boletín de Calificaciones',
      documentTypeId: dtBoletin.id,
      description: 'Boletín simplificado con las calificaciones del estudiante por materias y período',
      htmlTemplate: boletinCalificacionesHtml,
      categoryId: catInformes.id,
      fields: { fields: [
        { name: 'nombre_estudiante', label: 'Nombre del estudiante',    type: 'text',   required: true },
        { name: 'identificacion',    label: 'Cédula de identidad',      type: 'text',   required: true },
        { name: 'grado',             label: 'Grado / Sección',          type: 'text',   required: true },
        { name: 'lapso',             label: 'Lapso evaluativo',         type: 'text',   required: true },
        { name: 'docente_guia',      label: 'Docente guía',             type: 'text',   required: true },
        { name: 'anio_escolar',      label: 'Año escolar',              type: 'text',   required: true },
        { name: 'materia1',          label: 'Materia 1',                type: 'text',   required: true },
        { name: 'nota1_1',           label: 'Nota 1 (Materia 1)',       type: 'number', required: true },
        { name: 'nota1_2',           label: 'Nota 2 (Materia 1)',       type: 'number', required: true },
        { name: 'nota1_3',           label: 'Nota 3 (Materia 1)',       type: 'number', required: true },
        { name: 'prom1',             label: 'Promedio Materia 1',       type: 'number', required: true },
        { name: 'materia2',          label: 'Materia 2',                type: 'text',   required: true },
        { name: 'nota2_1',           label: 'Nota 1 (Materia 2)',       type: 'number', required: true },
        { name: 'nota2_2',           label: 'Nota 2 (Materia 2)',       type: 'number', required: true },
        { name: 'nota2_3',           label: 'Nota 3 (Materia 2)',       type: 'number', required: true },
        { name: 'prom2',             label: 'Promedio Materia 2',       type: 'number', required: true },
        { name: 'materia3',          label: 'Materia 3',                type: 'text',   required: true },
        { name: 'nota3_1',           label: 'Nota 1 (Materia 3)',       type: 'number', required: true },
        { name: 'nota3_2',           label: 'Nota 2 (Materia 3)',       type: 'number', required: true },
        { name: 'nota3_3',           label: 'Nota 3 (Materia 3)',       type: 'number', required: true },
        { name: 'prom3',             label: 'Promedio Materia 3',       type: 'number', required: true },
        { name: 'promedio_general',  label: 'Promedio general',        type: 'number', required: true },
        { name: 'observaciones',     label: 'Observaciones del docente', type: 'textarea', required: false },
      ]},
      createdById: admin.id, isActive: true,
    },

    // ── ADMINISTRATIVOS (roles: coordinador, secretario, director)
    {
      name: 'Memorándum Interno',
      documentTypeId: dtMemorando.id,
      description: 'Comunicación interna oficial entre departamentos o personal de la institución',
      htmlTemplate: memorandumHtml,
      categoryId: catAdministrativos.id,
      fields: { fields: [
        { name: 'numero',    label: 'Número de memorándum',       type: 'text',     required: true },
        { name: 'fecha',     label: 'Fecha',                      type: 'date',     required: true },
        { name: 'para',      label: 'Para (Destinatario)',        type: 'text',     required: true },
        { name: 'de',        label: 'De (Remitente)',             type: 'text',     required: true },
        { name: 'asunto',    label: 'Asunto',                     type: 'text',     required: true },
        { name: 'contenido', label: 'Contenido del memorándum',   type: 'textarea', required: true },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Circular Informativa',
      documentTypeId: dtCircular.id,
      description: 'Comunicado oficial dirigido a docentes, personal administrativo o representantes',
      htmlTemplate: circularInformativaHtml,
      categoryId: catAdministrativos.id,
      fields: { fields: [
        { name: 'numero',          label: 'Número de circular',    type: 'text',     required: true },
        { name: 'fecha',           label: 'Fecha',                 type: 'date',     required: true },
        { name: 'dirigido_a',      label: 'Dirigido a',           type: 'text',     required: true },
        { name: 'asunto',          label: 'Asunto',               type: 'text',     required: true },
        { name: 'departamento',    label: 'Departamento emisor',  type: 'text',     required: true },
        { name: 'contenido',       label: 'Contenido',            type: 'textarea', required: true },
        { name: 'firmante',        label: 'Nombre del firmante',  type: 'text',     required: true },
        { name: 'cargo_firmante',  label: 'Cargo del firmante',   type: 'text',     required: true },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Comunicado a Representantes',
      documentTypeId: dtComunicado.id,
      description: 'Comunicado formal para los representantes de un estudiante específico',
      htmlTemplate: comunicadoRepresentantesHtml,
      categoryId: catAdministrativos.id,
      fields: { fields: [
        { name: 'fecha',                 label: 'Fecha',                      type: 'date',     required: true },
        { name: 'nombre_estudiante',     label: 'Nombre del estudiante',      type: 'text',     required: true },
        { name: 'grado',                 label: 'Grado / Año',                type: 'text',     required: true },
        { name: 'docente',               label: 'Docente',                    type: 'text',     required: true },
        { name: 'contenido',             label: 'Contenido del comunicado',   type: 'textarea', required: true },
        { name: 'informacion_importante', label: 'Información importante (opcional)', type: 'textarea', required: false },
        { name: 'firmante',              label: 'Nombre del firmante',        type: 'text',     required: true },
        { name: 'cargo_firmante',        label: 'Cargo del firmante',         type: 'text',     required: true },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Solicitud de Permiso Laboral',
      documentTypeId: dtSolicitudPermiso.id,
      description: 'Solicitud formal de permiso laboral para el personal docente o administrativo',
      htmlTemplate: solicitudPermisoHtml,
      categoryId: catAdministrativos.id,
      fields: { fields: [
        { name: 'nombre_empleado', label: 'Nombre del solicitante',    type: 'text',     required: true },
        { name: 'cargo',           label: 'Cargo',                    type: 'text',     required: true },
        { name: 'departamento',    label: 'Departamento',             type: 'text',     required: true },
        { name: 'fecha_inicio',    label: 'Fecha de inicio',          type: 'date',     required: true },
        { name: 'fecha_fin',       label: 'Fecha de fin',             type: 'date',     required: true },
        { name: 'dias_solicitados', label: 'Días solicitados',        type: 'number',   required: true },
        { name: 'motivo',          label: 'Motivo del permiso',       type: 'textarea', required: true },
        { name: 'observaciones',   label: 'Observaciones',            type: 'textarea', required: false },
      ]},
      createdById: admin.id, isActive: true,
    },

    {
      name: 'Oficio',
      documentTypeId: dtOficio.id,
      description: 'Comunicación oficial externa o entre instituciones educativas y organismos',
      htmlTemplate: oficioHtml,
      categoryId: catAdministrativos.id,
      fields: { fields: [
        { name: 'numero',                 label: 'Número de oficio',          type: 'text',     required: true },
        { name: 'fecha',                  label: 'Fecha',                     type: 'date',     required: true },
        { name: 'lugar',                  label: 'Lugar',                     type: 'text',     required: true },
        { name: 'destinatario',           label: 'Nombre del destinatario',   type: 'text',     required: true },
        { name: 'cargo_destinatario',     label: 'Cargo del destinatario',    type: 'text',     required: true },
        { name: 'institucion_destinataria', label: 'Institución destinataria (opcional)', type: 'text', required: false },
        { name: 'asunto',                 label: 'Asunto',                    type: 'text',     required: true },
        { name: 'cuerpo',                 label: 'Cuerpo del oficio',         type: 'textarea', required: true },
        { name: 'firmante',               label: 'Nombre del firmante',       type: 'text',     required: true },
        { name: 'cargo_firmante',         label: 'Cargo del firmante',        type: 'text',     required: true },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Oficio de Designación Docente',
      documentTypeId: dtOficio.id,
      description: 'Oficio para designar a un docente en una función, comisión o representación institucional',
      htmlTemplate: oficioDesignacionHtml,
      categoryId: catAdministrativos.id,
      fields: { fields: [
        { name: 'numero',           label: 'Número de oficio',              type: 'text',     required: true },
        { name: 'fecha',            label: 'Fecha',                         type: 'date',     required: true },
        { name: 'lugar',            label: 'Lugar',                         type: 'text',     required: true },
        { name: 'nombre_docente',   label: 'Nombre del docente designado',  type: 'text',     required: true },
        { name: 'cargo_docente',    label: 'Cargo del docente',             type: 'text',     required: true },
        { name: 'funcion',          label: 'Función / Comisión asignada',   type: 'text',     required: true },
        { name: 'periodo',          label: 'Período de la designación',     type: 'text',     required: true },
        { name: 'actividades',      label: 'Actividades o responsabilidades', type: 'textarea', required: true },
        { name: 'firmante',         label: 'Nombre del firmante',           type: 'text',     required: true },
        { name: 'cargo_firmante',   label: 'Cargo del firmante',            type: 'text',     required: true },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Oficio de Remisión de Documentos',
      documentTypeId: dtOficio.id,
      description: 'Oficio para remitir expedientes, informes u otros documentos a instituciones externas',
      htmlTemplate: oficioRemisionHtml,
      categoryId: catAdministrativos.id,
      fields: { fields: [
        { name: 'numero',                   label: 'Número de oficio',             type: 'text',     required: true },
        { name: 'fecha',                    label: 'Fecha',                        type: 'date',     required: true },
        { name: 'lugar',                    label: 'Lugar',                        type: 'text',     required: true },
        { name: 'destinatario',             label: 'Nombre del destinatario',      type: 'text',     required: true },
        { name: 'cargo_destinatario',       label: 'Cargo del destinatario',       type: 'text',     required: true },
        { name: 'institucion_destinataria', label: 'Institución destinataria',     type: 'text',     required: true },
        { name: 'motivo_remision',          label: 'Motivo de la remisión',        type: 'text',     required: true },
        { name: 'documentos_remitidos',     label: 'Documentos remitidos',         type: 'textarea', required: true },
        { name: 'observaciones',            label: 'Observaciones (opcional)',     type: 'textarea', required: false },
        { name: 'firmante',                 label: 'Nombre del firmante',          type: 'text',     required: true },
        { name: 'cargo_firmante',           label: 'Cargo del firmante',           type: 'text',     required: true },
      ]},
      createdById: admin.id, isActive: true,
    },

    // ── LEGALES (roles: director, admin)
    {
      name: 'Reporte de Incidencia Escolar',
      documentTypeId: dtReporteIncidencia.id,
      description: 'Registro formal de incidencias, accidentes o situaciones disciplinarias en la institución',
      htmlTemplate: reporteIncidenciaHtml,
      categoryId: catAdministrativos.id,
      fields: { fields: [
        { name: 'numero_incidente',    label: 'Número de incidencia',    type: 'text',     required: true },
        { name: 'fecha_incidente',     label: 'Fecha del incidente',     type: 'date',     required: true },
        { name: 'hora_incidente',      label: 'Hora del incidente',      type: 'time',     required: true },
        { name: 'lugar',               label: 'Lugar',                   type: 'text',     required: true },
        { name: 'reportado_por',       label: 'Reportado por',           type: 'text',     required: true },
        { name: 'tipo_incidente',      label: 'Tipo de incidencia',      type: 'text',     required: true },
        { name: 'descripcion',         label: 'Descripción',             type: 'textarea', required: true },
        { name: 'personas_involucradas', label: 'Personas involucradas', type: 'textarea', required: false },
        { name: 'acciones_tomadas',    label: 'Acciones tomadas',        type: 'textarea', required: true },
        { name: 'seguimiento',         label: 'Seguimiento requerido',   type: 'textarea', required: false },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Contrato de Inscripción Estudiantil',
      documentTypeId: dtContratoInscripcion.id,
      description: 'Contrato formal entre la institución y el representante al momento de la inscripción',
      htmlTemplate: contratoInscripcionHtml,
      categoryId: catLegales.id,
      fields: { fields: [
        { name: 'director',              label: 'Nombre del Director/a',          type: 'text',     required: true },
        { name: 'nombre_representante',  label: 'Nombre del representante',       type: 'text',     required: true },
        { name: 'cedula_representante',  label: 'Cédula del representante',       type: 'text',     required: true },
        { name: 'nombre_estudiante',     label: 'Nombre del estudiante',          type: 'text',     required: true },
        { name: 'cedula_estudiante',     label: 'Cédula del estudiante',          type: 'text',     required: true },
        { name: 'grado',                 label: 'Grado / Año',                    type: 'text',     required: true },
        { name: 'anio_escolar',          label: 'Año escolar',                    type: 'text',     required: true },
        { name: 'clausula_primera',      label: 'Cláusula Primera',               type: 'textarea', required: true },
        { name: 'clausula_segunda',      label: 'Cláusula Segunda',               type: 'textarea', required: true },
        { name: 'clausula_tercera',      label: 'Cláusula Tercera',               type: 'textarea', required: true },
        { name: 'clausula_cuarta',       label: 'Cláusula Cuarta (opcional)',      type: 'textarea', required: false },
      ]},
      createdById: admin.id, isActive: true,
    },

    // ── FINANCIEROS (roles: secretario, director, admin)
    {
      name: 'Recibo de Pago de Aranceles',
      documentTypeId: dtReciboPago.id,
      description: 'Recibo oficial de pago de aranceles escolares con desglose de conceptos',
      htmlTemplate: reciboArancelesHtml,
      categoryId: catFinancieros.id,
      fields: { fields: [
        { name: 'numero_recibo',     label: 'Número de recibo',        type: 'text',   required: true },
        { name: 'nombre_estudiante', label: 'Nombre del estudiante',   type: 'text',   required: true },
        { name: 'identificacion',    label: 'Cédula de identidad',     type: 'text',   required: true },
        { name: 'grado',             label: 'Grado / Año',             type: 'text',   required: true },
        { name: 'anio_escolar',      label: 'Año escolar',             type: 'text',   required: true },
        { name: 'concepto1',         label: 'Concepto 1',              type: 'text',   required: true },
        { name: 'periodo1',          label: 'Período 1',               type: 'text',   required: true },
        { name: 'monto1',            label: 'Monto 1',                 type: 'text',   required: true },
        { name: 'concepto2',         label: 'Concepto 2',              type: 'text',   required: false },
        { name: 'periodo2',          label: 'Período 2',               type: 'text',   required: false },
        { name: 'monto2',            label: 'Monto 2',                 type: 'text',   required: false },
        { name: 'concepto3',         label: 'Concepto 3 (opcional)',   type: 'text',   required: false },
        { name: 'periodo3',          label: 'Período 3 (opcional)',    type: 'text',   required: false },
        { name: 'monto3',            label: 'Monto 3 (opcional)',      type: 'text',   required: false },
        { name: 'total',             label: 'Total pagado',            type: 'text',   required: true },
        { name: 'forma_pago',        label: 'Forma de pago',          type: 'text',   required: true },
        { name: 'fecha_pago',        label: 'Fecha de pago',          type: 'date',   required: true },
        { name: 'observaciones',     label: 'Observaciones',          type: 'textarea', required: false },
      ]},
      createdById: admin.id, isActive: true,
    },
    {
      name: 'Presupuesto de Actividad Escolar',
      documentTypeId: dtPresupuesto.id,
      description: 'Presupuesto estimado para actividades escolares con desglose de ítems y costos',
      htmlTemplate: presupuestoActividadHtml,
      categoryId: catFinancieros.id,
      fields: { fields: [
        { name: 'nombre_actividad', label: 'Nombre de la actividad',  type: 'text',     required: true },
        { name: 'fecha_actividad',  label: 'Fecha de la actividad',   type: 'date',     required: true },
        { name: 'responsable',      label: 'Responsable',             type: 'text',     required: true },
        { name: 'participantes',    label: 'Participantes',           type: 'text',     required: true },
        { name: 'descripcion',      label: 'Descripción',             type: 'textarea', required: true },
        { name: 'item1',            label: 'Ítem 1',                  type: 'text',     required: true },
        { name: 'cant1',            label: 'Cantidad 1',              type: 'number',   required: true },
        { name: 'precio1',          label: 'Precio unitario 1',       type: 'text',     required: true },
        { name: 'subtotal1',        label: 'Subtotal 1',              type: 'text',     required: true },
        { name: 'item2',            label: 'Ítem 2',                  type: 'text',     required: false },
        { name: 'cant2',            label: 'Cantidad 2',              type: 'number',   required: false },
        { name: 'precio2',          label: 'Precio unitario 2',       type: 'text',     required: false },
        { name: 'subtotal2',        label: 'Subtotal 2',              type: 'text',     required: false },
        { name: 'item3',            label: 'Ítem 3',                  type: 'text',     required: false },
        { name: 'cant3',            label: 'Cantidad 3',              type: 'number',   required: false },
        { name: 'precio3',          label: 'Precio unitario 3',       type: 'text',     required: false },
        { name: 'subtotal3',        label: 'Subtotal 3',              type: 'text',     required: false },
        { name: 'item4',            label: 'Ítem 4 (opcional)',       type: 'text',     required: false },
        { name: 'cant4',            label: 'Cantidad 4 (opcional)',   type: 'number',   required: false },
        { name: 'precio4',          label: 'Precio unitario 4',       type: 'text',     required: false },
        { name: 'subtotal4',        label: 'Subtotal 4',              type: 'text',     required: false },
        { name: 'total_estimado',   label: 'Total estimado',          type: 'text',     required: true },
        { name: 'justificacion',    label: 'Justificación',           type: 'textarea', required: true },
      ]},
      createdById: admin.id, isActive: true,
    },
  ];

  for (const templateData of templates) {
    await prisma.documentTemplate.upsert({
      where: { name: templateData.name },
      update: {
        categoryId: templateData.categoryId ?? null,
        documentTypeId: (templateData as any).documentTypeId ?? null,
      },
      create: templateData as any,
    });
  }

  console.log(`✅ ${templates.length} plantillas de documentos creadas\n`);

  // ============================================================
  // WORKFLOW TEMPLATES
  // ============================================================
  console.log('🔄 Creando plantillas de workflow...');

  // (catPlanificaciones, catActas, catConstancias, catFinancieros already declared above)

  // 1. Aprobación Académica
  await prisma.workflowTemplate.upsert({
    where: { name: 'Aprobación Académica' },
    update: {
      sections: { set: [{ id: sectionAcademica.id }] },
      categoryId: null,
      allowedInitiatorRoles: ['profesor', 'coordinador', 'vicerrector'],
    },
    create: {
      name: 'Aprobación Académica',
      description: 'Flujo de aprobación para documentos académicos: Coordinador → Rector',
      sections: { connect: [{ id: sectionAcademica.id }] },
      allowedInitiatorRoles: ['profesor', 'coordinador', 'vicerrector'],
      stateDefinitions: [
        { state: 'Revisión del Coordinador', role: 'coordinador', order: 1 },
        { state: 'Aprobación del Rector',    role: 'rector',      order: 2 },
      ],
      autoAssign: true,
      requiresComment: false,
      isActive: true,
    },
  });

  // 2. Revisión de Planificación
  await prisma.workflowTemplate.upsert({
    where: { name: 'Revisión de Planificación' },
    update: {
      sections: { set: [{ id: sectionAcademica.id }] },
      categoryId: catPlanificaciones?.id ?? null,
      allowedInitiatorRoles: ['profesor'],
    },
    create: {
      name: 'Revisión de Planificación',
      description: 'Flujo corto para planificaciones de clase: Profesor inicia, Coordinador aprueba',
      sections: { connect: [{ id: sectionAcademica.id }] },
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

  // 3. Aprobación Administrativa
  await prisma.workflowTemplate.upsert({
    where: { name: 'Aprobación Administrativa' },
    update: {
      sections: { set: [{ id: sectionAdministrativa.id }] },
      categoryId: null,
      allowedInitiatorRoles: ['profesor', 'coordinador', 'secretario', 'rector', 'vicerrector'],
    },
    create: {
      name: 'Aprobación Administrativa',
      description: 'Flujo de aprobación para documentos administrativos: Rector aprueba',
      sections: { connect: [{ id: sectionAdministrativa.id }] },
      allowedInitiatorRoles: ['profesor', 'coordinador', 'secretario', 'rector', 'vicerrector'],
      stateDefinitions: [
        { state: 'Aprobación del Rector', role: 'rector', order: 1 },
      ],
      autoAssign: true,
      requiresComment: true,
      isActive: true,
    },
  });

  // 4. Revisión de Acta
  await prisma.workflowTemplate.upsert({
    where: { name: 'Revisión de Acta' },
    update: {
      sections: { set: [{ id: sectionAdministrativa.id }] },
      categoryId: catActas?.id ?? null,
      allowedInitiatorRoles: ['coordinador', 'secretario', 'vicerrector'],
    },
    create: {
      name: 'Revisión de Acta',
      description: 'Flujo específico para actas de reuniones: Coordinador/Secretario inicia, Rector aprueba',
      sections: { connect: [{ id: sectionAdministrativa.id }] },
      categoryId: catActas?.id ?? null,
      allowedInitiatorRoles: ['coordinador', 'secretario', 'vicerrector'],
      stateDefinitions: [
        { state: 'Aprobación del Rector', role: 'rector', order: 1 },
      ],
      autoAssign: true,
      requiresComment: true,
      isActive: true,
    },
  });

  // 5. Emisión de Constancia
  await prisma.workflowTemplate.upsert({
    where: { name: 'Emisión de Constancia' },
    update: {
      sections: { set: [{ id: sectionAdministrativa.id }] },
      categoryId: catConstancias?.id ?? null,
      allowedInitiatorRoles: ['secretario'],
    },
    create: {
      name: 'Emisión de Constancia',
      description: 'Flujo para constancias y certificados: Secretaria inicia, Rector firma',
      sections: { connect: [{ id: sectionAdministrativa.id }] },
      categoryId: catConstancias?.id ?? null,
      allowedInitiatorRoles: ['secretario'],
      stateDefinitions: [
        { state: 'Firma del Rector', role: 'rector', order: 1 },
      ],
      autoAssign: true,
      requiresComment: false,
      isActive: true,
    },
  });

  // 6. Aprobación Institucional
  await prisma.workflowTemplate.upsert({
    where: { name: 'Aprobación Institucional' },
    update: {
      sections: { set: [{ id: sectionInstitucional.id }] },
      categoryId: null,
      allowedInitiatorRoles: ['rector', 'vicerrector'],
    },
    create: {
      name: 'Aprobación Institucional',
      description: 'Flujo para documentos legales e institucionales: Rector revisa y aprueba',
      sections: { connect: [{ id: sectionInstitucional.id }] },
      allowedInitiatorRoles: ['rector', 'vicerrector'],
      stateDefinitions: [
        { state: 'Revisión del Rector', role: 'rector', order: 1 },
      ],
      autoAssign: true,
      requiresComment: true,
      isActive: true,
    },
  });

  // 7. Revisión Financiera
  await prisma.workflowTemplate.upsert({
    where: { name: 'Revisión Financiera' },
    update: {
      sections: { set: [{ id: sectionInstitucional.id }] },
      categoryId: catFinancieros?.id ?? null,
      allowedInitiatorRoles: ['secretario', 'rector'],
    },
    create: {
      name: 'Revisión Financiera',
      description: 'Flujo para documentos financieros: Secretaria/Rector inicia, Rector aprueba',
      sections: { connect: [{ id: sectionInstitucional.id }] },
      categoryId: catFinancieros?.id ?? null,
      allowedInitiatorRoles: ['secretario', 'rector'],
      stateDefinitions: [
        { state: 'Revisión del Rector', role: 'rector', order: 1 },
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
