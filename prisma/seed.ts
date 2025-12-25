import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../src/auth/role.enum';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // Crear usuario ADMIN
  const hashedPassword = await bcrypt.hash('Admin123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {}, // No actualizar si ya existe
    create: {
      email: 'admin@example.com',
      password: hashedPassword,
      name: 'Administrador',
      role: UserRole.ADMIN,
    },
  });

  console.log('✅ Admin creado:', {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });

  // Opcional: Crear usuarios de ejemplo
  const user1 = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      password: await bcrypt.hash('User123!', 10),
      name: 'Usuario Normal',
      role: UserRole.USER,
    },
  });

  console.log('✅ Usuario normal creado:', {
    id: user1.id,
    email: user1.email,
    name: user1.name,
    role: user1.role,
  });

  // Crear categorías de ejemplo
  console.log('📁 Creando categorías...');

  const categories = [
    {
      name: 'Administrativos',
      description: 'Documentos administrativos y de gestión general',
      color: '#8b5cf6',
      icon: 'FolderKanban',
    },
    {
      name: 'Legales',
      description: 'Documentos legales, contratos y acuerdos',
      color: '#3b82f6',
      icon: 'Scale',
    },
    {
      name: 'Financieros',
      description: 'Facturas, presupuestos y documentos financieros',
      color: '#10b981',
      icon: 'DollarSign',
    },
    {
      name: 'RRHH',
      description: 'Recursos humanos y gestión de personal',
      color: '#f59e0b',
      icon: 'Users',
    },
    {
      name: 'Técnicos',
      description: 'Documentación técnica y manuales',
      color: '#06b6d4',
      icon: 'Code',
    },
    {
      name: 'Comerciales',
      description: 'Propuestas comerciales y cotizaciones',
      color: '#ec4899',
      icon: 'ShoppingCart',
    },
    {
      name: 'Operativos',
      description: 'Procedimientos y documentos operativos',
      color: '#f97316',
      icon: 'Settings',
    },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }

  console.log('✅ Categorías creadas:', categories.length);

  // Crear plantillas de documentos de ejemplo
  console.log('📄 Creando plantillas de documentos...');

  // Template HTML básico para todas las plantillas
  const basicHtmlTemplate = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>{{_metadata.templateName}}</title>
</head>
<body>
  <h1>{{_metadata.templateName}}</h1>
  <p><em>Generado: {{_metadata.generatedDate}} a las {{_metadata.generatedTime}}</em></p>
  <hr>

  <div style="margin: 20px 0;">
    {{#each this}}
      {{#if (isNotEqual @key '_metadata')}}
        <p><strong>{{@key}}:</strong> {{this}}</p>
      {{/if}}
    {{/each}}
  </div>
</body>
</html>`;

  const templates = [
    {
      name: 'Acta de Reunión',
      type: 'acta',
      description: 'Plantilla para registrar las actas de reuniones',
      htmlTemplate: basicHtmlTemplate,
      fields: {
        fields: [
          {
            name: 'titulo',
            label: 'Título de la reunión',
            type: 'text',
            required: true,
          },
          {
            name: 'fecha',
            label: 'Fecha de la reunión',
            type: 'date',
            required: true,
          },
          {
            name: 'hora_inicio',
            label: 'Hora de inicio',
            type: 'time',
            required: true,
          },
          {
            name: 'hora_fin',
            label: 'Hora de finalización',
            type: 'time',
            required: true,
          },
          {
            name: 'lugar',
            label: 'Lugar',
            type: 'text',
            required: true,
          },
          {
            name: 'participantes',
            label: 'Participantes',
            type: 'textarea',
            required: true,
          },
          {
            name: 'agenda',
            label: 'Agenda',
            type: 'textarea',
            required: true,
          },
          {
            name: 'desarrollo',
            label: 'Desarrollo de la reunión',
            type: 'textarea',
            required: true,
          },
          {
            name: 'acuerdos',
            label: 'Acuerdos y compromisos',
            type: 'textarea',
            required: true,
          },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Certificado de Trabajo',
      type: 'certificado',
      description: 'Plantilla para certificados de trabajo',
      htmlTemplate: basicHtmlTemplate,
      fields: {
        fields: [
          {
            name: 'nombre_empleado',
            label: 'Nombre completo del empleado',
            type: 'text',
            required: true,
          },
          {
            name: 'identificacion',
            label: 'Número de identificación',
            type: 'text',
            required: true,
          },
          {
            name: 'cargo',
            label: 'Cargo desempeñado',
            type: 'text',
            required: true,
          },
          {
            name: 'fecha_ingreso',
            label: 'Fecha de ingreso',
            type: 'date',
            required: true,
          },
          {
            name: 'fecha_retiro',
            label: 'Fecha de retiro',
            type: 'date',
            required: false,
          },
          {
            name: 'funciones',
            label: 'Funciones desempeñadas',
            type: 'textarea',
            required: true,
          },
          {
            name: 'observaciones',
            label: 'Observaciones',
            type: 'textarea',
            required: false,
          },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Informe Técnico',
      type: 'informe',
      description: 'Plantilla para informes técnicos',
      htmlTemplate: basicHtmlTemplate,
      fields: {
        fields: [
          {
            name: 'titulo',
            label: 'Título del informe',
            type: 'text',
            required: true,
          },
          {
            name: 'fecha',
            label: 'Fecha del informe',
            type: 'date',
            required: true,
          },
          {
            name: 'autor',
            label: 'Autor del informe',
            type: 'text',
            required: true,
          },
          {
            name: 'resumen_ejecutivo',
            label: 'Resumen ejecutivo',
            type: 'textarea',
            required: true,
          },
          {
            name: 'introduccion',
            label: 'Introducción',
            type: 'textarea',
            required: true,
          },
          {
            name: 'objetivo',
            label: 'Objetivo',
            type: 'textarea',
            required: true,
          },
          {
            name: 'metodologia',
            label: 'Metodología',
            type: 'textarea',
            required: true,
          },
          {
            name: 'resultados',
            label: 'Resultados',
            type: 'textarea',
            required: true,
          },
          {
            name: 'conclusiones',
            label: 'Conclusiones',
            type: 'textarea',
            required: true,
          },
          {
            name: 'recomendaciones',
            label: 'Recomendaciones',
            type: 'textarea',
            required: false,
          },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Memorándum',
      type: 'memorandum',
      description: 'Plantilla para memorándums internos',
      htmlTemplate: basicHtmlTemplate,
      fields: {
        fields: [
          {
            name: 'numero',
            label: 'Número de memorándum',
            type: 'text',
            required: true,
          },
          {
            name: 'fecha',
            label: 'Fecha',
            type: 'date',
            required: true,
          },
          {
            name: 'para',
            label: 'Para (Destinatario)',
            type: 'text',
            required: true,
          },
          {
            name: 'de',
            label: 'De (Remitente)',
            type: 'text',
            required: true,
          },
          {
            name: 'asunto',
            label: 'Asunto',
            type: 'text',
            required: true,
          },
          {
            name: 'contenido',
            label: 'Contenido del memorándum',
            type: 'textarea',
            required: true,
          },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Solicitud de Vacaciones',
      type: 'solicitud',
      description: 'Plantilla para solicitudes de vacaciones',
      htmlTemplate: basicHtmlTemplate,
      fields: {
        fields: [
          {
            name: 'nombre_empleado',
            label: 'Nombre del empleado',
            type: 'text',
            required: true,
          },
          {
            name: 'cargo',
            label: 'Cargo',
            type: 'text',
            required: true,
          },
          {
            name: 'departamento',
            label: 'Departamento',
            type: 'text',
            required: true,
          },
          {
            name: 'fecha_inicio',
            label: 'Fecha de inicio de vacaciones',
            type: 'date',
            required: true,
          },
          {
            name: 'fecha_fin',
            label: 'Fecha de fin de vacaciones',
            type: 'date',
            required: true,
          },
          {
            name: 'dias_solicitados',
            label: 'Número de días solicitados',
            type: 'number',
            required: true,
          },
          {
            name: 'observaciones',
            label: 'Observaciones',
            type: 'textarea',
            required: false,
          },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Orden de Compra',
      type: 'orden_compra',
      description: 'Plantilla para órdenes de compra',
      htmlTemplate: basicHtmlTemplate,
      fields: {
        fields: [
          {
            name: 'numero_orden',
            label: 'Número de orden',
            type: 'text',
            required: true,
          },
          {
            name: 'fecha',
            label: 'Fecha de emisión',
            type: 'date',
            required: true,
          },
          {
            name: 'proveedor',
            label: 'Proveedor',
            type: 'text',
            required: true,
          },
          {
            name: 'direccion_proveedor',
            label: 'Dirección del proveedor',
            type: 'text',
            required: true,
          },
          {
            name: 'items',
            label: 'Items a comprar (descripción, cantidad, precio)',
            type: 'textarea',
            required: true,
          },
          {
            name: 'subtotal',
            label: 'Subtotal',
            type: 'number',
            required: true,
          },
          {
            name: 'impuestos',
            label: 'Impuestos',
            type: 'number',
            required: true,
          },
          {
            name: 'total',
            label: 'Total',
            type: 'number',
            required: true,
          },
          {
            name: 'condiciones_pago',
            label: 'Condiciones de pago',
            type: 'textarea',
            required: true,
          },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Reporte de Incidentes',
      type: 'reporte',
      description: 'Plantilla para reportes de incidentes',
      htmlTemplate: basicHtmlTemplate,
      fields: {
        fields: [
          {
            name: 'numero_incidente',
            label: 'Número de incidente',
            type: 'text',
            required: true,
          },
          {
            name: 'fecha_incidente',
            label: 'Fecha del incidente',
            type: 'date',
            required: true,
          },
          {
            name: 'hora_incidente',
            label: 'Hora del incidente',
            type: 'time',
            required: true,
          },
          {
            name: 'lugar',
            label: 'Lugar del incidente',
            type: 'text',
            required: true,
          },
          {
            name: 'reportado_por',
            label: 'Reportado por',
            type: 'text',
            required: true,
          },
          {
            name: 'tipo_incidente',
            label: 'Tipo de incidente',
            type: 'text',
            required: true,
          },
          {
            name: 'descripcion',
            label: 'Descripción del incidente',
            type: 'textarea',
            required: true,
          },
          {
            name: 'personas_involucradas',
            label: 'Personas involucradas',
            type: 'textarea',
            required: false,
          },
          {
            name: 'acciones_tomadas',
            label: 'Acciones tomadas',
            type: 'textarea',
            required: true,
          },
          {
            name: 'seguimiento',
            label: 'Seguimiento requerido',
            type: 'textarea',
            required: false,
          },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
    {
      name: 'Constancia de Estudio',
      type: 'certificado',
      description: 'Plantilla para constancias de estudio',
      htmlTemplate: basicHtmlTemplate,
      fields: {
        fields: [
          {
            name: 'nombre_estudiante',
            label: 'Nombre completo del estudiante',
            type: 'text',
            required: true,
          },
          {
            name: 'identificacion',
            label: 'Número de identificación',
            type: 'text',
            required: true,
          },
          {
            name: 'programa_academico',
            label: 'Programa académico',
            type: 'text',
            required: true,
          },
          {
            name: 'nivel',
            label: 'Nivel (pregrado, posgrado, etc.)',
            type: 'text',
            required: true,
          },
          {
            name: 'semestre_actual',
            label: 'Semestre o periodo actual',
            type: 'text',
            required: true,
          },
          {
            name: 'fecha_inicio',
            label: 'Fecha de inicio de estudios',
            type: 'date',
            required: true,
          },
          {
            name: 'promedio',
            label: 'Promedio académico',
            type: 'number',
            required: false,
          },
        ],
      },
      createdById: admin.id,
      isActive: true,
    },
  ];

  for (const templateData of templates) {
    const template = await prisma.documentTemplate.upsert({
      where: {
        name: templateData.name,
      },
      update: {},
      create: templateData,
    });

    console.log(`✅ Plantilla creada: ${template.name} (${template.type})`);
  }

  console.log('🎉 Seed completado exitosamente!');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
