import type { ProviderKind, TrustTier } from '@/api/types';

/**
 * Per-provider form rules for BYOK credentials.
 * Local OpenAI-compatible servers default to T0 (sovereign) and may be keyless.
 */
export interface ProviderRules {
  baseUrl: 'required' | 'optional' | 'hidden';
  apiKey: 'required' | 'optional';
  defaultTier: TrustTier;
  baseUrlPlaceholder?: string;
}

export const PROVIDER_RULES: Record<ProviderKind, ProviderRules> = {
  openai: { baseUrl: 'hidden', apiKey: 'required', defaultTier: 't2_contracted' },
  anthropic: { baseUrl: 'hidden', apiKey: 'required', defaultTier: 't2_contracted' },
  openai_compatible: {
    baseUrl: 'required',
    apiKey: 'optional',
    defaultTier: 't0_sovereign',
    baseUrlPlaceholder: 'http://vllm.internal:8000/v1',
  },
  azure_openai: {
    baseUrl: 'required',
    apiKey: 'required',
    defaultTier: 't2_contracted',
    baseUrlPlaceholder: 'https://<resource>.openai.azure.com',
  },
  bedrock: {
    baseUrl: 'optional',
    apiKey: 'required',
    defaultTier: 't2_contracted',
    baseUrlPlaceholder: 'https://bedrock-runtime.<region>.amazonaws.com',
  },
  vertex: {
    baseUrl: 'optional',
    apiKey: 'required',
    defaultTier: 't2_contracted',
    baseUrlPlaceholder: 'https://<region>-aiplatform.googleapis.com',
  },
};
