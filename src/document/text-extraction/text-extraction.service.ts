import { Injectable } from '@nestjs/common';
import { ChildProcess, spawn, SpawnOptions } from 'node:child_process';
import { extractionWorkerSource } from './text-extraction.worker';

type ChildFactory = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

@Injectable()
export class TextExtractionService {
  private active = 0;
  private readonly queue: (() => void)[] = [];
  private readonly factory: ChildFactory;

  constructor(factory?: ChildFactory) {
    this.factory = factory ?? ((command, args, options) => spawn(command, args, options));
  }

  extractFromFile(filePath: string, mimetype: string): Promise<string | null> {
    if (this.active >= 2 && this.queue.length >= 2) return Promise.resolve(null);
    return new Promise((resolve) => {
      const start = () => {
        this.active++;
        let child: ChildProcess | undefined;
        let timer: NodeJS.Timeout | undefined;
        let cleanup: NodeJS.Timeout | undefined;
        let closed = false;
        let failed = false;
        let received = false;
        let result: string | null = null;
        const release = () => {
          if (closed) return;
          closed = true;
          clearTimeout(timer);
          clearTimeout(cleanup);
          child?.removeAllListeners('message');
          this.active--;
          this.queue.shift()?.();
          resolve(failed ? null : result);
        };
        const fail = () => {
          if (closed || failed) return;
          failed = true;
          result = null;
          try { child?.kill('SIGKILL'); } catch { /* El cierre sigue siendo obligatorio. */ }
          // El solicitante termina aunque el SO no cierre; el turno permanece reservado.
          cleanup = setTimeout(() => {
            try { child?.kill('SIGKILL'); } catch { /* No se mata ningún proceso ajeno. */ }
            child?.removeAllListeners('message');
            resolve(null);
          }, 1000);
        };
        try {
          child = this.factory(process.execPath, [
            '--max-old-space-size=128', '--max-semi-space-size=32', '-e', extractionWorkerSource(),
          ], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true, serialization: 'json' });
          // Se conserva el receptor de error para eventos tardíos del emisor.
          child.on('error', fail);
          child.on('message', (value: unknown) => {
            if (closed || failed) return;
            if (received || !(value === null || (typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 1048576))) {
              fail(); return;
            }
            received = true;
            result = value as string | null;
          });
          child.once('close', (code, signal) => {
            if (code !== 0 || signal || !received) failed = true;
            release();
          });
          timer = setTimeout(fail, 10000);
          child.send({ filePath, mimetype }, (error) => { if (error) fail(); });
        } catch {
          if (child) fail();
          else { failed = true; release(); }
        }
      };
      if (this.active < 2) start();
      else {
        const queued = () => { clearTimeout(wait); start(); };
        const wait = setTimeout(() => {
          const index = this.queue.indexOf(queued);
          if (index >= 0) this.queue.splice(index, 1);
          resolve(null);
        }, 10000);
        this.queue.push(queued);
      }
    });
  }
}
