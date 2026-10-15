import { INestApplication } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export interface RawFilePolicy {
  denies(rawPath: string): Promise<boolean>;
}

export function receptionFileMiddleware(policy: RawFilePolicy) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!await policy.denies(request.url)) {
        next();
        return;
      }
    } catch {
      // No se delega a ServeStatic cuando la clasificación falla.
    }
    response.setHeader('Cache-Control', 'private, no-store');
    response.status(404).end();
  };
}

export function installReceptionFileProtection(
  app: INestApplication,
  policy: RawFilePolicy,
): void {
  // Debe ejecutarse antes de init/listen: ServeStatic registra rutas en onModuleInit.
  // app.use no añade el prefijo global de los controladores Nest.
  app.use('/files', receptionFileMiddleware(policy));
}
