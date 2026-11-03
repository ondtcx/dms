import { BadRequestException } from '@nestjs/common';
import { renderTiptapDoc, validateTiptapDoc } from './tiptap-renderer';

const doc = (content: any[]) => ({ type: 'doc', content });

describe('tiptap renderer', () => {
  it('renders marks and escapes text', () => {
    const html = renderTiptapDoc(
      doc([
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [
            {
              type: 'text',
              text: '<script>alert(1)</script>',
              marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }],
            },
          ],
        },
      ]),
    );

    expect(html).toContain('text-align:center');
    expect(html).toContain('<u><em><strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong></em></u>');
  });

  it('renders headings, lists and tables', () => {
    const html = renderTiptapDoc(
      doc([
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Título' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Uno' }] }] },
          ],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
              ],
            },
          ],
        },
      ]),
    );

    expect(html).toContain('<h2>Título</h2>');
    expect(html).toContain('<ul><li><p>Uno</p></li></ul>');
    expect(html).toContain('<table><tr><th><p>A</p></th><td><p>B</p></td></tr></table>');
  });

  it('rejects unknown nodes, marks and alignments', () => {
    expect(() => validateTiptapDoc(doc([{ type: 'script' }]))).toThrow(BadRequestException);
    expect(() =>
      validateTiptapDoc(
        doc([
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'x', marks: [{ type: 'link' }] }],
          },
        ]),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateTiptapDoc(doc([{ type: 'paragraph', attrs: { textAlign: 'evil' } }])),
    ).toThrow(BadRequestException);
  });

  it('rejects a root that is not doc', () => {
    expect(() => validateTiptapDoc({ type: 'paragraph' })).toThrow(BadRequestException);
  });
});
