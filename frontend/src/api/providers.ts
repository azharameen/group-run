import { request } from './request';

export type ProviderName = 'openai' | 'google' | 'ollama' | 'anthropic';

export interface ProviderConfig {
  provider_id: string;
  provider: ProviderName;
  name: string;
  endpoint: string;
  is_enabled: boolean;
  has_credentials: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProviderInput {
  provider: ProviderName;
  name: string;
  endpoint?: string;
  credentials?: { api_key: string };
  is_enabled: boolean;
}

export interface ProviderModel {
  model_id: string;
  display_name: string;
}

export interface ProviderCatalogGroup {
  provider_id: string;
  provider: ProviderName;
  name: string;
  endpoint: string;
  is_enabled: boolean;
  available: boolean;
  message: string;
  models: ProviderModel[];
}

export interface ProviderDefault {
  provider_id: string;
  model_id: string;
  provider: ProviderName;
  name: string;
  updated_at: string;
}

export interface ProviderTestResult {
  provider_id: string;
  provider: ProviderName;
  success: boolean;
  message: string;
}

export const PROVIDER_CATALOG_CHANGED_EVENT = "companion:provider-catalog-changed";

export function notifyProviderCatalogChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROVIDER_CATALOG_CHANGED_EVENT));
  }
}

export const fetchProviders = () =>
  request<{ providers: ProviderConfig[]; count: number }>('/providers');

export const fetchProviderCatalog = () =>
  request<{ groups: ProviderCatalogGroup[] }>('/providers/catalog');

export const fetchProviderModels = (id: string) =>
  request<ProviderCatalogGroup>(`/providers/${encodeURIComponent(id)}/models`);

export const fetchProviderDefault = () => request<ProviderDefault | null>('/providers/default');

export const saveProvider = (input: ProviderInput, id?: string) =>
  request<ProviderConfig>(id ? `/providers/${encodeURIComponent(id)}` : '/providers', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });

export const setProviderEnabled = (id: string, is_enabled: boolean) =>
  request<ProviderConfig>(`/providers/${encodeURIComponent(id)}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ is_enabled }),
  });

export const setProviderDefault = (provider_id: string, model_id: string) =>
  request<ProviderDefault>('/providers/default', {
    method: 'PUT',
    body: JSON.stringify({ provider_id, model_id }),
  });

export const testProvider = (id: string) =>
  request<ProviderTestResult>(`/providers/${encodeURIComponent(id)}/test`, {
    method: 'POST',
  });

export const deleteProvider = (id: string) =>
  request<void>(`/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
