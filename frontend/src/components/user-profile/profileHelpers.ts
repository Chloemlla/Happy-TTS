import { startAuthentication } from '@simplewebauthn/browser';
import { openDB } from 'idb';
import getApiBaseUrl from '../../api';
import { passkeyApi } from '../../api/passkey';
import { getAuthToken } from '../../utils/authSession';
import { studioDisplayFont, studioPageFont } from '../studioTheme';

export type AuthProvider = 'local' | 'linuxdo' | 'google';
export type AccountStatus = 'active' | 'suspended';
export type IdentityProvider = 'google' | 'linuxdo';
export type LinkedAccountStatus = 'bound' | 'unbound' | 'merge_required' | 'conflict';
export type MergeStrategy = 'auto' | 'smart' | 'conservative';
export type RiskSeverity = 'low' | 'medium' | 'high';

export interface UserProfileData {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  avatarHash?: string;
  role?: string;
  createdAt?: string;
  authProvider?: AuthProvider;
  linuxdoUsername?: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
  isTranslationEnabled?: boolean;
  translationAccessUntil?: string;
  accountStatus?: AccountStatus;
}

export interface TotpStatus {
  enabled: boolean;
  hasPasskey: boolean;
}

export interface LinkedAccount {
  provider: IdentityProvider;
  label: string;
  status: LinkedAccountStatus;
  providerUserId?: string;
  providerEmail?: string | null;
  providerUsername?: string | null;
  avatarUrl?: string | null;
  linkedAt?: string;
  lastUsedAt?: string | null;
  canBind: boolean;
  canUnlink: boolean;
  mergeToken?: string;
  mergePreview?: AccountMergePreview;
  conflictReason?: string;
}

export interface AccountMergeItem {
  key: string;
  label: string;
  count: number;
  strategy: MergeStrategy;
}

export interface AccountMergeRiskItem {
  key: string;
  label: string;
  severity: RiskSeverity;
  blocking: boolean;
  message: string;
}

export interface AccountMergeAccountSummary {
  id: string;
  username: string;
  email: string;
  role: string;
  accountStatus: string;
}

export interface AccountMergePreview {
  sourceAccount: AccountMergeAccountSummary;
  targetAccount: AccountMergeAccountSummary;
  provider: IdentityProvider;
  providerUserId: string;
  mergeItems: AccountMergeItem[];
  riskItems: AccountMergeRiskItem[];
  canConfirm: boolean;
  requiresRiskAcknowledgement: boolean;
  createdAt: string;
  expiresAt?: number;
}

export interface ApiResponse<T = unknown> {
  success?: boolean;
  verified?: boolean;
  data?: T;
  error?: string;
  retryable?: boolean;
  detail?: string;
  message?: string;
  token?: string;
}

export const fetchProfile = async (): Promise<UserProfileData | null> => {
  try {
    const token = getAuthToken();
    if (!token) throw new Error('No authentication token');

    const res = await fetch(`${getApiBaseUrl()}/api/admin/user/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error('Authentication expired');
      if (res.status === 403) throw new Error('Access denied');
      throw new Error(`Request failed: ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error('[UserProfile] fetchProfile error:', error);
    throw error;
  }
};

export const verifyIdentity = async (data: {
  method: 'password' | 'totp' | 'passkey';
  password?: string;
  verificationCode?: string;
  passkeyResponse?: unknown;
  clientOrigin?: string;
}): Promise<ApiResponse & { verificationToken?: string; expiresAt?: number }> => {
  const token = getAuthToken();
  if (!token) throw new Error('No authentication token');

  const res = await fetch(`${getApiBaseUrl()}/api/admin/user/profile/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Verification failed');
  return result;
};

export const sendEmailCode = async (verificationToken: string, newEmail: string): Promise<ApiResponse> => {
  const token = getAuthToken();
  if (!token) throw new Error('No authentication token');

  const res = await fetch(`${getApiBaseUrl()}/api/admin/user/profile/email/send-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ verificationToken, newEmail }),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || '验证码发送失败');
  return result;
};

export const updateProfile = async (data: {
  email?: string;
  password?: string;
  newPassword?: string;
  avatarUrl?: string;
  verificationToken?: string;
  emailVerificationCode?: string;
}): Promise<ApiResponse> => {
  const token = getAuthToken();
  if (!token) throw new Error('No authentication token');

  const res = await fetch(`${getApiBaseUrl()}/api/admin/user/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || `Request failed: ${res.status}`);
  return result;
};

export const getAuthHeaders = (): HeadersInit => {
  const token = getAuthToken();
  if (!token) throw new Error('No authentication token');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

export const fetchLinkedAccounts = async (): Promise<LinkedAccount[]> => {
  const res = await fetch(`${getApiBaseUrl()}/api/admin/user/profile/linked-accounts`, {
    headers: getAuthHeaders(),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || '获取第三方账号失败');
  return Array.isArray(result.accounts) ? result.accounts : [];
};

export const startLinkedAccountBind = async (
  provider: IdentityProvider,
  verificationToken: string,
): Promise<{ action: 'google_id_token' | 'redirect'; clientId?: string; authorizationUrl?: string }> => {
  const res = await fetch(`${getApiBaseUrl()}/api/admin/user/profile/linked-accounts/${provider}/start`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ verificationToken }),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || '启动第三方账号绑定失败');
  return result;
};

export const bindGoogleAccount = async (
  idToken: string,
  verificationToken: string,
): Promise<{
  success: true;
  status: 'bound' | 'refreshed' | 'merge_required' | 'conflict';
  account?: LinkedAccount;
  mergeToken?: string;
  mergePreview?: AccountMergePreview;
  conflictReason?: string;
}> => {
  const res = await fetch(`${getApiBaseUrl()}/api/auth/google/bind`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ idToken, verificationToken }),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Google 绑定失败');
  return result;
};

export const unlinkLinkedAccount = async (
  provider: IdentityProvider,
  verificationToken: string,
): Promise<LinkedAccount[]> => {
  const res = await fetch(`${getApiBaseUrl()}/api/admin/user/profile/linked-accounts/${provider}/unlink`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ verificationToken }),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || '解绑第三方账号失败');
  return Array.isArray(result.accounts) ? result.accounts : [];
};

export const fetchAccountMergePreview = async (
  mergeToken: string,
): Promise<{ mergeToken: string; preview: AccountMergePreview }> => {
  const res = await fetch(`${getApiBaseUrl()}/api/admin/user/profile/account-merge/preview`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ mergeToken }),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || '获取合并预览失败');
  return result;
};

export const confirmAccountMerge = async (data: {
  mergeToken: string;
  verificationToken: string;
  includeApiKeys: boolean;
  includeOAuthClients: boolean;
  acknowledgeRisks: boolean;
}): Promise<ApiResponse> => {
  const res = await fetch(`${getApiBaseUrl()}/api/admin/user/profile/account-merge/confirm`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || '确认账号合并失败');
  return result;
};

export const getPasskeyAuthResponse = async (username: string) => {
  const optionsResponse = await passkeyApi.startAuthentication(username);
  const options = optionsResponse?.data?.options;
  if (!options) throw new Error('无法获取 Passkey 认证选项');
  return await startAuthentication({ optionsJSON: options });
};

let googleIdentityScriptPromise: Promise<void> | null = null;

export const loadGoogleIdentityScript = (): Promise<void> => {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleIdentityScriptPromise) {
    return googleIdentityScriptPromise;
  }

  googleIdentityScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-gsi="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Google script failed to load')), { once: true });
      if (window.google?.accounts?.id || existingScript.dataset.loaded === 'true') {
        resolve();
      }
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = 'true';
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      script.dataset.failed = 'true';
      script.remove();
      reject(new Error('Google script failed to load'));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    googleIdentityScriptPromise = null;
    throw error;
  });

  return googleIdentityScriptPromise;
};

export const AVATAR_DB = 'avatar-store';
export const AVATAR_STORE = 'avatars';

export const initAvatarDB = async () => {
  try {
    return await openDB(AVATAR_DB, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(AVATAR_STORE)) {
          db.createObjectStore(AVATAR_STORE);
        }
      },
    });
  } catch (error) {
    console.warn('[UserProfile] Failed to initialize avatar DB:', error);
    return null;
  }
};

export const getCachedAvatar = async (userId: string, avatarHash: string): Promise<string | undefined> => {
  try {
    const db = await initAvatarDB();
    if (!db) return undefined;

    const key = `${userId}:${avatarHash}`;
    return await db.get(AVATAR_STORE, key);
  } catch (error) {
    console.warn('[UserProfile] Failed to get cached avatar:', error);
    return undefined;
  }
};

export const setCachedAvatar = async (userId: string, avatarHash: string, blobUrl: string): Promise<void> => {
  try {
    const db = await initAvatarDB();
    if (!db) return;

    const key = `${userId}:${avatarHash}`;
    await db.put(AVATAR_STORE, blobUrl, key);
  } catch (error) {
    console.warn('[UserProfile] Failed to cache avatar:', error);
  }
};

export const pageFont = studioPageFont;
export const displayFont = studioDisplayFont;

export const formatDateTime = (value?: string | number | null): string => {
  if (!value) return '未记录';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未记录';

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export const formatRelativeTime = (value?: string | number | null): string => {
  if (!value) return '未记录';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未记录';

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const units = [
    { label: '天', ms: 24 * 60 * 60 * 1000 },
    { label: '小时', ms: 60 * 60 * 1000 },
    { label: '分钟', ms: 60 * 1000 },
  ];

  for (const unit of units) {
    if (absMs >= unit.ms) {
      const amount = Math.round(absMs / unit.ms);
      return diffMs >= 0 ? `${amount}${unit.label}后` : `${amount}${unit.label}前`;
    }
  }

  return diffMs >= 0 ? '即将生效' : '刚刚';
};

export const formatCountdown = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const getAuthProviderLabel = (provider?: AuthProvider): string => {
  switch (provider) {
    case 'google':
      return 'Google';
    case 'linuxdo':
      return 'Linux.do';
    case 'local':
    default:
      return '本地账户';
  }
};

export const getLinkedAccountStatusLabel = (status: LinkedAccountStatus): string => {
  switch (status) {
    case 'bound':
      return '已绑定';
    case 'merge_required':
      return '可合并';
    case 'conflict':
      return '冲突';
    case 'unbound':
    default:
      return '未绑定';
  }
};

export const getMergeStrategyLabel = (strategy: MergeStrategy): string => {
  switch (strategy) {
    case 'auto':
      return '自动迁移';
    case 'smart':
      return '智能合并';
    case 'conservative':
    default:
      return '保守处理';
  }
};

