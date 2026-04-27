import * as fs from 'fs';
import * as path from 'path';
import { PERMISSIONS } from '../../prisma/seed-rbac';

function collectControllerFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectControllerFiles(fullPath);
    }

    if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
      return [fullPath];
    }

    return [];
  });
}

describe('Permissions catalog integrity', () => {
  it('should ensure all @Permissions decorators use valid seeded actions', () => {
    const srcDir = path.resolve(__dirname, '..');
    const controllerFiles = collectControllerFiles(srcDir);
    const seededActions = new Set(PERMISSIONS.map((permission) => permission.action));
    const unknownActions: string[] = [];
    const malformedActions: string[] = [];

    for (const file of controllerFiles) {
      const source = fs.readFileSync(file, 'utf8');
      const decoratorMatches = source.match(/@Permissions\(([^)]*)\)/g) || [];

      for (const match of decoratorMatches) {
        const actionMatches = Array.from(match.matchAll(/'([^']+)'/g));

        for (const actionMatch of actionMatches) {
          const action = actionMatch[1];

          if (action === 'role:') {
            malformedActions.push(`${file}: ${action}`);
            continue;
          }

          if (!seededActions.has(action)) {
            unknownActions.push(`${file}: ${action}`);
          }
        }
      }
    }

    expect(malformedActions).toEqual([]);
    expect(unknownActions).toEqual([]);
  });
});
