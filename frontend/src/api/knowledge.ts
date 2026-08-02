const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
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
  content: string | Record<string, any>;
}

export interface KnowledgeBaseData {
  documents: KBDocument[];
  count: number;
  sources: { raw: number; processed: number };
}

export interface KnowledgeBaseUploadResult {
  success: boolean;
  record?: Record<string, any>;
  documents?: KBDocument[];
  count?: number;
  error?: string;
}

export async function fetchKnowledgeBase(): Promise<KnowledgeBaseData> {
  return request<KnowledgeBaseData>('/knowledge-base');
}

export async function ingestKnowledgeBaseDocument(payload: {
  filename: string;
  mime_type: string;
  content_base64: string;
  source?: string;
}): Promise<KnowledgeBaseUploadResult> {
  return request<KnowledgeBaseUploadResult>('/knowledge-base/ingest', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
