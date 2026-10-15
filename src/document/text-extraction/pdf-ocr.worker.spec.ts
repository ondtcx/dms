import { handleOcrRequest, serializeResult } from './pdf-ocr.worker';

describe('PDF OCR child protocol', () => {
  it('accepts a fixed path-only request and emits enrichment', async () => {
    const extract = jest.fn().mockResolvedValue({ status: 'completed', addedText: 'español', pagesProcessed: 1, pagesOcr: 1, capped: false });
    expect(await handleOcrRequest({ type: 'extract', inputPath: '/private/input.pdf', modelDirectory: '/local/models' }, extract)).toMatchObject({ status: 'completed' });
    expect(extract).toHaveBeenCalledWith('/private/input.pdf', '/local/models');
  });

  it.each([null, {}, { type: 'eval', script: 'anything' }, { type: 'extract', inputPath: '../relative.pdf', modelDirectory: '/local' }, { type: 'extract', inputPath: '/ok', modelDirectory: 'https://remote' }, { type: 'extract', inputPath: '/ok\0bad', modelDirectory: '/local' }])('rejects malformed requests without invoking the engine: %p', async (request) => {
    const extract = jest.fn();
    expect(await handleOcrRequest(request, extract)).toMatchObject({ status: 'no-enrichment', reason: 'invalid-request' });
    expect(extract).not.toHaveBeenCalled();
  });

  it('does not leak exceptions through the protocol', async () => {
    const extract = jest.fn().mockRejectedValue(new Error('secret path'));
    expect(await handleOcrRequest({ type: 'extract', inputPath: '/input', modelDirectory: '/models' }, extract)).toMatchObject({ status: 'no-enrichment', reason: 'processing-failed' });
  });

  it('bounds serialized output even for escaped control characters', () => {
    const result = { status: 'completed', addedText: '\u0001'.repeat(1024 * 1024), pagesProcessed: 1, pagesOcr: 1, capped: false } as const;
    expect(Buffer.byteLength(serializeResult(result))).toBeLessThanOrEqual(6 * 1024 * 1024 + 1024);
    expect(JSON.parse(serializeResult(result)).status).toBe('completed');
  });
});
