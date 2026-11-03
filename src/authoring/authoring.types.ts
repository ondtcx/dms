export type AuthoringFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'time'
  | 'email'
  | 'select'
  | 'checkbox'
  | 'list'
  | 'richtext';

export interface AuthoringField {
  key: string;
  label: string;
  type: AuthoringFieldType;
  required?: boolean;
  defaultValue?: unknown;
  options?: Array<{ value: string; label: string }>;
}

export interface AuthoringFieldsSchema {
  fields: AuthoringField[];
}

export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

export interface TiptapDoc {
  type: 'doc';
  content?: TiptapNode[];
}
