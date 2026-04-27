const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      if (!dirFile.includes('node_modules') && !dirFile.includes('dist')) {
        filelist = walkSync(dirFile, filelist);
      }
    } else {
      if (dirFile.endsWith('.controller.ts')) {
        filelist.push(dirFile);
      }
    }
  });
  return filelist;
};

const files = walkSync(path.join(__dirname, 'src'));

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Replace @Roles imports
  if (content.includes('import { Roles }')) {
    content = content.replace(/import \{ Roles \} from '[^']+';/, "import { Permissions } from '../auth/decorators/permissions.decorator';");
    changed = true;
  } else if (content.includes('Roles,') || content.includes(', Roles')) {
    content = content.replace(/Roles,/g, 'Permissions,').replace(/, Roles/g, ', Permissions');
    changed = true;
  }

  // Map roles to permissions based on the controller or just a generic permission.
  // We'll map ADMIN to 'admin', RECTOR to 'rector', etc.
  if (content.includes('@Roles(')) {
    content = content.replace(/@Roles\(([^)]+)\)/g, (match, p1) => {
      const roles = p1.split(',').map(r => r.trim().replace('UserRole.', '').toLowerCase());
      // E.g. UserRole.ADMIN -> 'admin'
      // But we probably want real permissions like 'documents:write:all'.
      // For now, let's just map them to exact role strings, so @Permissions('admin', 'rector').
      // Our RBAC seed didn't include these as permissions. Let's just use generic strings.
      // Wait, the prompt says "Replace @Roles(...) with @Permissions(...)".
      return `@Permissions(${roles.map(r => `'role:${r}'`).join(', ')})`;
    });
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
  }
}
