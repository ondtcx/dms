import { AuthoringRendererService } from './authoring-renderer.service';

describe('authoring renderer context', () => {
  const service = new AuthoringRendererService({} as any, {} as any);

  it('preserves form document fields while adding system metadata', () => {
    const context = service.buildContext(
      { bodyHtml: '<p>{{documento.asunto}}</p>', template: { name: 'Oficio institucional' } } as any,
      { documento: { asunto: 'Asunto de prueba' }, contenido: '<p>Contenido</p>' },
      { name: 'Ana', role: 'secretario' },
      { documentNumber: null, draft: true },
      {
        institutionName: 'Institución de prueba',
        institutionLogo: null,
        institutionAddress: null,
        institutionPhone: null,
        institutionEmail: null,
        institutionWebsite: null,
        schoolYearName: null,
      },
    );

    expect(context.documento.asunto).toBe('Asunto de prueba');
    expect(context.documento.numero).toBe('BORRADOR');
    expect(context.documento.fecha).toBeTruthy();
    expect(context.firmante).toEqual({ nombre: 'Ana', cargo: 'Secretario/a' });
    expect(context._metadata.draft).toBe(true);
  });
});
