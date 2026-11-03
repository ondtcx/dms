import { BadRequestException } from '@nestjs/common';
import {
  applyDefaults,
  getByPath,
  normalizeFields,
  setByPath,
  validateAndPrepareForm,
} from './authoring-fields';

describe('authoring fields', () => {
  it('reads and writes nested paths without prototype pollution', () => {
    const data: any = {};
    setByPath(data, 'destinatario.nombre', 'Juan');
    expect(getByPath(data, 'destinatario.nombre')).toBe('Juan');
    expect(() => setByPath(data, '__proto__.polluted', true)).toThrow(BadRequestException);
  });

  it('rejects duplicate and invalid field definitions', () => {
    expect(() =>
      normalizeFields({
        fields: [
          { key: 'a.b', label: 'A', type: 'text' },
          { key: 'a.b', label: 'B', type: 'text' },
        ],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      normalizeFields({ fields: [{ key: '__proto__.x', label: 'X', type: 'text' }] }),
    ).toThrow(BadRequestException);
    expect(() =>
      normalizeFields({ fields: [{ key: 'a', label: 'A', type: 'file' }] }),
    ).toThrow(BadRequestException);
  });

  it('requires required fields only when requested', () => {
    const fields = [
      { key: 'documento.asunto', label: 'Asunto', type: 'text' as const, required: true },
    ];
    expect(validateAndPrepareForm(fields, {}, false)).toEqual({});
    expect(() => validateAndPrepareForm(fields, {}, true)).toThrow(
      'Faltan campos requeridos: Asunto',
    );
  });

  it('renders rich text and normalizes list values', () => {
    const fields = [
      { key: 'contenido', label: 'Contenido', type: 'richtext' as const, required: true },
      { key: 'destinatarios', label: 'Destinatarios', type: 'list' as const, required: true },
    ];
    const prepared = validateAndPrepareForm(fields, {
      contenido: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hola' }] }],
      },
      destinatarios: 'Uno\nDos',
    });

    expect(prepared.contenido).toBe('<p>Hola</p>');
    expect(prepared.destinatarios).toEqual(['Uno', 'Dos']);
  });

  it('applies defaults from the user and active academic year', () => {
    const fields = [
      { key: 'firmante.nombre', label: 'Firmante', type: 'text' as const },
      { key: 'firmante.cargo', label: 'Cargo', type: 'text' as const },
      { key: 'periodo.nombre', label: 'Período', type: 'text' as const },
    ];
    const data = applyDefaults(fields, {}, { name: 'Ana', role: 'secretario' }, { name: '2025-2026' });
    expect(data.firmante).toEqual({ nombre: 'Ana', cargo: 'Secretario/a' });
    expect(data.periodo.nombre).toBe('2025-2026');
  });
});
