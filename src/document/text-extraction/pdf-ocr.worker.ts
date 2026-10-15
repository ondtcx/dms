import { isLocalAbsolutePath, noEnrichment, OcrResult, runPdfOcr } from './pdf-ocr.engine';

export interface OcrRequest { type: 'extract'; inputPath: string; modelDirectory: string }
export const MAX_OCR_RESULT_BYTES = 6 * 1024 * 1024 + 1024;

export async function handleOcrRequest(request: unknown, extract = runPdfOcr): Promise<OcrResult> {
  if (!request || typeof request !== 'object') return noEnrichment('invalid-request');
  const value = request as Record<string, unknown>;
  if (value.type !== 'extract' || !isLocalAbsolutePath(value.inputPath) || !isLocalAbsolutePath(value.modelDirectory) || Object.keys(value).some((key) => !['type', 'inputPath', 'modelDirectory'].includes(key))) {
    return noEnrichment('invalid-request');
  }
  try { return await extract(value.inputPath, value.modelDirectory); }
  catch { return noEnrichment('processing-failed'); }
}

export function serializeResult(result: OcrResult): string {
  const json = JSON.stringify(result);
  return Buffer.byteLength(json) <= MAX_OCR_RESULT_BYTES ? json : JSON.stringify(noEnrichment('processing-failed'));
}

if (require.main === module) {
  const finish = async (request: unknown) => {
    const result = await handleOcrRequest(request);
    const serialized = serializeResult(result);
    if (process.send) {
      process.send(JSON.parse(serialized), undefined, undefined, () => { process.disconnect(); process.exit(0); });
    } else {
      process.stdout.write(`${serialized}\n`, () => process.exit(0));
    }
  };
  if (process.send) {
    process.once('message', (request) => { void finish(request); });
    process.once('disconnect', () => process.exit(0));
  } else {
    void finish(process.argv.length === 4 ? { type: 'extract', inputPath: process.argv[2], modelDirectory: process.argv[3] } : null);
  }
}
