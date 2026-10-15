import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../src/auth/role.enum';

const prisma = new PrismaClient();

const users = [
  ['admin@colegio.edu', 'Anderson Cuarán', UserRole.ADMIN, 'Administrador del Sistema'],
  ['rector@colegio.edu', 'María Elena Rodríguez', UserRole.RECTOR, 'Rectora General'],
  ['vicerrector@colegio.edu', 'Lucía Fernanda Castillo', UserRole.VICERRECTOR, 'Vicerrectora'],
  ['coord.primaria@colegio.edu', 'Ana Gabriela López', UserRole.COORDINADOR, 'Coordinadora de Primaria'],
  ['coord.secundaria@colegio.edu', 'Roberto Alejandro Méndez', UserRole.COORDINADOR, 'Coordinador de Secundaria'],
  ['secretaria@colegio.edu', 'Patricia Isabel Hernández', UserRole.SECRETARIO, 'Secretaria Académica'],
  ['maestro.1p@colegio.edu', 'Juan Manuel Suárez', UserRole.PROFESOR, 'Maestra de 1° Grado'],
  ['maestro.2p@colegio.edu', 'Sofía Andrea Ruiz', UserRole.PROFESOR, 'Maestra de 2° Grado'],
  ['maestro.3p@colegio.edu', 'Diego Ernesto Vargas', UserRole.PROFESOR, 'Maestro de 3° Grado'],
  ['maestro.4p@colegio.edu', 'Laura Beatriz Morales', UserRole.PROFESOR, 'Maestra de 4° Grado'],
  ['maestro.5p@colegio.edu', 'Pablo Alberto Jiménez', UserRole.PROFESOR, 'Maestro de 5° Grado'],
  ['maestro.6p@colegio.edu', 'Natalia Cecilia Ortega', UserRole.PROFESOR, 'Maestra de 6° Grado'],
  ['maestro.7p@colegio.edu', 'Fernando José Castro', UserRole.PROFESOR, 'Maestro de 7° Grado'],
  ['prof.matematica@colegio.edu', 'Ricardo Andrés Torres', UserRole.PROFESOR, 'Profesor de Matemática'],
  ['prof.lengua@colegio.edu', 'Valentina Isabel Reyes', UserRole.PROFESOR, 'Profesora de Lengua y Literatura'],
  ['prof.historia@colegio.edu', 'Marcelo Fabián Sosa', UserRole.PROFESOR, 'Profesor de Historia'],
  ['prof.cs.sociales@colegio.edu', 'Elena Patricia Rojas', UserRole.PROFESOR, 'Profesora de Geografía y Filosofía'],
  ['prof.biologia@colegio.edu', 'Adrián Gustavo Pérez', UserRole.PROFESOR, 'Profesor de Cs. Naturales y Biología'],
  ['prof.fisica@colegio.edu', 'Claudia Fernanda Núñez', UserRole.PROFESOR, 'Profesora de Física'],
  ['prof.quimica@colegio.edu', 'Sebastián Horacio Vega', UserRole.PROFESOR, 'Profesor de Química'],
  ['prof.ingles@colegio.edu', 'Jennifer Michelle Roberts', UserRole.PROFESOR, 'Profesora de Inglés'],
  ['prof.ed.fisica@colegio.edu', 'Maximiliano Darío Flores', UserRole.PROFESOR, 'Profesor de Educación Física'],
  ['prof.arte@colegio.edu', 'Verónica Liliana Castro', UserRole.PROFESOR, 'Profesora de Arte e Informática'],
] as const;

const categoryData = [
  ['General', 'Categoría predeterminada para documentos subidos', '#64748b', 'Folder', false, [], 'GEN'],
  ['Planificaciones', 'Planificaciones de clase, proyectos pedagógicos y programas', '#2563eb', 'CalendarDays', true, ['profesor', 'coordinador'], 'PLN'],
  ['Actas y Reuniones', 'Actas de reuniones, consejos de docentes y asambleas', '#7c3aed', 'Users', false, ['coordinador', 'secretario', 'rector', 'vicerrector', 'admin'], 'ACT'],
  ['Constancias y Certificados', 'Constancias de estudio, trabajo, buena conducta y certificados', '#059669', 'Award', false, ['secretario', 'rector', 'vicerrector', 'admin'], 'CST'],
  ['Informes Académicos', 'Boletines, informes de rendimiento y evaluaciones', '#dc2626', 'BarChart3', false, ['profesor', 'coordinador', 'rector', 'vicerrector'], 'INF'],
  ['Administrativos', 'Memorándums, circulares, solicitudes y comunicaciones oficiales', '#d97706', 'FolderKanban', false, ['profesor', 'coordinador', 'secretario', 'rector', 'vicerrector', 'admin'], 'ADMD'],
  ['Legales', 'Contratos, reglamentos internos y documentos normativos', '#0891b2', 'Scale', false, ['rector', 'admin'], 'LEG'],
  ['Financieros', 'Presupuestos, facturas, nóminas e informes financieros', '#16a34a', 'DollarSign', false, ['secretario', 'rector', 'admin'], 'FIN'],
] as const;

const documentTypeData = [
  ['Planificación Semanal', 'Planificaciones'], ['Proyecto Pedagógico', 'Planificaciones'], ['Plan de Evaluación', 'Planificaciones'],
  ['Acta de Reunión', 'Actas y Reuniones'], ['Acta de Consejo', 'Actas y Reuniones'], ['Acta de Compromiso', 'Actas y Reuniones'],
  ['Constancia de Estudios', 'Constancias y Certificados'], ['Constancia de Conducta', 'Constancias y Certificados'], ['Certificado', 'Constancias y Certificados'],
  ['Informe de Rendimiento', 'Informes Académicos'], ['Informe de Grupo', 'Informes Académicos'], ['Boletín de Calificaciones', 'Informes Académicos'],
  ['Memorando', 'Administrativos'], ['Circular', 'Administrativos'], ['Comunicado', 'Administrativos'], ['Solicitud de Permiso', 'Administrativos'], ['Reporte de Incidencia', 'Administrativos'], ['Oficio', 'Administrativos'],
  ['Contrato de Inscripción', 'Legales'], ['Recibo de Pago', 'Financieros'], ['Presupuesto de Actividad', 'Financieros'],
] as const;

const templateData = [
  ['Planificación Semanal de Clase', 'Planificación Semanal', 'Planificaciones'],
  ['Proyecto Pedagógico de Aula', 'Proyecto Pedagógico', 'Planificaciones'],
  ['Plan de Evaluación Trimestral', 'Plan de Evaluación', 'Planificaciones'],
  ['Acta de Reunión de Personal', 'Acta de Reunión', 'Actas y Reuniones'],
  ['Acta de Consejo de Grado', 'Acta de Consejo', 'Actas y Reuniones'],
  ['Acta de Compromiso con Representantes', 'Acta de Compromiso', 'Actas y Reuniones'],
  ['Constancia de Estudio', 'Constancia de Estudios', 'Constancias y Certificados'],
  ['Constancia de Buena Conducta', 'Constancia de Conducta', 'Constancias y Certificados'],
  ['Certificado de Culminación de Estudios', 'Certificado', 'Constancias y Certificados'],
  ['Informe de Rendimiento Académico Individual', 'Informe de Rendimiento', 'Informes Académicos'],
  ['Informe Pedagógico de Grupo', 'Informe de Grupo', 'Informes Académicos'],
  ['Boletín de Calificaciones', 'Boletín de Calificaciones', 'Informes Académicos'],
  ['Memorándum Interno', 'Memorando', 'Administrativos'], ['Circular Informativa', 'Circular', 'Administrativos'],
  ['Comunicado a Representantes', 'Comunicado', 'Administrativos'], ['Solicitud de Permiso Laboral', 'Solicitud de Permiso', 'Administrativos'],
  ['Reporte de Incidencia Escolar', 'Reporte de Incidencia', 'Administrativos'], ['Oficio', 'Oficio', 'Administrativos'],
  ['Oficio de Designación Docente', 'Oficio', 'Administrativos'], ['Oficio de Remisión de Documentos', 'Oficio', 'Administrativos'],
  ['Contrato de Inscripción Estudiantil', 'Contrato de Inscripción', 'Legales'],
  ['Recibo de Pago de Aranceles', 'Recibo de Pago', 'Financieros'], ['Presupuesto de Actividad Escolar', 'Presupuesto de Actividad', 'Financieros'],
] as const;

const catalogRoles = Object.values(UserRole).map((key) => ({
  key,
  label: key.charAt(0).toUpperCase() + key.slice(1),
  legacyRole: key,
  isSystem: true,
}));

const catalogPermissions = [
  ['users.manage', 'Gestionar usuarios'],
  ['categories.manage', 'Gestionar categorías'],
  ['document-types.manage', 'Gestionar tipos de documento'],
  ['templates.manage', 'Gestionar plantillas'],
  ['roles.manage', 'Gestionar roles y permisos'],
  ['workflow.templates.manage', 'Gestionar plantillas de workflow'],
  ['workflow.view', 'Consultar workflows'],
  ['workflow.start', 'Iniciar workflows'],
  ['workflow.submit', 'Enviar documentos en workflows'],
  ['workflow.approve', 'Aprobar etapas de workflow'],
  ['workflow.request_changes', 'Solicitar cambios en workflows'],
  ['workflow.reject', 'Rechazar workflows'],
  ['workflow.cancel', 'Cancelar workflows'],
  ['workflow.assignments.manage', 'Administrar asignaciones de workflow'],
] as const;

async function main() {
  const password = await bcrypt.hash('Demo123!', 10);
  const createdUsers: Record<string, string> = {};

  for (const [email, name, role, position] of users) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, role, position },
      create: { email, password, name, role, position },
      select: { id: true, email: true },
    });
    createdUsers[user.email] = user.id;
  }

  const roles: Record<string, number> = {};
  for (const role of catalogRoles) {
    const savedRole = await prisma.role.upsert({
      where: { key: role.key },
      update: { label: role.label, legacyRole: role.legacyRole, isActive: true, isSystem: role.isSystem },
      create: role,
      select: { id: true, key: true },
    });
    roles[savedRole.key] = savedRole.id;
  }

  const permissions: Record<string, number> = {};
  for (const [key, label] of catalogPermissions) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { label, isActive: true },
      create: { key, label },
      select: { id: true, key: true },
    });
    permissions[permission.key] = permission.id;
  }

  for (const [email, , role] of users) {
    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: createdUsers[email], roleId: roles[role] } },
      update: {},
      create: { userId: createdUsers[email], roleId: roles[role] },
    });
  }

  for (const permissionId of Object.values(permissions)) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: roles[UserRole.ADMIN], permissionId } },
      update: {},
      create: { roleId: roles[UserRole.ADMIN], permissionId },
    });
  }

  const workflowApproverPermissions = [
    'workflow.view',
    'workflow.approve',
    'workflow.request_changes',
    'workflow.reject',
  ];
  for (const roleKey of [UserRole.RECTOR, UserRole.COORDINADOR]) {
    for (const permissionKey of workflowApproverPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: roles[roleKey], permissionId: permissions[permissionKey] },
        },
        update: {},
        create: { roleId: roles[roleKey], permissionId: permissions[permissionKey] },
      });
    }
  }

  const categories: Record<string, number> = {};
  for (const [name, description, color, icon, requiresCourse, allowedRoles, prefix] of categoryData) {
    const category = await prisma.category.upsert({
      where: { name },
      update: { description, color, icon, requiresCourse, allowedRoles, prefix, bypassAcademicYear: ['Legales', 'Financieros'].includes(name) },
      create: { name, description, color, icon, requiresCourse, allowedRoles, prefix, bypassAcademicYear: ['Legales', 'Financieros'].includes(name) },
      select: { id: true, name: true },
    });
    categories[category.name] = category.id;
  }

  const documentTypes: Record<string, number> = {};
  for (const [name, categoryName] of documentTypeData) {
    const documentType = await prisma.documentType.upsert({
      where: { name_categoryId: { name, categoryId: categories[categoryName] } },
      update: { isActive: true },
      create: { name, categoryId: categories[categoryName], isActive: true },
      select: { id: true, name: true },
    });
    documentTypes[documentType.name] = documentType.id;
  }

  await prisma.academicYear.upsert({
    where: { name: '2025-2026' },
    update: { isCurrent: true, isActive: true },
    create: { name: '2025-2026', startDate: new Date('2025-03-01'), endDate: new Date('2026-02-28'), isCurrent: true, isActive: true },
  });

  const adminId = createdUsers['admin@colegio.edu'];
  for (const [name, documentTypeName, categoryName] of templateData) {
    await prisma.documentTemplate.upsert({
      where: { name },
      update: { categoryId: categories[categoryName], documentTypeId: documentTypes[documentTypeName], isActive: true },
      create: {
        name,
        categoryId: categories[categoryName],
        documentTypeId: documentTypes[documentTypeName],
        description: `Plantilla de ${name}`,
        fields: { fields: [] },
        htmlTemplate: `<html><body><h1>${name}</h1></body></html>`,
        isActive: true,
        isPredefined: true,
        createdById: adminId,
      },
    });
  }

  console.log(`Seed complete: ${users.length} users, ${categoryData.length} categories, ${documentTypeData.length} document types, ${templateData.length} document templates.`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
