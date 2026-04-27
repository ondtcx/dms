jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    load: jest.fn(),
    destroy: jest.fn(),
  })),
}));
