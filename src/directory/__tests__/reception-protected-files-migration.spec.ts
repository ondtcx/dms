import { readFileSync } from 'fs';
import * as path from 'path';

// Guardas de regresion para la migracion de archivos protegidos de recepcion.
// El modelo real no tiene "Document.path": las rutas viven en "DocumentVersion".
// La migracion fallo con 42703 (undefined_column) por asumir "Document.path".
// Estas pruebas ligan el SQL al esquema Prisma real y preservan los contratos
// de proteccion e inmutabilidad sin depender de una base de datos en Jest.

const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..');
const MIGRATION_FILE = path.join(
  BACKEND_ROOT,
  'prisma',
  'migrations',
  '20261012030000_reception_protected_files',
  'migration.sql',
);
const SCHEMA_FILE = path.join(BACKEND_ROOT, 'prisma', 'schema.prisma');

function readMigration(): string {
  return readFileSync(MIGRATION_FILE, 'utf8');
}

// Quita comentarios de linea para no confundir "path" en prosa con referencias reales.
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

// Parsea cada modelo Prisma y el conjunto de sus columnas reales.
function parseSchemaModels(schema: string): Map<string, Set<string>> {
  const models = new Map<string, Set<string>>();
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let match: RegExpExecArray | null;
  while ((match = modelRegex.exec(schema)) !== null) {
    const columns = new Set<string>();
    for (const rawLine of match[2].split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const column = /^([A-Za-z_]\w*)/.exec(line)?.[1];
      if (column) columns.add(column);
    }
    models.set(match[1], columns);
  }
  return models;
}

interface SqlFunction {
  name: string;
  body: string;
  start: number;
  end: number;
}

// Extrae cuerpos de funciones plpgsql con su rango para resolver OLD/NEW.
function extractFunctions(sql: string): SqlFunction[] {
  const functions: SqlFunction[] = [];
  const regex =
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+"([^"]+)"\s*\(([^)]*)\)([\s\S]*?)\$([A-Za-z_]*)\$([\s\S]*?)\$\4\$;/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(sql)) !== null) {
    functions.push({ name: match[1], body: match[5], start: match.index, end: regex.lastIndex });
  }
  return functions;
}

interface SqlIndex {
  name: string;
  table: string;
  expression: string;
}

function extractIndexes(sql: string): SqlIndex[] {
  const indexes: SqlIndex[] = [];
  const regex = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+"([^"]+)"\s+ON\s+"([^"]+)"\s*\(([\s\S]*?)\)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(sql)) !== null) {
    indexes.push({ name: match[1], table: match[2], expression: match[3].trim() });
  }
  return indexes;
}

// Tabla sobre la que dispara un trigger, dado el nombre de su funcion.
function triggerTableFor(sql: string, functionName: string): string | undefined {
  const regex = new RegExp(
    `ON\\s+"([A-Za-z_]\\w*)"\\s+FOR\\s+EACH\\s+ROW\\s+EXECUTE\\s+FUNCTION\\s+"${functionName}"`,
    'i',
  );
  return regex.exec(sql)?.[1];
}

// Tabla a la que pertenece un alias en un FROM/JOIN.
function tableForAlias(sql: string, alias: string): string | undefined {
  const regex = new RegExp(`(?:FROM|JOIN)\\s+"([A-Za-z_]\\w*)"\\s+(?:AS\\s+)?${alias}\\b`, 'i');
  return regex.exec(sql)?.[1];
}

describe('reception_protected_files migration', () => {
  const schema = parseSchemaModels(readFileSync(SCHEMA_FILE, 'utf8'));
  const rawSql = readMigration();
  const sql = stripComments(rawSql);

  it('respects the real model: Document has no path, DocumentVersion has path', () => {
    expect(schema.get('Document')?.has('path')).toBe(false);
    expect(schema.get('DocumentVersion')?.has('path')).toBe(true);
  });

  it('resolves every alias.path reference to a table that truly has path', () => {
    const failures: string[] = [];
    const functions = extractFunctions(sql);
    const referenceRegex = /\b([A-Za-z_]\w*)\.path\b/g;
    let match: RegExpExecArray | null;
    while ((match = referenceRegex.exec(sql)) !== null) {
      const alias = match[1];
      const position = match.index;
      const owner = functions.find((fn) => position >= fn.start && position < fn.end);
      let table: string | undefined;
      if (alias.toUpperCase() === 'OLD' || alias.toUpperCase() === 'NEW') {
        table = owner ? triggerTableFor(sql, owner.name) : undefined;
      } else {
        table = tableForAlias(sql, alias);
      }
      const hasPath = table !== undefined && schema.get(table)?.has('path') === true;
      if (!hasPath) {
        failures.push(`${alias}.path -> ${table ?? 'tabla desconocida'}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('does not create indexes on Document (table without a path column)', () => {
    const documentIndexes = extractIndexes(sql).filter((index) => index.table === 'Document');
    expect(documentIndexes).toEqual([]);
  });

  it('does not use path on any schema table lacking the column', () => {
    const failures: string[] = [];
    for (const index of extractIndexes(sql)) {
      if (/\bpath\b/.test(index.expression) && schema.get(index.table)?.has('path') !== true) {
        failures.push(`${index.name} sobre ${index.table}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('preserves protection for every historical DocumentVersion path', () => {
    const documentTrigger = extractFunctions(sql).find(
      (fn) => fn.name === 'capture_reception_document_files',
    );
    expect(documentTrigger).toBeDefined();
    // Itera las versiones por documento, no solo la ruta actual.
    expect(documentTrigger!.body).toMatch(
      /SELECT\s+path\s+FROM\s+"DocumentVersion"\s+WHERE\s+"documentId"\s*=\s*OLD\.id/i,
    );
    expect(documentTrigger!.body).toMatch(
      /SELECT\s+path\s+FROM\s+"DocumentVersion"\s+WHERE\s+"documentId"\s*=\s*NEW\.id/i,
    );
    // El relleno inicial recorre las versiones historicas existentes.
    expect(sql).toMatch(/FROM\s+"DocumentVersion"\s+v\s+JOIN\s+"Document"\s+d/i);
    expect(sql).toMatch(/\bv\.path\b/);
  });

  it('keeps trigger and indexes valid on DocumentVersion', () => {
    expect(sql).toMatch(
      /BEFORE\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE\s+ON\s+"DocumentVersion"/i,
    );
    const names = extractIndexes(sql).map((index) => index.name);
    expect(names).toContain('DocumentVersion_reception_file_key_idx');
    expect(names).toContain('DocumentVersion_reception_file_folded_idx');
  });

  it('preserves immutability and protected identity contracts', () => {
    expect(sql).toMatch(/CREATE\s+FUNCTION\s+"reception_file_key"/i);
    expect(sql).toMatch(/CREATE\s+TABLE\s+"ProtectedReceptionFile"/i);
    expect(sql).toMatch(
      /ON\s+CONFLICT\s*\("directoryId",\s*"documentId",\s*"rawHash"\)\s*DO\s+NOTHING/i,
    );
    expect(sql).toMatch(/RAISE\s+EXCEPTION\s+'No se pudo conservar/i);
    expect(sql).toMatch(/CREATE\s+FUNCTION\s+"preserve_reception_file_history"/i);
    expect(sql).toMatch(
      /BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+"ProtectedReceptionFile"/i,
    );
  });

  it('every simple-column index references existing model columns', () => {
    const failures: string[] = [];
    for (const index of extractIndexes(sql)) {
      if (!/^(\s*"[A-Za-z_]\w*"\s*,?)+$/.test(index.expression)) continue;
      const columns = [...index.expression.matchAll(/"([A-Za-z_]\w*)"/g)].map((m) => m[1]);
      for (const column of columns) {
        if (schema.get(index.table)?.has(column) !== true) {
          failures.push(`${index.name}.${column}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
