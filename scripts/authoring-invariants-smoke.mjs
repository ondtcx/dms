const base = process.env.AUTHORING_SMOKE_BASE_URL ?? 'http://localhost:3001/api';
const email = process.env.AUTHORING_SMOKE_EMAIL ?? 'admin@colegio.edu';
const password = process.env.AUTHORING_SMOKE_PASSWORD ?? 'Demo123!';

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} -> ${response.status}: ${
        typeof body === 'string' ? body : JSON.stringify(body)
      }`,
    );
  }
  return body;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const login = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
const auth = { Authorization: `Bearer ${login.access_token}` };

const marker = new Date().toISOString();
const fields = {
  fields: [
    { key: 'documento.asunto', label: 'Asunto', type: 'text', required: true },
    { key: 'contenido', label: 'Contenido', type: 'richtext', required: true },
    { key: 'firmante.nombre', label: 'Firmante', type: 'text', required: true },
    { key: 'firmante.cargo', label: 'Cargo', type: 'text', required: true },
  ],
};
const bodyHtml = `<div class="doc">{{> institutionHeader}}<div class="doc-title">PRUEBA DE INVARIANTES</div><div class="content"><p>{{documento.asunto}}</p>{{{contenido}}}</div><div class="signature">{{firmante.nombre}}</div></div>`;
const content = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: `Contenido ${marker}` }],
    },
  ],
};
const formData = (subject) => ({
  documento: { asunto: subject },
  contenido: content,
  firmante: { nombre: 'Firmante de prueba', cargo: 'Cargo de prueba' },
});

const template = await request('/authoring/templates', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    name: `Prueba invariantes ${marker}`,
    description: 'Plantilla temporal para invariantes de autoría',
    bodyHtml,
    numberPrefix: 'TST',
    fields,
  }),
});
const v1 = template.versions[0];
await request(`/authoring/templates/${template.id}/versions/${v1.id}/publish`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({}),
});

const pinned = await request('/authoring/documents', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    templateVersionId: v1.id,
    formData: formData(`Documento fijado a v1 ${marker}`),
  }),
});

const v2 = await request(`/authoring/templates/${template.id}/versions`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    bodyHtml: bodyHtml.replace('PRUEBA DE INVARIANTES', 'PRUEBA DE INVARIANTES V2'),
    numberPrefix: 'TST',
    fields,
  }),
});
await request(`/authoring/templates/${template.id}/versions/${v2.id}/publish`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({}),
});

const afterPublish = await request(`/authoring/documents/${pinned.id}`, { headers: auth });
assert(
  afterPublish.templateData?.templateVersion?.id === v1.id,
  'existing document was not pinned to v1 after publishing v2',
);
assert(
  afterPublish.templateData?.templateVersion?.version === 1,
  'existing document template version changed after publishing v2',
);
const pinnedPreview = await fetch(`${base}/authoring/documents/${pinned.id}/preview`, {
  headers: auth,
});
assert(pinnedPreview.ok, 'pinned document preview failed after publishing v2');

const drafts = [];
for (let index = 0; index < 2; index += 1) {
  drafts.push(
    await request('/authoring/documents', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        templateVersionId: v2.id,
        formData: formData(`Documento concurrente ${index + 1} ${marker}`),
      }),
    }),
  );
}
const emitted = await Promise.all(
  drafts.map((document) =>
    request(`/authoring/documents/${document.id}/emit`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({}),
    }),
  ),
);
const numbers = emitted.map((document) => document.documentNumber);
assert(numbers.every(Boolean), 'concurrent emission did not assign numbers');
assert(new Set(numbers).size === numbers.length, 'concurrent emission duplicated a number');
assert(
  numbers.every((number) => number.startsWith('DOC-TST-')),
  'concurrent emission did not use the template prefix',
);

const returnedDraft = await request('/authoring/documents', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    templateVersionId: v2.id,
    formData: formData(`Documento devuelto ${marker}`),
  }),
});
await request(`/authoring/documents/${returnedDraft.id}/submit`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({}),
});
const returned = await request(`/authoring/documents/${returnedDraft.id}/return`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ observation: 'Corregir el contenido de prueba' }),
});
assert(
  returned.authoring.status === 'CHANGES_REQUESTED',
  'return did not set CHANGES_REQUESTED',
);
assert(
  returned.authoring.reviewObservation === 'Corregir el contenido de prueba',
  'return did not persist the observation',
);

await request(`/authoring/templates/${template.id}/deactivate`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({}),
});

console.log(
  JSON.stringify(
    {
      ok: true,
      templateId: template.id,
      pinnedDocumentId: pinned.id,
      pinnedTemplateVersion: afterPublish.templateData.templateVersion.version,
      concurrentNumbers: numbers,
      returnedDocumentId: returned.id,
    },
    null,
    2,
  ),
);
