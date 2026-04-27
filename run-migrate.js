const { spawn } = require('child_process');

const prisma = spawn('npx', ['prisma', 'migrate', 'dev', '--name', 'dynamic_rbac', '--create-only'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true
});

prisma.stdin.write('y\n');
prisma.stdin.end();

prisma.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
});