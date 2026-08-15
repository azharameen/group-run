const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = (options?.headers as Record<string, string>) || {};

  // Only add Content-Type: application/json if it's not FormData
  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

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

export async function fetchKnowledgeBase(): Promise<KnowledgeBaseData> {
  return request<KnowledgeBaseData>('/kb/');
}

export async function fetchKBDocument(path: string): Promise<KBDocument> {
  return request<KBDocument>(`/kb/${path}`);
}

export async function ingestKnowledgeBaseDocument(payload: {
  file: File;
  source?: string;
}): Promise<KnowledgeBaseUploadResult> {
  const formData = new FormData();
  formData.append('file', payload.file);
  if (payload.source) {
    formData.append('source', payload.source);
  }

  return request<KnowledgeBaseUploadResult>('/kb/', {
    method: 'POST',
    body: formData,
  });
}
