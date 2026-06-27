import { api } from './api';

export interface OAuthScopeDefinition {
  key: string;
  label: string;
  description: string;
  category: string;
  endpoints: string[];
  identityScope?: boolean;
  costCredits?: number;
}

export interface OAuthClient {
  clientId: string;
  type: 'confidential' | 'public';
  name: string;
  description: string | null;
  homepageUrl: string | null;
  logoUrl: string | null;
  redirectUris: string[];
  allowedScopes: string[];
  ownerUserId: string;
  rateLimitPerMinute: number;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  hasClientSecret: boolean;
  operationalStats?: OAuthClientOperationalStats;
}

export interface OAuthClientOperationalStats {
  activeGrantCount: number;
  revokedGrantCount: number;
  activeAccessTokenCount: number;
  activeRefreshTokenCount: number;
  revokedTokenCount: number;
  tokenUsageCount: number;
  lastTokenUsedAt: string | null;
}

export interface OAuthGrant {
  grantId: string;
  clientId: string;
  userId: string;
  user?: {
    id: string;
    username: string;
    email: string;
  } | null;
  scopes: string[];
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  client?: OAuthClient | null;
}

export interface OAuthAuthorizePreview {
  success: boolean;
  client: OAuthClient;
  scopes: string[];
  scopeDetails: OAuthScopeDefinition[];
  redirectUri: string;
  responseType: 'code';
  state: string | null;
  codeChallengeMethod: 'plain' | 'S256' | null;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
    roles?: string[];
    isAdmin: boolean;
    is_admin?: boolean;
    admin?: boolean;
    synapseAdmin?: boolean;
    synapse_admin?: boolean;
    isTrusted?: boolean;
    is_trusted?: boolean;
    synapseTrusted?: boolean;
    synapse_trusted?: boolean;
    avatarUrl: string | null;
  };
}

export interface OAuthClientCreateResult {
  success: boolean;
  client: OAuthClient;
  clientSecret: string | null;
  message: string;
}

export interface OAuthClientListResult {
  success: boolean;
  clients: OAuthClient[];
}

export interface OAuthGrantListResult {
  success: boolean;
  grants: OAuthGrant[];
}

export interface OAuthScopeListResult {
  success: boolean;
  scopes: OAuthScopeDefinition[];
}

export const oauthApi = {
  getScopes: async () => {
    const response = await api.get<OAuthScopeListResult>('/api/oauth/scopes');
    return response.data;
  },
  getAuthorizePreview: async (queryString: string) => {
    const response = await api.get<OAuthAuthorizePreview>(`/api/oauth/authorize/preview?${queryString}`);
    return response.data;
  },
  submitAuthorization: async (payload: Record<string, unknown>) => {
    const response = await api.post<{ success: boolean; redirectUri: string; scopes: string[] }>('/api/oauth/authorize', payload);
    return response.data;
  },
  listClients: async () => {
    const response = await api.get<OAuthClientListResult>('/api/oauth/clients');
    return response.data;
  },
  createClient: async (payload: Record<string, unknown>) => {
    const response = await api.post<OAuthClientCreateResult>('/api/oauth/clients', payload);
    return response.data;
  },
  updateClient: async (clientId: string, payload: Record<string, unknown>) => {
    const response = await api.put<{ success: boolean; client: OAuthClient }>(`/api/oauth/clients/${clientId}`, payload);
    return response.data;
  },
  rotateClientSecret: async (clientId: string) => {
    const response = await api.post<OAuthClientCreateResult>(`/api/oauth/clients/${clientId}/rotate-secret`);
    return response.data;
  },
  deleteClient: async (clientId: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/api/oauth/clients/${clientId}`);
    return response.data;
  },
  listGrants: async () => {
    const response = await api.get<OAuthGrantListResult>('/api/oauth/grants');
    return response.data;
  },
  revokeGrant: async (grantId: string) => {
    const response = await api.post<{ success: boolean; message: string }>(`/api/oauth/grants/${grantId}/revoke`);
    return response.data;
  },
};
