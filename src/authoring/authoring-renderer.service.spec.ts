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

  it('passes custom page header/footer and removes the body header partial', async () => {
    const generator = {
      generatePDF: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      generateHTML: jest.fn(),
    };
    const settings = {
      getSettings: jest.fn().mockResolvedValue({
        institution: { name: 'Institución de prueba' },
        schoolYear: {},
      }),
    };
    const renderer = new AuthoringRendererService(
      settings as any,
      generator as any,
    );

    await renderer.generatePdf(
      {
        bodyHtml: '{{> institutionHeader}}<p>{{documento.asunto}}</p>',
        headerHtml: '<div>{{institucion.nombre}}</div>',
        footerHtml: '<div>Página <span class="pageNumber"></span></div>',
        marginTop: '3.2cm',
        marginBottom: '3cm',
        marginLeft: '2cm',
        marginRight: '2cm',
        template: { name: 'Oficio' },
      } as any,
      { documento: { asunto: 'Asunto' } },
      { name: 'Ana', role: 'secretario' },
      { draft: true },
    );

    expect(generator.generatePDF).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlTemplate: expect.not.stringContaining('institutionHeader'),
        displayHeaderFooter: true,
        headerTemplate: expect.stringContaining('Institución de prueba'),
        footerTemplate: expect.stringContaining('pageNumber'),
        margin: {
          top: '3.2cm',
          right: '2cm',
          bottom: '3cm',
          left: '2cm',
        },
      }),
    );
  });
});
