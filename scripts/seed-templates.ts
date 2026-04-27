import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Usuario del sistema para plantillas predefinidas
const SYSTEM_USER_EMAIL = 'admin@sistema.com';

// Plantillas educativas predefinidas
const predefinedTemplates = [
  // ===== ACADÉMICO =====
  {
    name: 'Certificado de Estudios',
    type: 'certificado',
    category: 'academic',
    description: 'Certificado oficial de estudios realizados por el estudiante',
    isPredefined: true,
    fields: [
      { name: 'studentName', label: 'Nombre del Estudiante', type: 'text', required: true },
      { name: 'studentId', label: 'ID del Estudiante', type: 'text', required: true },
      { name: 'courseName', label: 'Nombre del Curso', type: 'text', required: true },
      { name: 'period', label: 'Período', type: 'text', required: true },
      { name: 'grade', label: 'Calificación Final', type: 'number', required: true },
      { name: 'issueDate', label: 'Fecha de Emisión', type: 'date', required: true },
    ],
    htmlTemplate: `
      <div style="text-align: center; padding: 40px;">
        <h1 style="color: #2563eb;">CERTIFICADO DE ESTUDIOS</h1>
        <div style="margin: 40px 0; text-align: center;">
          <p style="font-size: 18px;">Se certifica que</p>
          <h2 style="margin: 20px 0; color: #1e40af;">{{studentName}}</h2>
          <p style="font-size: 16px;">ID: {{studentId}}</p>
          <p style="font-size: 16px; margin-top: 30px;">
            Ha cursado y aprobado satisfactoriamente el curso de:
          </p>
          <h3 style="margin: 20px 0;">{{courseName}}</h3>
          <p style="font-size: 16px;">Período: {{period}}</p>
          <p style="font-size: 16px;">Calificación Final: <strong>{{grade}}</strong></p>
          <p style="margin-top: 50px; font-size: 14px;">Fecha de Emisión: {{issueDate}}</p>
          <div style="margin-top: 80px; border-top: 2px solid #000; width: 300px; margin-left: auto; margin-right: auto;">
            <p>Firma del Director</p>
          </div>
        </div>
      </div>
    `,
    variableSchema: {
      type: 'object',
      required: ['studentName', 'studentId', 'courseName', 'period', 'grade', 'issueDate'],
      properties: {
        studentName: { type: 'string', minLength: 1 },
        studentId: { type: 'string', minLength: 1 },
        courseName: { type: 'string', minLength: 1 },
        period: { type: 'string', minLength: 1 },
        grade: { type: 'number', minimum: 0, maximum: 100 },
        issueDate: { type: 'string', format: 'date' },
      },
    },
  },
  {
    name: 'Boleta de Calificaciones',
    type: 'boleta',
    category: 'academic',
    description: 'Reporte de calificaciones del estudiante por período',
    isPredefined: true,
    fields: [
      { name: 'studentName', label: 'Nombre del Estudiante', type: 'text', required: true },
      { name: 'grade', label: 'Grado/Curso', type: 'text', required: true },
      { name: 'period', label: 'Período', type: 'text', required: true },
      { name: 'subjects', label: 'Materias y Calificaciones (JSON)', type: 'textarea', required: true },
      { name: 'average', label: 'Promedio General', type: 'number', required: true },
    ],
    htmlTemplate: `
      <div style="padding: 30px;">
        <h2 style="text-align: center; color: #2563eb;">BOLETA DE CALIFICACIONES</h2>
        <div style="margin: 20px 0;">
          <p><strong>Estudiante:</strong> {{studentName}}</p>
          <p><strong>Grado:</strong> {{grade}}</p>
          <p><strong>Período:</strong> {{period}}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 30px 0;">
          <thead>
            <tr style="background-color: #dbeafe; border-bottom: 2px solid #2563eb;">
              <th style="padding: 10px; text-align: left;">Materia</th>
              <th style="padding: 10px; text-align: center;">Calificación</th>
            </tr>
          </thead>
          <tbody>
            {{#each subjects}}
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px;">{{this.name}}</td>
              <td style="padding: 10px; text-align: center;">{{this.score}}</td>
            </tr>
            {{/each}}
          </tbody>
        </table>
        <div style="text-align: right; font-size: 18px; margin-top: 30px;">
          <strong>Promedio General: {{average}}</strong>
        </div>
      </div>
    `,
    variableSchema: {
      type: 'object',
      required: ['studentName', 'grade', 'period', 'subjects', 'average'],
      properties: {
        studentName: { type: 'string', minLength: 1 },
        grade: { type: 'string', minLength: 1 },
        period: { type: 'string', minLength: 1 },
        subjects: { type: 'array', items: { type: 'object' } },
        average: { type: 'number', minimum: 0, maximum: 100 },
      },
    },
  },
  {
    name: 'Constancia de Inscripción',
    type: 'constancia',
    category: 'academic',
    description: 'Constancia oficial de inscripción del estudiante',
    isPredefined: true,
    fields: [
      { name: 'studentName', label: 'Nombre del Estudiante', type: 'text', required: true },
      { name: 'studentId', label: 'ID del Estudiante', type: 'text', required: true },
      { name: 'courseName', label: 'Curso/Grado', type: 'text', required: true },
      { name: 'enrollmentDate', label: 'Fecha de Inscripción', type: 'date', required: true },
      { name: 'academicYear', label: 'Año Académico', type: 'text', required: true },
    ],
    htmlTemplate: `
      <div style="padding: 40px;">
        <h2 style="text-align: center; color: #2563eb;">CONSTANCIA DE INSCRIPCIÓN</h2>
        <p style="margin: 40px 0; text-align: justify; line-height: 1.8;">
          Por medio de la presente se hace constar que el/la estudiante
          <strong>{{studentName}}</strong> con número de identificación
          <strong>{{studentId}}</strong>, se encuentra debidamente inscrito/a en
          <strong>{{courseName}}</strong> para el año académico <strong>{{academicYear}}</strong>.
        </p>
        <p style="margin: 30px 0;">
          Fecha de inscripción: <strong>{{enrollmentDate}}</strong>
        </p>
        <p style="margin: 50px 0;">
          Se expide la presente constancia a petición del interesado/a para los fines que estime conveniente.
        </p>
        <div style="margin-top: 100px; text-align: center;">
          <div style="border-top: 2px solid #000; width: 250px; margin: 0 auto;">
            <p style="margin-top: 10px;">Firma Autorizada</p>
          </div>
        </div>
      </div>
    `,
    variableSchema: {
      type: 'object',
      required: ['studentName', 'studentId', 'courseName', 'enrollmentDate', 'academicYear'],
      properties: {
        studentName: { type: 'string', minLength: 1 },
        studentId: { type: 'string', minLength: 1 },
        courseName: { type: 'string', minLength: 1 },
        enrollmentDate: { type: 'string', format: 'date' },
        academicYear: { type: 'string', minLength: 1 },
      },
    },
  },
  {
    name: 'Plan de Clase',
    type: 'planificacion',
    category: 'academic',
    description: 'Planificación detallada de una clase o unidad didáctica',
    isPredefined: true,
    fields: [
      { name: 'subject', label: 'Materia', type: 'text', required: true },
      { name: 'grade', label: 'Grado/Curso', type: 'text', required: true },
      { name: 'topic', label: 'Tema', type: 'text', required: true },
      { name: 'objectives', label: 'Objetivos', type: 'textarea', required: true },
      { name: 'activities', label: 'Actividades', type: 'textarea', required: true },
      { name: 'resources', label: 'Recursos', type: 'textarea', required: true },
      { name: 'evaluation', label: 'Evaluación', type: 'textarea', required: true },
      { name: 'teacherName', label: 'Nombre del Docente', type: 'text', required: true },
      { name: 'date', label: 'Fecha', type: 'date', required: true },
    ],
    htmlTemplate: `
      <div style="padding: 30px;">
        <h2 style="text-align: center; color: #2563eb;">PLAN DE CLASE</h2>
        <div style="margin: 20px 0;">
          <p><strong>Materia:</strong> {{subject}}</p>
          <p><strong>Grado:</strong> {{grade}}</p>
          <p><strong>Tema:</strong> {{topic}}</p>
          <p><strong>Docente:</strong> {{teacherName}}</p>
          <p><strong>Fecha:</strong> {{date}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Objetivos:</h3>
          <p style="white-space: pre-wrap;">{{objectives}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Actividades:</h3>
          <p style="white-space: pre-wrap;">{{activities}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Recursos:</h3>
          <p style="white-space: pre-wrap;">{{resources}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Evaluación:</h3>
          <p style="white-space: pre-wrap;">{{evaluation}}</p>
        </div>
      </div>
    `,
    variableSchema: {
      type: 'object',
      required: ['subject', 'grade', 'topic', 'objectives', 'activities', 'resources', 'evaluation', 'teacherName', 'date'],
      properties: {
        subject: { type: 'string', minLength: 1 },
        grade: { type: 'string', minLength: 1 },
        topic: { type: 'string', minLength: 1 },
        objectives: { type: 'string', minLength: 1 },
        activities: { type: 'string', minLength: 1 },
        resources: { type: 'string', minLength: 1 },
        evaluation: { type: 'string', minLength: 1 },
        teacherName: { type: 'string', minLength: 1 },
        date: { type: 'string', format: 'date' },
      },
    },
  },
  {
    name: 'Informe Académico',
    type: 'informe',
    category: 'academic',
    description: 'Informe detallado sobre el desempeño académico del estudiante',
    isPredefined: true,
    fields: [
      { name: 'studentName', label: 'Nombre del Estudiante', type: 'text', required: true },
      { name: 'grade', label: 'Grado/Curso', type: 'text', required: true },
      { name: 'period', label: 'Período', type: 'text', required: true },
      { name: 'performance', label: 'Desempeño General', type: 'textarea', required: true },
      { name: 'strengths', label: 'Fortalezas', type: 'textarea', required: true },
      { name: 'improvements', label: 'Áreas de Mejora', type: 'textarea', required: true },
      { name: 'recommendations', label: 'Recomendaciones', type: 'textarea', required: true },
      { name: 'teacherName', label: 'Nombre del Docente', type: 'text', required: true },
    ],
    htmlTemplate: `
      <div style="padding: 30px;">
        <h2 style="text-align: center; color: #2563eb;">INFORME ACADÉMICO</h2>
        <div style="margin: 20px 0;">
          <p><strong>Estudiante:</strong> {{studentName}}</p>
          <p><strong>Grado:</strong> {{grade}}</p>
          <p><strong>Período:</strong> {{period}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Desempeño General:</h3>
          <p style="white-space: pre-wrap; text-align: justify;">{{performance}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #16a34a;">Fortalezas:</h3>
          <p style="white-space: pre-wrap; text-align: justify;">{{strengths}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #dc2626;">Áreas de Mejora:</h3>
          <p style="white-space: pre-wrap; text-align: justify;">{{improvements}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Recomendaciones:</h3>
          <p style="white-space: pre-wrap; text-align: justify;">{{recommendations}}</p>
        </div>
        <div style="margin-top: 60px;">
          <p><strong>Docente:</strong> {{teacherName}}</p>
          <div style="margin-top: 40px; border-top: 2px solid #000; width: 250px;">
            <p style="margin-top: 10px;">Firma</p>
          </div>
        </div>
      </div>
    `,
    variableSchema: {
      type: 'object',
      required: ['studentName', 'grade', 'period', 'performance', 'strengths', 'improvements', 'recommendations', 'teacherName'],
      properties: {
        studentName: { type: 'string', minLength: 1 },
        grade: { type: 'string', minLength: 1 },
        period: { type: 'string', minLength: 1 },
        performance: { type: 'string', minLength: 1 },
        strengths: { type: 'string', minLength: 1 },
        improvements: { type: 'string', minLength: 1 },
        recommendations: { type: 'string', minLength: 1 },
        teacherName: { type: 'string', minLength: 1 },
      },
    },
  },
  {
    name: 'Diploma de Graduación',
    type: 'diploma',
    category: 'academic',
    description: 'Diploma oficial de graduación del estudiante',
    isPredefined: true,
    fields: [
      { name: 'studentName', label: 'Nombre del Estudiante', type: 'text', required: true },
      { name: 'degree', label: 'Grado/Título Obtenido', type: 'text', required: true },
      { name: 'graduationDate', label: 'Fecha de Graduación', type: 'date', required: true },
      { name: 'honors', label: 'Honores/Mención (opcional)', type: 'text', required: false },
    ],
    htmlTemplate: `
      <div style="text-align: center; padding: 60px; border: 10px double #2563eb;">
        <h1 style="font-size: 36px; color: #1e40af; margin-bottom: 30px;">DIPLOMA</h1>
        <div style="margin: 40px 0;">
          <p style="font-size: 18px;">Se otorga el presente diploma a</p>
          <h2 style="font-size: 32px; margin: 30px 0; color: #2563eb;">{{studentName}}</h2>
          <p style="font-size: 18px; margin: 30px 0;">
            Por haber completado satisfactoriamente todos los requisitos académicos para obtener el grado de
          </p>
          <h3 style="font-size: 24px; margin: 30px 0;">{{degree}}</h3>
          {{#if honors}}
          <p style="font-size: 16px; color: #16a34a; margin: 20px 0;">
            <em>{{honors}}</em>
          </p>
          {{/if}}
          <p style="margin-top: 50px; font-size: 16px;">
            Otorgado el día {{graduationDate}}
          </p>
          <div style="margin-top: 80px; display: flex; justify-content: space-around;">
            <div style="border-top: 2px solid #000; width: 200px; padding-top: 10px;">
              <p>Director</p>
            </div>
            <div style="border-top: 2px solid #000; width: 200px; padding-top: 10px;">
              <p>Secretario Académico</p>
            </div>
          </div>
        </div>
      </div>
    `,
    variableSchema: {
      type: 'object',
      required: ['studentName', 'degree', 'graduationDate'],
      properties: {
        studentName: { type: 'string', minLength: 1 },
        degree: { type: 'string', minLength: 1 },
        graduationDate: { type: 'string', format: 'date' },
        honors: { type: 'string' },
      },
    },
  },

  // ===== ADMINISTRATIVO =====
  {
    name: 'Acta de Reunión',
    type: 'acta',
    category: 'administrative',
    description: 'Registro oficial de reuniones institucionales',
    isPredefined: true,
    fields: [
      { name: 'meetingTitle', label: 'Título de la Reunión', type: 'text', required: true },
      { name: 'date', label: 'Fecha', type: 'date', required: true },
      { name: 'time', label: 'Hora', type: 'time', required: true },
      { name: 'location', label: 'Lugar', type: 'text', required: true },
      { name: 'attendees', label: 'Asistentes', type: 'textarea', required: true },
      { name: 'agenda', label: 'Agenda', type: 'textarea', required: true },
      { name: 'discussions', label: 'Discusiones y Acuerdos', type: 'textarea', required: true },
      { name: 'nextSteps', label: 'Próximos Pasos', type: 'textarea', required: true },
      { name: 'secretary', label: 'Secretario/a', type: 'text', required: true },
    ],
    htmlTemplate: `
      <div style="padding: 30px;">
        <h2 style="text-align: center; color: #2563eb;">ACTA DE REUNIÓN</h2>
        <h3 style="text-align: center; margin: 20px 0;">{{meetingTitle}}</h3>
        <div style="margin: 20px 0;">
          <p><strong>Fecha:</strong> {{date}}</p>
          <p><strong>Hora:</strong> {{time}}</p>
          <p><strong>Lugar:</strong> {{location}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Asistentes:</h3>
          <p style="white-space: pre-wrap;">{{attendees}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Agenda:</h3>
          <p style="white-space: pre-wrap;">{{agenda}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Discusiones y Acuerdos:</h3>
          <p style="white-space: pre-wrap; text-align: justify;">{{discussions}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Próximos Pasos:</h3>
          <p style="white-space: pre-wrap;">{{nextSteps}}</p>
        </div>
        <div style="margin-top: 60px;">
          <p><strong>Secretario/a:</strong> {{secretary}}</p>
          <div style="margin-top: 40px; border-top: 2px solid #000; width: 250px;">
            <p style="margin-top: 10px;">Firma</p>
          </div>
        </div>
      </div>
    `,
    variableSchema: {
      type: 'object',
      required: ['meetingTitle', 'date', 'time', 'location', 'attendees', 'agenda', 'discussions', 'nextSteps', 'secretary'],
      properties: {
        meetingTitle: { type: 'string', minLength: 1 },
        date: { type: 'string', format: 'date' },
        time: { type: 'string' },
        location: { type: 'string', minLength: 1 },
        attendees: { type: 'string', minLength: 1 },
        agenda: { type: 'string', minLength: 1 },
        discussions: { type: 'string', minLength: 1 },
        nextSteps: { type: 'string', minLength: 1 },
        secretary: { type: 'string', minLength: 1 },
      },
    },
  },
  {
    name: 'Permiso Escolar',
    type: 'permiso',
    category: 'administrative',
    description: 'Solicitud de permiso o autorización escolar',
    isPredefined: true,
    fields: [
      { name: 'studentName', label: 'Nombre del Estudiante', type: 'text', required: true },
      { name: 'grade', label: 'Grado/Curso', type: 'text', required: true },
      { name: 'parentName', label: 'Nombre del Padre/Tutor', type: 'text', required: true },
      { name: 'permissionType', label: 'Tipo de Permiso', type: 'text', required: true },
      { name: 'reason', label: 'Motivo', type: 'textarea', required: true },
      { name: 'dateFrom', label: 'Fecha Desde', type: 'date', required: true },
      { name: 'dateTo', label: 'Fecha Hasta', type: 'date', required: true },
      { name: 'requestDate', label: 'Fecha de Solicitud', type: 'date', required: true },
    ],
    htmlTemplate: `
      <div style="padding: 30px;">
        <h2 style="text-align: center; color: #2563eb;">PERMISO ESCOLAR</h2>
        <p style="margin: 30px 0;">Fecha de solicitud: {{requestDate}}</p>
        <p style="margin: 20px 0; text-align: justify;">
          Yo, <strong>{{parentName}}</strong>, padre/madre/tutor del estudiante
          <strong>{{studentName}}</strong> del grado <strong>{{grade}}</strong>,
          solicito permiso de <strong>{{permissionType}}</strong> por el siguiente motivo:
        </p>
        <div style="margin: 30px 0; padding: 20px; background-color: #f3f4f6; border-left: 4px solid #2563eb;">
          <p style="white-space: pre-wrap; text-align: justify;">{{reason}}</p>
        </div>
        <p style="margin: 30px 0;">
          <strong>Período solicitado:</strong> Desde {{dateFrom}} hasta {{dateTo}}
        </p>
        <div style="margin-top: 80px; display: flex; justify-content: space-between;">
          <div>
            <div style="border-top: 2px solid #000; width: 250px; padding-top: 10px;">
              <p>Firma del Padre/Tutor</p>
            </div>
          </div>
          <div>
            <div style="border-top: 2px solid #000; width: 250px; padding-top: 10px;">
              <p>Autorización Institucional</p>
            </div>
          </div>
        </div>
      </div>
    `,
    variableSchema: {
      type: 'object',
      required: ['studentName', 'grade', 'parentName', 'permissionType', 'reason', 'dateFrom', 'dateTo', 'requestDate'],
      properties: {
        studentName: { type: 'string', minLength: 1 },
        grade: { type: 'string', minLength: 1 },
        parentName: { type: 'string', minLength: 1 },
        permissionType: { type: 'string', minLength: 1 },
        reason: { type: 'string', minLength: 1 },
        dateFrom: { type: 'string', format: 'date' },
        dateTo: { type: 'string', format: 'date' },
        requestDate: { type: 'string', format: 'date' },
      },
    },
  },
  {
    name: 'Constancia de Conducta',
    type: 'constancia',
    category: 'administrative',
    description: 'Certificado de buena conducta del estudiante',
    isPredefined: true,
    fields: [
      { name: 'studentName', label: 'Nombre del Estudiante', type: 'text', required: true },
      { name: 'studentId', label: 'ID del Estudiante', type: 'text', required: true },
      { name: 'grade', label: 'Grado/Curso', type: 'text', required: true },
      { name: 'period', label: 'Período', type: 'text', required: true },
      { name: 'behavior', label: 'Descripción de Conducta', type: 'select', required: true, options: ['Excelente', 'Muy Buena', 'Buena', 'Regular'] },
      { name: 'issueDate', label: 'Fecha de Emisión', type: 'date', required: true },
    ],
    htmlTemplate: `
      <div style="padding: 40px;">
        <h2 style="text-align: center; color: #2563eb;">CONSTANCIA DE CONDUCTA</h2>
        <p style="margin: 40px 0; text-align: justify; line-height: 1.8;">
          Por medio de la presente se hace constar que el/la estudiante
          <strong>{{studentName}}</strong> con número de identificación
          <strong>{{studentId}}</strong>, del grado <strong>{{grade}}</strong>,
          durante el período <strong>{{period}}</strong> ha demostrado una conducta
          <strong style="color: #16a34a;">{{behavior}}</strong> en nuestra institución.
        </p>
        <p style="margin: 30px 0; text-align: justify;">
          El/la estudiante ha mostrado respeto hacia sus compañeros, docentes y las normas
          establecidas por la institución, siendo un ejemplo de comportamiento adecuado.
        </p>
        <p style="margin: 50px 0;">
          Se expide la presente constancia a petición del interesado/a para los fines que estime conveniente.
        </p>
        <p style="margin: 30px 0;">Fecha de emisión: <strong>{{issueDate}}</strong></p>
        <div style="margin-top: 100px; text-align: center;">
          <div style="border-top: 2px solid #000; width: 250px; margin: 0 auto;">
            <p style="margin-top: 10px;">Firma del Director</p>
          </div>
        </div>
      </div>
    `,
    variableSchema: {
      type: 'object',
      required: ['studentName', 'studentId', 'grade', 'period', 'behavior', 'issueDate'],
      properties: {
        studentName: { type: 'string', minLength: 1 },
        studentId: { type: 'string', minLength: 1 },
        grade: { type: 'string', minLength: 1 },
        period: { type: 'string', minLength: 1 },
        behavior: { type: 'string', enum: ['Excelente', 'Muy Buena', 'Buena', 'Regular'] },
        issueDate: { type: 'string', format: 'date' },
      },
    },
  },

  // ===== LEGAL/CONTRACTUAL =====
  {
    name: 'Contrato Docente',
    type: 'contrato',
    category: 'legal',
    description: 'Contrato laboral para personal docente',
    isPredefined: true,
    fields: [
      { name: 'teacherName', label: 'Nombre del Docente', type: 'text', required: true },
      { name: 'teacherId', label: 'Identificación', type: 'text', required: true },
      { name: 'position', label: 'Cargo', type: 'text', required: true },
      { name: 'startDate', label: 'Fecha de Inicio', type: 'date', required: true },
      { name: 'endDate', label: 'Fecha de Finalización', type: 'date', required: true },
      { name: 'salary', label: 'Salario', type: 'number', required: true },
      { name: 'schedule', label: 'Horario', type: 'text', required: true },
      { name: 'responsibilities', label: 'Responsabilidades', type: 'textarea', required: true },
    ],
    htmlTemplate: `
      <div style="padding: 30px; font-size: 14px;">
        <h2 style="text-align: center; color: #2563eb;">CONTRATO DE TRABAJO DOCENTE</h2>
        <p style="margin: 30px 0; text-align: justify;">
          Entre la institución educativa, en adelante "EL EMPLEADOR", y
          <strong>{{teacherName}}</strong>, identificado/a con documento
          <strong>{{teacherId}}</strong>, en adelante "EL DOCENTE", se establece el
          siguiente contrato de trabajo bajo las siguientes cláusulas:
        </p>
        <div style="margin: 20px 0;">
          <p><strong>PRIMERA:</strong> EL DOCENTE se compromete a desempeñar el cargo de
          <strong>{{position}}</strong>.</p>
        </div>
        <div style="margin: 20px 0;">
          <p><strong>SEGUNDA:</strong> El período de vigencia del presente contrato será desde
          <strong>{{startDate}}</strong> hasta <strong>{{endDate}}</strong>.</p>
        </div>
        <div style="margin: 20px 0;">
          <p><strong>TERCERA:</strong> EL EMPLEADOR se compromete a pagar a EL DOCENTE
          la suma de <strong>{{salary}}</strong> mensuales.</p>
        </div>
        <div style="margin: 20px 0;">
          <p><strong>CUARTA:</strong> El horario de trabajo será: <strong>{{schedule}}</strong>.</p>
        </div>
        <div style="margin: 20px 0;">
          <p><strong>QUINTA:</strong> Responsabilidades del cargo:</p>
          <p style="white-space: pre-wrap; margin-left: 20px;">{{responsibilities}}</p>
        </div>
        <div style="margin-top: 80px; display: flex; justify-content: space-between;">
          <div style="text-align: center;">
            <div style="border-top: 2px solid #000; width: 200px; padding-top: 10px;">
              <p>El Empleador</p>
            </div>
          </div>
          <div style="text-align: center;">
            <div style="border-top: 2px solid #000; width: 200px; padding-top: 10px;">
              <p>El Docente</p>
            </div>
          </div>
        </div>
      </div>
    `,
    variableSchema: {
      type: 'object',
      required: ['teacherName', 'teacherId', 'position', 'startDate', 'endDate', 'salary', 'schedule', 'responsibilities'],
      properties: {
        teacherName: { type: 'string', minLength: 1 },
        teacherId: { type: 'string', minLength: 1 },
        position: { type: 'string', minLength: 1 },
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' },
        salary: { type: 'number', minimum: 0 },
        schedule: { type: 'string', minLength: 1 },
        responsibilities: { type: 'string', minLength: 1 },
      },
    },
  },
  {
    name: 'Carta de Recomendación',
    type: 'carta',
    category: 'legal',
    description: 'Carta oficial de recomendación académica',
    isPredefined: true,
    fields: [
      { name: 'studentName', label: 'Nombre del Estudiante', type: 'text', required: true },
      { name: 'recommenderName', label: 'Nombre del Recomendador', type: 'text', required: true },
      { name: 'recommenderPosition', label: 'Cargo del Recomendador', type: 'text', required: true },
      { name: 'relationship', label: 'Relación con el Estudiante', type: 'text', required: true },
      { name: 'qualities', label: 'Cualidades del Estudiante', type: 'textarea', required: true },
      { name: 'achievements', label: 'Logros Destacados', type: 'textarea', required: true },
      { name: 'recommendation', label: 'Recomendación', type: 'textarea', required: true },
      { name: 'date', label: 'Fecha', type: 'date', required: true },
    ],
    htmlTemplate: `
      <div style="padding: 30px;">
        <h2 style="text-align: center; color: #2563eb;">CARTA DE RECOMENDACIÓN</h2>
        <p style="margin: 30px 0; text-align: right;">{{date}}</p>
        <p style="margin: 30px 0;">A quien corresponda:</p>
        <p style="margin: 20px 0; text-align: justify; line-height: 1.8;">
          Por medio de la presente, yo <strong>{{recommenderName}}</strong>, en mi calidad de
          <strong>{{recommenderPosition}}</strong>, tengo el agrado de recomendar ampliamente a
          <strong>{{studentName}}</strong>, a quien he tenido el privilegio de {{relationship}}.
        </p>
        <div style="margin: 30px 0;">
          <p style="font-weight: bold; margin-bottom: 10px;">Cualidades destacadas:</p>
          <p style="white-space: pre-wrap; text-align: justify;">{{qualities}}</p>
        </div>
        <div style="margin: 30px 0;">
          <p style="font-weight: bold; margin-bottom: 10px;">Logros:</p>
          <p style="white-space: pre-wrap; text-align: justify;">{{achievements}}</p>
        </div>
        <div style="margin: 30px 0;">
          <p style="white-space: pre-wrap; text-align: justify;">{{recommendation}}</p>
        </div>
        <p style="margin: 40px 0; text-align: justify;">
          Sin otro particular, me despido quedando a su entera disposición para cualquier
          información adicional que requieran.
        </p>
        <div style="margin-top: 60px;">
          <p>Atentamente,</p>
          <div style="margin-top: 40px; border-top: 2px solid #000; width: 250px;">
            <p style="margin-top: 10px;"><strong>{{recommenderName}}</strong></p>
            <p>{{recommenderPosition}}</p>
          </div>
        </div>
      </div>
    `,
    variableSchema: {
      type: 'object',
      required: ['studentName', 'recommenderName', 'recommenderPosition', 'relationship', 'qualities', 'achievements', 'recommendation', 'date'],
      properties: {
        studentName: { type: 'string', minLength: 1 },
        recommenderName: { type: 'string', minLength: 1 },
        recommenderPosition: { type: 'string', minLength: 1 },
        relationship: { type: 'string', minLength: 1 },
        qualities: { type: 'string', minLength: 1 },
        achievements: { type: 'string', minLength: 1 },
        recommendation: { type: 'string', minLength: 1 },
        date: { type: 'string', format: 'date' },
      },
    },
  },
  {
    name: 'Solicitud de Beca',
    type: 'solicitud',
    category: 'legal',
    description: 'Formulario de solicitud de beca educativa',
    isPredefined: true,
    fields: [
      { name: 'studentName', label: 'Nombre del Estudiante', type: 'text', required: true },
      { name: 'studentId', label: 'ID del Estudiante', type: 'text', required: true },
      { name: 'grade', label: 'Grado/Curso Actual', type: 'text', required: true },
      { name: 'scholarshipType', label: 'Tipo de Beca Solicitada', type: 'text', required: true },
      { name: 'academicAverage', label: 'Promedio Académico', type: 'number', required: true },
      { name: 'familyIncome', label: 'Ingreso Familiar Mensual', type: 'number', required: true },
      { name: 'reason', label: 'Motivo de la Solicitud', type: 'textarea', required: true },
      { name: 'achievements', label: 'Logros Académicos o Extracurriculares', type: 'textarea', required: true },
      { name: 'parentName', label: 'Nombre del Padre/Tutor', type: 'text', required: true },
      { name: 'requestDate', label: 'Fecha de Solicitud', type: 'date', required: true },
    ],
    htmlTemplate: `
      <div style="padding: 30px;">
        <h2 style="text-align: center; color: #2563eb;">SOLICITUD DE BECA</h2>
        <p style="margin: 20px 0; text-align: right;">Fecha: {{requestDate}}</p>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Datos del Estudiante:</h3>
          <p><strong>Nombre:</strong> {{studentName}}</p>
          <p><strong>ID:</strong> {{studentId}}</p>
          <p><strong>Grado actual:</strong> {{grade}}</p>
          <p><strong>Promedio académico:</strong> {{academicAverage}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Datos Económicos:</h3>
          <p><strong>Ingreso familiar mensual:</strong> {{familyIncome}}</p>
          <p><strong>Tipo de beca solicitada:</strong> {{scholarshipType}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Motivo de la Solicitud:</h3>
          <p style="white-space: pre-wrap; text-align: justify;">{{reason}}</p>
        </div>
        <div style="margin: 30px 0;">
          <h3 style="color: #1e40af;">Logros y Méritos:</h3>
          <p style="white-space: pre-wrap; text-align: justify;">{{achievements}}</p>
        </div>
        <div style="margin-top: 60px;">
          <p><strong>Padre/Tutor:</strong> {{parentName}}</p>
          <div style="margin-top: 40px; border-top: 2px solid #000; width: 250px;">
            <p style="margin-top: 10px;">Firma del Solicitante</p>
          </div>
        </div>
      </div>
    `,
    variableSchema: {
      type: 'object',
      required: ['studentName', 'studentId', 'grade', 'scholarshipType', 'academicAverage', 'familyIncome', 'reason', 'achievements', 'parentName', 'requestDate'],
      properties: {
        studentName: { type: 'string', minLength: 1 },
        studentId: { type: 'string', minLength: 1 },
        grade: { type: 'string', minLength: 1 },
        scholarshipType: { type: 'string', minLength: 1 },
        academicAverage: { type: 'number', minimum: 0, maximum: 100 },
        familyIncome: { type: 'number', minimum: 0 },
        reason: { type: 'string', minLength: 1 },
        achievements: { type: 'string', minLength: 1 },
        parentName: { type: 'string', minLength: 1 },
        requestDate: { type: 'string', format: 'date' },
      },
    },
  },
];

async function main() {
  console.log('🌱 Seeding predefined educational templates...');

  // Buscar o crear usuario del sistema
  let systemUser = await prisma.user.findUnique({
    where: { email: SYSTEM_USER_EMAIL },
  });

  if (!systemUser) {
    console.log('⚠️  System user not found, creating one...');
    systemUser = await prisma.user.create({
      data: {
        email: SYSTEM_USER_EMAIL,
        password: 'hashed_password', // This should be properly hashed
        name: 'Sistema',
        role: { connect: { name: 'admin' } },
      },
    });
    console.log('✅ System user created');
  }

  let createdCount = 0;
  let skippedCount = 0;

  for (const template of predefinedTemplates) {
    try {
      // Verificar si ya existe
      const existing = await prisma.documentTemplate.findUnique({
        where: { name: template.name },
      });

      if (existing) {
        console.log(`⏭️  Template "${template.name}" already exists, skipping...`);
        skippedCount++;
        continue;
      }

      // Crear plantilla (excluir campo 'category' string — ahora es FK categoryId)
      const { category: _cat, ...templateData } = template;
      await prisma.documentTemplate.create({
        data: {
          ...templateData,
          fields: templateData.fields,
          variableSchema: templateData.variableSchema,
          createdById: systemUser.id,
        },
      });

      console.log(`✅ Created template: ${template.name}`);
      createdCount++;
    } catch (error) {
      console.error(`❌ Error creating template "${template.name}":`, error);
    }
  }

  console.log('\n📊 Seeding Summary:');
  console.log(`   Created: ${createdCount}`);
  console.log(`   Skipped: ${skippedCount}`);
  console.log(`   Total: ${predefinedTemplates.length}`);
  console.log('\n✅ Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
