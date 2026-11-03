export function getDemoConfig(env: NodeJS.ProcessEnv): {
  enabled: boolean;
  frontendOrigin?: string;
} {
  if (env.DEMO_MODE !== '1') return { enabled: false };

  const origin = env.DEMO_FRONTEND_ORIGIN ?? '';
  const match = /^http:\/\/(?:localhost|127\.0\.0\.1):([0-9]+)$/.exec(origin);
  const port = match ? Number(match[1]) : 0;
  if (!match || port < 1 || port > 65535) {
    throw new Error('DEMO_FRONTEND_ORIGIN must be a loopback HTTP origin with an explicit valid port');
  }
  return { enabled: true, frontendOrigin: origin };
}
