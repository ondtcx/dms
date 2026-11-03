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
const token = login.access_token;
assert(token, 'login did not return an access token');
const auth = { Authorization: `Bearer ${token}` };

const templates = await request('/authoring/templates', { headers: auth });
const oficio = templates.find((template) => template.name === 'Oficio institucional');
assert(oficio, 'Oficio institucional template not found');
const version = oficio.versions.find((item) => item.status === 'PUBLISHED');
assert(version, 'Oficio template has no published version');

const marker = new Date().toISOString();
const content = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: `Smoke ${marker} `, marks: [{ type: 'bold' }] },
        { type: 'text', text: 'contenido controlado.' },
      ],
    },
  ],
};

const created = await request('/authoring/documents', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    templateVersionId: version.id,
    formData: {
      destinatario: { nombre: 'Destinatario de prueba', cargo: 'Cargo de prueba' },
      documento: { asunto: `Smoke ${marker}` },
      contenido: content,
      firmante: { nombre: 'Firmante de prueba', cargo: 'Cargo de prueba' },
    },
  }),
});
assert(created.authoring?.status === 'DRAFT', 'draft was not created in DRAFT');
assert(!created.documentNumber, 'draft consumed a document number');

const preview = await fetch(`${base}/authoring/documents/${created.id}/preview`, {
  headers: auth,
});
assert(preview.ok, 'preview did not return a PDF');
assert(
  preview.headers.get('content-type')?.includes('application/pdf'),
  'preview content type is not PDF',
);
const previewBytes = (await preview.arrayBuffer()).byteLength;
assert(previewBytes > 1000, 'preview PDF is unexpectedly small');

const saved = await request(`/authoring/documents/${created.id}/draft`, {
  method: 'PUT',
  headers: auth,
  body: JSON.stringify({
    formData: {
      destinatario: { nombre: 'Destinatario de prueba', cargo: 'Cargo de prueba' },
      documento: { asunto: `Smoke actualizado ${marker}` },
      contenido: content,
      firmante: { nombre: 'Firmante de prueba', cargo: 'Cargo de prueba' },
    },
    createVersion: true,
  }),
});
assert(saved.authoring.status === 'DRAFT', 'saved draft lost DRAFT status');
assert(saved.contentVersions.length >= 2, 'content version was not created');

const submitted = await request(`/authoring/documents/${created.id}/submit`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({}),
});
assert(submitted.authoring.status === 'IN_REVIEW', 'submit did not enter IN_REVIEW');

const approved = await request(`/authoring/documents/${created.id}/approve`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ observation: 'Aprobado por smoke test' }),
});
assert(approved.authoring.status === 'APPROVED', 'approve did not enter APPROVED');

const emitted = await request(`/authoring/documents/${created.id}/emit`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({}),
});
assert(emitted.authoring.status === 'EMITTED', 'emit did not enter EMITTED');
assert(emitted.documentNumber?.startsWith('DOC-OFI-'), 'emitted number does not use the OFI prefix');

const blocked = await fetch(`${base}/authoring/documents/${created.id}/draft`, {
  method: 'PUT',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ formData: {} }),
});
assert(blocked.status === 403, 'emitted document accepted a mutation');

const repeated = await request(`/authoring/documents/${created.id}/emit`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({}),
});
assert(repeated.documentNumber === emitted.documentNumber, 'idempotent emit changed the number');

console.log(
  JSON.stringify(
    {
      ok: true,
      documentId: created.id,
      documentNumber: emitted.documentNumber,
      previewBytes,
      contentVersions: saved.contentVersions.length,
      documentVersions: emitted.versions.length,
    },
    null,
    2,
  ),
);
