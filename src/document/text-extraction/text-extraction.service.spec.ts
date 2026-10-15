import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextExtractionService } from './text-extraction.service';

describe('TextExtractionService', () => {
  let children: any[];
  let service: TextExtractionService;
  beforeEach(() => {
    jest.useFakeTimers();
    children = [];
    service = new TextExtractionService(() => {
      const child = new EventEmitter() as any;
      child.kill = jest.fn();
      child.send = jest.fn((_job, callback) => callback(null));
      children.push(child);
      return child;
    });
  });
  afterEach(() => jest.useRealTimers());
  it('bounds active children and queue until close, including errors and deadline', async () => {
    const jobs = Array.from({ length: 5 }, () => service.extractFromFile('synthetic', 'text/plain'));
    expect(children).toHaveLength(2);
    await expect(jobs[4]).resolves.toBeNull();
    children[0].emit('message', 'hello');
    expect(children).toHaveLength(2);
    children[0].emit('close', 0, null);
    await expect(jobs[0]).resolves.toBe('hello');
    expect(children).toHaveLength(3);
    children[1].emit('error', new Error('failure'));
    expect(children[1].kill).toHaveBeenCalledWith('SIGKILL');
    expect(children).toHaveLength(3);
    children[1].emit('close', 1, null);
    await expect(jobs[1]).resolves.toBeNull();
    children[2].emit('close', null, 'SIGSEGV');
    await expect(jobs[2]).resolves.toBeNull();
    jest.advanceTimersByTime(10000);
    expect(children[3].kill).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    expect(children[3].kill).toHaveBeenCalledTimes(2);
    children[3].emit('message', 'late');
    children[3].emit('close', null, 'SIGKILL');
    await expect(jobs[3]).resolves.toBeNull();
    children.forEach((child) => child.emit('error', new Error('late')));
  });
  it('bounds callers without reusing hung capacity and expires queued jobs', async () => {
    const jobs = Array.from({ length: 4 }, () => service.extractFromFile('synthetic', 'text/plain'));
    const settled: unknown[] = [];
    jobs.forEach((job, index) => job.then(value => settled.push([index, value])));
    jest.advanceTimersByTime(10000);
    await Promise.resolve();
    expect(settled).toEqual([[2, null], [3, null]]);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(settled).toHaveLength(4);
    expect(children).toHaveLength(2);
    const next = service.extractFromFile('next', 'text/plain');
    children[0].emit('message', 'late');
    children[0].emit('close', 0, null);
    children[0].emit('close', 0, null);
    expect(children).toHaveLength(3);
    children[2].emit('message', 'valid');
    children[2].emit('close', 0, null);
    await expect(next).resolves.toBe('valid');
    children[1].emit('close', 0, null);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('recovers from startup errors and requires an isolated bounded Node process', async () => {
    const factory = jest.fn((_command: string, _args: string[], _options: any): any => { throw new Error('startup'); });
    const failing = new TextExtractionService(factory);
    await expect(failing.extractFromFile('file', 'text/plain')).resolves.toBeNull();
    await expect(failing.extractFromFile('file', 'text/plain')).resolves.toBeNull();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory.mock.calls[0][0]).toBe(process.execPath);
    expect(factory.mock.calls[0][1]).toEqual(expect.arrayContaining(['--max-old-space-size=128', '--max-semi-space-size=32', '-e']));
    expect(factory.mock.calls[0][1].join(' ')).not.toContain('worker_threads');
    expect(factory.mock.calls[0][2].stdio).toEqual(['ignore', 'ignore', 'ignore', 'ipc']);
  });
  it('contains synchronous parent send failure without releasing before close', async () => {
    const child = new EventEmitter() as any;
    child.kill = jest.fn();
    child.send = () => { throw new Error('IPC closed'); };
    const isolated = new TextExtractionService(() => child);
    const job = isolated.extractFromFile('unused', 'text/plain');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    jest.advanceTimersByTime(1000);
    await expect(job).resolves.toBeNull();
    child.emit('close', 1, null);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('rejects malformed, duplicate, oversized and unsuccessful responses', async () => {
    for (const messages of [[{}], ['x'.repeat(1048577)], ['ok', 'again'], [null]]) {
      const job = service.extractFromFile('synthetic', 'text/plain');
      const child = children[children.length - 1];
      messages.forEach((value) => child.emit('message', value));
      child.emit('close', messages[0] === null ? 139 : 0, null);
      await expect(job).resolves.toBeNull();
    }
  });
  it('contains a real owned native abort and subsequently extracts text', async () => {
    jest.useRealTimers();
    const dir = await mkdtemp(join(tmpdir(), 'dms-abort-'));
    const file = join(dir, 'text.txt');
    let exit: number | null | undefined;
    let signal: NodeJS.Signals | null | undefined;
    let first = true;
    const isolated = new TextExtractionService((command, args, options) => {
      const child = spawn(command, first ? [...args.slice(0, 3), "process.once('message',()=>process.abort())"] : args, { ...options, cwd: dir });
      first = false;
      child.on('close', (code, value) => { exit = code; signal = value; });
      return child;
    });
    try {
      await writeFile(file, 'After native abort');
      await expect(isolated.extractFromFile(file, 'text/plain')).resolves.toBeNull();
      expect(signal || exit).toBeTruthy();
      if (process.platform !== 'win32') expect(signal).toBe('SIGABRT');
      console.info('Owned native abort:', { exit, signal });
      await expect(isolated.extractFromFile(file, 'text/plain')).resolves.toBe('After native abort');
    } finally {
      // Solo se limpian archivos del directorio temporal creado por esta prueba.
      const fs = await import('node:fs/promises');
      for (const entry of await fs.readdir(dir)) await unlink(join(dir, entry));
      await rmdir(dir);
    }
  });
});
