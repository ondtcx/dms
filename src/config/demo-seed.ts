export function validateDemoSeedEnvironment(env: NodeJS.ProcessEnv): {
  databaseUrl: string;
  adminPassword: string;
} {
  if (env.DEMO_MODE !== '1' || !env.DEMO_ADMIN_PASSWORD ||
      env.DEMO_OWNED_MARKER !== 'visible-demo-smoke-v1' ||
      !env.DEMO_OWNED_TARGET || env.DEMO_OWNED_TARGET !== env.DATABASE_URL) {
    throw new Error('La demostración requiere DEMO_MODE y una contraseña de administrador');
  }
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL || '');
  } catch {
    throw new Error('La URL de la base de demostración no es válida');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^\/dms_demo_[a-f0-9]{16,32}$/.test(url.pathname) ||
      !url.port || url.search || url.hash) {
    throw new Error('La base de demostración debe ser un destino local explícito');
  }
  return { databaseUrl: env.DATABASE_URL, adminPassword: env.DEMO_ADMIN_PASSWORD };
}
