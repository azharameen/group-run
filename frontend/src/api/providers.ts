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

const adminHeaders = (token?: string): HeadersInit =>
  token ? { 'X-Provider-Config-Admin-Token': token } : {};

export const fetchProviders = () =>
  request<{ providers: ProviderConfig[]; count: number }>('/providers');

export const saveProvider = (input: ProviderInput, token?: string, id?: string) =>
  request<ProviderConfig>(id ? `/providers/${encodeURIComponent(id)}` : '/providers', {
    method: id ? 'PUT' : 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify(input),
  });

export const activateProvider = (id: string, token?: string) =>
  request<ProviderConfig>(`/providers/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
    headers: adminHeaders(token),
  });

export const testProvider = (id: string, token?: string, credentials?: Record<string, string>) =>
  request<ProviderTestResult>(`/providers/${encodeURIComponent(id)}/test`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify(credentials ? { credentials } : {}),
  });

export const deleteProvider = (id: string, token?: string) =>
  request<void>(`/providers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
  });
