import { PrismaClient } from '@prisma/client';
import { runDemoSeed } from './seed-demo';

// El marcador expresa el contrato del ejecutor; no demuestra propiedad por sí solo.
runDemoSeed(process.env, (url) => new PrismaClient({ datasources: { db: { url } } }))
  .catch(() => {
    console.error('La carga de demostración falló; detalles omitidos.');
    process.exitCode = 1;
  });
