import { BadRequestException } from '@nestjs/common';
import type { TiptapDoc, TiptapMark, TiptapNode } from './authoring.types';

const ALLOWED_NODES = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'bulletList',
  'orderedList',
  'listItem',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'hardBreak',
]);

const ALLOWED_MARKS = new Set(['bold', 'italic', 'underline']);
const ALLOWED_ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);
const MAX_NODES = 5_000;
const MAX_DEPTH = 12;
const MAX_TEXT_LENGTH = 200_000;
const MAX_TABLE_CELLS = 400;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function invalid(message: string): never {
  throw new BadRequestException(`Contenido enriquecido inválido: ${message}`);
}

function validateMarks(marks: TiptapMark[] | undefined): void {
  if (!marks) return;
  if (!Array.isArray(marks)) invalid('las marcas deben ser una lista');
  for (const mark of marks) {
    if (!mark || typeof mark.type !== 'string' || !ALLOWED_MARKS.has(mark.type)) {
      invalid(`marca no permitida: ${String(mark?.type)}`);
    }
  }
}

function validateNode(
  node: TiptapNode,
  depth: number,
  state: { nodes: number; text: number; cells: number },
): void {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') {
    invalid('nodo sin tipo');
  }
  if (depth > MAX_DEPTH) invalid('profundidad excedida');
  if (!ALLOWED_NODES.has(node.type)) invalid(`nodo no permitido: ${node.type}`);

  state.nodes += 1;
  if (state.nodes > MAX_NODES) invalid('demasiados nodos');

  if (node.type === 'text') {
    if (typeof node.text !== 'string') invalid('texto inválido');
    state.text += node.text.length;
    if (state.text > MAX_TEXT_LENGTH) invalid('texto demasiado largo');
    validateMarks(node.marks);
  }

  if (node.type === 'heading') {
    const level = Number(node.attrs?.level ?? 1);
    if (![1, 2, 3].includes(level)) invalid('nivel de encabezado no permitido');
  }

  if (node.type === 'paragraph' || node.type === 'heading') {
    const align = node.attrs?.textAlign;
    if (align !== undefined && !ALLOWED_ALIGNMENTS.has(String(align))) {
      invalid(`alineación no permitida: ${String(align)}`);
    }
  }

  if (node.type === 'orderedList' && node.attrs?.start !== undefined) {
    const start = Number(node.attrs.start);
    if (!Number.isInteger(start) || start < 1 || start > 10_000) {
      invalid('inicio de lista no permitido');
    }
  }

  if (node.type === 'tableHeader' || node.type === 'tableCell') {
    state.cells += 1;
    if (state.cells > MAX_TABLE_CELLS) invalid('demasiadas celdas de tabla');
  }

  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) invalid('contenido debe ser una lista');
    for (const child of node.content) {
      validateNode(child, depth + 1, state);
    }
  }
}

export function validateTiptapDoc(value: unknown): TiptapDoc {
  if (!value || typeof value !== 'object') invalid('documento vacío');
  const doc = value as TiptapDoc;
  if (doc.type !== 'doc') invalid('el nodo raíz debe ser doc');
  if (doc.content !== undefined && !Array.isArray(doc.content)) {
    invalid('el contenido raíz debe ser una lista');
  }
  validateNode(doc as TiptapNode, 0, { nodes: 0, text: 0, cells: 0 });
  return doc;
}

function renderMarks(text: string, marks: TiptapMark[] | undefined): string {
  let rendered = escapeHtml(text);
  if (!marks?.length) return rendered;
  const types = new Set(marks.map((mark) => mark.type));
  if (types.has('bold')) rendered = `<strong>${rendered}</strong>`;
  if (types.has('italic')) rendered = `<em>${rendered}</em>`;
  if (types.has('underline')) rendered = `<u>${rendered}</u>`;
  return rendered;
}

function alignmentStyle(node: TiptapNode): string {
  const align = node.attrs?.textAlign;
  return align ? ` style="text-align:${String(align)}"` : '';
}

function renderNode(node: TiptapNode): string {
  if (node.type === 'text') {
    return renderMarks(node.text ?? '', node.marks);
  }

  const children = (node.content ?? []).map(renderNode).join('');

  switch (node.type) {
    case 'doc':
      return children;
    case 'paragraph':
      return `<p${alignmentStyle(node)}>${children || '<br/>'}</p>`;
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1);
      return `<h${level}${alignmentStyle(node)}>${children}</h${level}>`;
    }
    case 'bulletList':
      return `<ul>${children}</ul>`;
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1);
      return `<ol${start !== 1 ? ` start="${start}"` : ''}>${children}</ol>`;
    }
    case 'listItem':
      return `<li>${children}</li>`;
    case 'table':
      return `<table>${children}</table>`;
    case 'tableRow':
      return `<tr>${children}</tr>`;
    case 'tableHeader':
      return `<th>${children || '&nbsp;'}</th>`;
    case 'tableCell':
      return `<td>${children || '&nbsp;'}</td>`;
    case 'hardBreak':
      return '<br/>';
    default:
      return children;
  }
}

export function renderTiptapDoc(value: unknown): string {
  return renderNode(validateTiptapDoc(value) as TiptapNode);
}
