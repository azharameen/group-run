import { request, RequestOptions } from './request';

export interface KBDocument {
  source: string;
  path: string;
  filename: string;
  content: string | Record<string, unknown>;
}

export interface KnowledgeBaseData {
  documents: KBDocument[];
  count: number;
  sources: { raw: number; processed: number };
}

export interface KnowledgeBaseUploadResult {
  success: boolean;
  filename?: string;
  path?: string;
  error?: string;
}

export async function fetchKnowledgeBase(options?: RequestOptions): Promise<KnowledgeBaseData> {
  return request<KnowledgeBaseData>('/kb/', options);
}

export async function fetchKBDocument(path: string, options?: RequestOptions): Promise<KBDocument> {
  return request<KBDocument>(`/kb/${path}`, options);
}

export async function ingestKnowledgeBaseDocument(payload: {
  file: File;
  source?: string;
}, options?: RequestOptions): Promise<KnowledgeBaseUploadResult> {
  const formData = new FormData();
  formData.append('file', payload.file);
  if (payload.source) {
    formData.append('source', payload.source);
  }

  return request<KnowledgeBaseUploadResult>('/kb/', {
    method: 'POST',
    body: formData,
    ...options,
  });
}
