import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODEL_URL = 'https://tessdata.projectnaptha.com/4.0.0/spa.traineddata.gz';
export const MODEL_SHA256 = '6cd52c545bceeacb2e43fad64fc0703a711c482ba20d1ca4b6915c09de9973e6';
const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function existingHash(path, maxBytes) {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) return null;
    const hash = createHash('sha256');
    let length = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      length += chunk.length;
      if (length > maxBytes) return null;
      hash.update(chunk);
    }
    return hash.digest('hex');
  } finally { await file.close(); }
}

export async function provisionModel({ directory = resolve(process.env.OCR_MODEL_DIRECTORY || join(backendDirectory, 'ocr-models')), expectedHash = MODEL_SHA256, fetchModel = globalThis.fetch, maxBytes = 32 * 1024 * 1024 } = {}) {
  const target = join(directory, 'spa.traineddata.gz');
  try { if (await existingHash(target, maxBytes) === expectedHash) return 'already-present'; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetchModel(MODEL_URL, { redirect: 'error', signal: AbortSignal.timeout(60000) });
  if (!response.ok || !response.body) throw new Error(`Descarga del modelo: HTTP ${response.status}`);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > maxBytes) throw new Error('Modelo excede el límite de bytes');
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  if (sha256(bytes) !== expectedHash) throw new Error('SHA256 del modelo español no coincide');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  await rename(temporary, target);
  return 'installed';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  provisionModel().then((status) => {
    console.log(status === 'installed' ? 'Modelo español verificado e instalado.' : 'Modelo español ya verificado.');
  }).catch(() => {
    console.error('No se pudo preparar el modelo español; OCR permanece deshabilitado.');
    process.exitCode = 1;
  });
}
