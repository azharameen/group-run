import { request } from './request';

export type ProviderName = 'openai' | 'google' | 'ollama';

export interface ProviderConfig {
  provider_id: string;
  provider: ProviderName;
  name: string;
  endpoint: string;
  model: string;
  is_active: boolean;
  has_credentials: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProviderInput {
  provider: ProviderName;
  name?: string;
  endpoint?: string;
  model: string;
  credentials?: Record<string, string>;
  is_active?: boolean;
}

export interface ProviderTestResult {
  provider_id: string;
  provider: ProviderName;
  success: boolean;
  message: string;
}

export const fetchProviders = () =>
  request<{ providers: ProviderConfig[]; count: number }>('/providers');

export const saveProvider = (input: ProviderInput, id?: string) =>
  request<ProviderConfig>(id ? `/providers/${encodeURIComponent(id)}` : '/providers', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });

export const activateProvider = (id: string) =>
  request<ProviderConfig>(`/providers/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
  });

export const testProvider = (id: string, credentials?: Record<string, string>) =>
  request<ProviderTestResult>(`/providers/${encodeURIComponent(id)}/test`, {
    method: 'POST',
    body: JSON.stringify(credentials ? { credentials } : {}),
  });

export const deleteProvider = (id: string) =>
  request<void>(`/providers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
