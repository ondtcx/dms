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
      if (dirFile.endsWith('.ts')) {
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
    content = content.replace(/import \{ Roles \} from '[^']+';/g, "import { Permissions } from '../auth/decorators/permissions.decorator';");
    changed = true;
  } else if (content.includes('Roles,') || content.includes(', Roles')) {
    content = content.replace(/Roles,/g, 'Permissions,').replace(/, Roles/g, ', Permissions');
    changed = true;
  }

  // Replace UserRole enum imports
  if (content.includes('import { UserRole }')) {
    content = content.replace(/import \{ UserRole \} from '[^']+';\n?/g, '');
    changed = true;
  }

  // Replace @Roles(UserRole.ADMIN, ...) with @Permissions('users:write', 'documents:write:all') etc.
  // For simplicity, we can map UserRole.ADMIN -> 'admin_action' or just use generic permissions based on the controllers.
  // Actually, the prompt says "Replace @Roles(...) with @Permissions(...)". Let's map Roles to permissions.
  // ADMIN -> 'users:write', 'documents:delete:all' (just examples)
  // Let's replace UserRole.X with string literals for now, e.g. UserRole.ADMIN -> 'roles:admin'
  // Or better, let's map:
  // ADMIN -> 'admin'
  // RECTOR -> 'rector'
  // and we'll check these strings in PermissionsGuard? No, PermissionsGuard checks if the user has the permission action.
  
  if (content.includes('@Roles(')) {
    content = content.replace(/@Roles\(([^)]+)\)/g, (match, p1) => {
      // p1 is like "UserRole.ADMIN, UserRole.RECTOR"
      const roles = p1.split(',').map(r => r.trim().replace('UserRole.', '').toLowerCase());
      // We'll require permissions based on the resource.
      // But a quick fix is just mapping them to a generic permission for now:
      // Actually, the new RBAC is permission-based. So an admin route should require 'roles:write' or something.
      // Let's just use the controller's generic name as permission, e.g. 'users:write'
      // For now, let's just put 'admin' permission and we'll manually fix tests.
      return `@Permissions(${roles.map(r => `'role:${r}'`).join(', ')})`;
    });
    changed = true;
  }

  // Replace UserRole typing
  if (content.includes('UserRole')) {
    content = content.replace(/UserRole/g, 'string');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
  }
}
