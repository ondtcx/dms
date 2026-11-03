import { BadRequestException } from '@nestjs/common';
import type { AuthoringField, AuthoringFieldsSchema } from './authoring.types';
import { renderTiptapDoc } from './tiptap-renderer';

const ALLOWED_FIELD_TYPES = new Set([
  'text',
  'textarea',
  'number',
  'date',
  'time',
  'email',
  'select',
  'checkbox',
  'list',
  'richtext',
]);

const BLOCKED_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

export const ROLE_LABELS: Record<string, string> = {
  rector: 'Rector/a',
  vicerrector: 'Vicerrector/a',
  coordinador: 'Coordinador/a',
  profesor: 'Docente',
  secretario: 'Secretario/a',
  admin: 'Administrador/a',
  moderador: 'Moderador/a',
  user: 'Usuario',
};

function assertSafePath(path: string): void {
  if (!path || typeof path !== 'string') {
    throw new BadRequestException('La clave del campo es obligatoria');
  }
  for (const segment of path.split('.')) {
    if (!segment || BLOCKED_PATH_SEGMENTS.has(segment)) {
      throw new BadRequestException(`Clave de campo no permitida: ${path}`);
    }
  }
}

export function normalizeFields(raw: unknown): AuthoringFieldsSchema {
  const schema = raw as AuthoringFieldsSchema | undefined;
  if (!schema || !Array.isArray(schema.fields)) return { fields: [] };

  const seen = new Set<string>();
  const fields = schema.fields.map((field) => {
    if (!field || typeof field !== 'object') {
      throw new BadRequestException('Definición de campo inválida');
    }
    assertSafePath(field.key);
    if (seen.has(field.key)) {
      throw new BadRequestException(`Campo duplicado: ${field.key}`);
    }
    seen.add(field.key);
    if (!field.label || typeof field.label !== 'string') {
      throw new BadRequestException(`El campo ${field.key} no tiene etiqueta`);
    }
    if (!ALLOWED_FIELD_TYPES.has(field.type)) {
      throw new BadRequestException(
        `Tipo de campo no permitido para ${field.key}: ${String(field.type)}`,
      );
    }
    if (field.type === 'select' && !Array.isArray(field.options)) {
      throw new BadRequestException(`El campo ${field.key} requiere opciones`);
    }
    return { ...field, required: Boolean(field.required) };
  });

  return { fields };
}

export function cloneJson<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getByPath(source: any, path: string): any {
  assertSafePath(path);
  return path.split('.').reduce((current, segment) => {
    if (current === undefined || current === null) return undefined;
    return current[segment];
  }, source);
}

export function setByPath(target: any, path: string, value: any): void {
  assertSafePath(path);
  const segments = path.split('.');
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    if (current[segment] === undefined || current[segment] === null) {
      current[segment] = {};
    }
    if (typeof current[segment] !== 'object' || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[segments[segments.length - 1]] = value;
}

export function applyDefaults(
  fields: AuthoringField[],
  formData: Record<string, any> | null | undefined,
  user: { name?: string; role?: string },
  activeAcademicYear?: { name?: string } | null,
): Record<string, any> {
  const result = cloneJson(formData ?? {}) ?? {};
  for (const field of fields) {
    if (getByPath(result, field.key) === undefined && field.defaultValue !== undefined) {
      setByPath(result, field.key, cloneJson(field.defaultValue));
    }
  }

  if (
    fields.some((field) => field.key === 'firmante.nombre') &&
    !getByPath(result, 'firmante.nombre')
  ) {
    setByPath(result, 'firmante.nombre', user.name ?? '');
  }
  if (
    fields.some((field) => field.key === 'firmante.cargo') &&
    !getByPath(result, 'firmante.cargo')
  ) {
    setByPath(result, 'firmante.cargo', ROLE_LABELS[user.role ?? ''] ?? user.role ?? '');
  }
  if (
    fields.some((field) => field.key === 'periodo.nombre') &&
    !getByPath(result, 'periodo.nombre') &&
    activeAcademicYear?.name
  ) {
    setByPath(result, 'periodo.nombre', activeAcademicYear.name);
  }

  return result;
}

export function validateAndPrepareForm(
  fields: AuthoringField[],
  formData: Record<string, any> | null | undefined,
  requireRequired = true,
): Record<string, any> {
  const data = cloneJson(formData ?? {}) ?? {};
  const missing: string[] = [];

  for (const field of fields) {
    const value = getByPath(data, field.key);
    const empty =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (field.required && empty) {
      if (requireRequired) missing.push(field.label);
      continue;
    }
    if (empty) continue;

    switch (field.type) {
      case 'richtext':
        setByPath(data, field.key, renderTiptapDoc(value));
        break;
      case 'list': {
        const items = Array.isArray(value)
          ? value
          : String(value)
              .split('\n')
              .map((item) => item.trim())
              .filter(Boolean);
        setByPath(
          data,
          field.key,
          items.map((item) => (typeof item === 'string' ? item : String(item))),
        );
        break;
      }
      case 'checkbox':
        setByPath(data, field.key, Boolean(value));
        break;
      case 'number': {
        const number = Number(value);
        if (!Number.isFinite(number)) {
          throw new BadRequestException(`El campo ${field.label} debe ser numérico`);
        }
        setByPath(data, field.key, number);
        break;
      }
      default:
        break;
    }
  }

  if (missing.length) {
    throw new BadRequestException(`Faltan campos requeridos: ${missing.join(', ')}`);
  }

  return data;
}

const FULL_PAGE_BOX_TYPES = new Set(['text', 'richText', 'image', 'pageNumber']);

function finiteNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100_000) {
    throw new BadRequestException(`El marco de página tiene un valor inválido en ${field}`);
  }
  return number;
}

export function normalizeDocumentPageFrame(
  raw: any,
  baseFrame: any,
): Record<string, any> | null {
  if (!raw || raw.mode !== 'fullPage' || baseFrame?.mode !== 'fullPage') {
    return null;
  }
  const rawBoxes = raw?.body?.boxes;
  const baseBoxes = baseFrame?.body?.boxes;
  if (!Array.isArray(rawBoxes)) return null;
  if (rawBoxes.length > 300) {
    throw new BadRequestException('El marco de página tiene demasiadas cajas');
  }

  const boxes = rawBoxes.map((box: any, index: number) => {
    if (!box || !FULL_PAGE_BOX_TYPES.has(box.type)) {
      throw new BadRequestException(`Caja de página inválida en la posición ${index + 1}`);
    }
    const content = String(box.content ?? '');
    if (content.length > 20_000) {
      throw new BadRequestException('Una caja de página supera el tamaño permitido');
    }
    const y = finiteNumber(box.y, 'Y');
    const role =
      box.role === 'frame'
        ? 'frame'
        : box.role === 'content' ||
            (y >= 90 && y < 700 && !/^_+$/.test(content.trim()))
          ? 'content'
          : 'frame';
    return {
      id: String(box.id ?? `box-${index + 1}`).slice(0, 120),
      type: box.type,
      role,
      x: finiteNumber(box.x, 'X'),
      y,
      width: finiteNumber(box.width ?? 0, 'ancho'),
      height: box.height === undefined ? undefined : finiteNumber(box.height, 'alto'),
      fontSize: finiteNumber(box.fontSize ?? 11, 'tamaño de fuente'),
      fontFamily: String(box.fontFamily ?? 'Arial, sans-serif').slice(0, 200),
      fontWeight: String(box.fontWeight ?? '400').slice(0, 20),
      fontStyle: String(box.fontStyle ?? 'normal').slice(0, 20),
      color: String(box.color ?? '#000000').slice(0, 50),
      align: ['left', 'center', 'right', 'justify'].includes(box.align)
        ? box.align
        : 'left',
      content,
    };
  });

  return {
    ...baseFrame,
    version: 1,
    mode: 'fullPage',
    body: {
      ...(baseFrame.body ?? {}),
      boxes: boxes.length ? boxes : baseBoxes ?? [],
    },
  };
}
