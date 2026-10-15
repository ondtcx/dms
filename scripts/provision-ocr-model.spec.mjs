import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { provisionModel, MODEL_SHA256, MODEL_URL } from './provision-ocr-model.mjs';

const root = resolve('.tmp/basic-search-ocr/provision-tests', randomUUID());
const bytes = Buffer.from('synthetic model bytes');
const hash = createHash('sha256').update(bytes).digest('hex');
const response = (data = bytes) => new Response(data);

test('pins the approved source and compressed SHA256', () => {
  assert.equal(MODEL_URL, 'https://tessdata.projectnaptha.com/4.0.0/spa.traineddata.gz');
  assert.equal(MODEL_SHA256, '6cd52c545bceeacb2e43fad64fc0703a711c482ba20d1ca4b6915c09de9973e6');
});

test('verifies before atomic publication and skips a valid existing model', async () => {
  const directory = resolve(root, 'valid');
  const fetchModel = async (url, options) => { assert.equal(url, MODEL_URL); assert.equal(options.redirect, 'error'); return response(); };
  assert.equal(await provisionModel({ directory, expectedHash: hash, fetchModel }), 'installed');
  assert.deepEqual(await readFile(resolve(directory, 'spa.traineddata.gz')), bytes);
  assert.deepEqual(await readdir(directory), ['spa.traineddata.gz']);
  assert.equal(await provisionModel({ directory, expectedHash: hash, fetchModel: () => { throw new Error('unexpected network'); } }), 'already-present');
});

test('checksum mismatch preserves an existing file and creates no atomic temporary file', async () => {
  const directory = resolve(root, 'mismatch');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(resolve(directory, 'spa.traineddata.gz'), 'existing');
  await assert.rejects(provisionModel({ directory, fetchModel: async () => response() }), /SHA256/);
  assert.equal(await readFile(resolve(directory, 'spa.traineddata.gz'), 'utf8'), 'existing');
  assert.deepEqual(await readdir(directory), ['spa.traineddata.gz']);
});

test('rejects HTTP errors and excessive downloaded bytes without publishing', async () => {
  await assert.rejects(provisionModel({ directory: resolve(root, 'http'), fetchModel: async () => new Response('', { status: 500 }) }), /HTTP/);
  await assert.rejects(provisionModel({ directory: resolve(root, 'large'), expectedHash: hash, maxBytes: 2, fetchModel: async () => response() }), /límite/);
});
