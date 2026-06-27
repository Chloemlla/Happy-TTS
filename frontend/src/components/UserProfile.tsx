import React, { useEffect, useState, ChangeEvent, useRef, useCallback, useMemo } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { useNotification } from './Notification';
import { m } from 'framer-motion';
import VerifyCodeInput from './VerifyCodeInput';
import { LoadingSpinner } from './LoadingSpinner';
import getApiBaseUrl from '../api';
import { passkeyApi } from '../api/passkey';
import { openDB } from 'idb';
import { FaUser, FaUserCircle, FaShieldAlt, FaLock, FaEnvelope, FaCamera, FaSave, FaKey, FaCheckCircle, FaClock, FaExclamationCircle, FaGlobe, FaHistory, FaLink, FaUndoAlt, FaGoogle, FaSyncAlt, FaUnlink, FaExternalLinkAlt } from 'react-icons/fa';
import { cn } from '../utils/cn';
import {
  studioAccentBlobBlueClassName,
  studioAccentBlobSkyClassName,
  studioDarkPanelClassName,
  studioDisplayFont,
  studioEyebrowPillClassName,
  studioFieldClassName,
  studioHeroCardClassName,
  studioMainSurfaceClassName,
  studioModalCardClassName,
  studioModalOverlayClassName,
  studioPageClassName,
  studioPageFont,
  studioPanelClassName,
  studioPrimaryButtonClassName,
} from './studioTheme';

type AuthProvider = 'local' | 'linuxdo' | 'google';
type AccountStatus = 'active' | 'suspended';
type IdentityProvider = 'google' | 'linuxdo';
type LinkedAccountStatus = 'bound' | 'unbound' | 'merge_required' | 'conflict';
type MergeStrategy = 'auto' | 'smart' | 'conservative';
type RiskSeverity = 'low' | 'medium' | 'high';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: Record<string, unknown>) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

interface UserProfileData {
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

interface TotpStatus {
  enabled: boolean;
  hasPasskey: boolean;
}

interface LinkedAccount {
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

interface AccountMergeItem {
  key: string;
  label: string;
  count: number;
  strategy: MergeStrategy;
}

interface AccountMergeRiskItem {
  key: string;
  label: string;
  severity: RiskSeverity;
  blocking: boolean;
  message: string;
}

interface AccountMergeAccountSummary {
  id: string;
  username: string;
  email: string;
  role: string;
  accountStatus: string;
}

interface AccountMergePreview {
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

interface ApiResponse<T = any> {
  success?: boolean;
  verified?: boolean;
  data?: T;
  error?: string;
  retryable?: boolean;
  detail?: string;
  message?: string;
  token?: string;
}

const fetchProfile = async (): Promise<UserProfileData | null> => {
  try {
    const token = localStorage.getItem('token');
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

const verifyIdentity = async (data: {
  method: 'password' | 'totp' | 'passkey';
  password?: string;
  verificationCode?: string;
  passkeyResponse?: any;
  clientOrigin?: string;
}): Promise<ApiResponse & { verificationToken?: string; expiresAt?: number }> => {
  const token = localStorage.getItem('token');
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

const sendEmailCode = async (verificationToken: string, newEmail: string): Promise<ApiResponse> => {
  const token = localStorage.getItem('token');
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

const updateProfile = async (data: {
  email?: string;
  password?: string;
  newPassword?: string;
  avatarUrl?: string;
  verificationToken?: string;
  emailVerificationCode?: string;
}): Promise<ApiResponse> => {
  const token = localStorage.getItem('token');
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

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No authentication token');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

const fetchLinkedAccounts = async (): Promise<LinkedAccount[]> => {
  const res = await fetch(`${getApiBaseUrl()}/api/admin/user/profile/linked-accounts`, {
    headers: getAuthHeaders(),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || '获取第三方账号失败');
  return Array.isArray(result.accounts) ? result.accounts : [];
};

const startLinkedAccountBind = async (
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

const bindGoogleAccount = async (
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

const unlinkLinkedAccount = async (
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

const fetchAccountMergePreview = async (
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

const confirmAccountMerge = async (data: {
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

const getPasskeyAuthResponse = async (username: string) => {
  const optionsResponse = await passkeyApi.startAuthentication(username);
  const options = optionsResponse?.data?.options;
  if (!options) throw new Error('无法获取 Passkey 认证选项');
  return await startAuthentication({ optionsJSON: options });
};

let googleIdentityScriptPromise: Promise<void> | null = null;

const loadGoogleIdentityScript = (): Promise<void> => {
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

const AVATAR_DB = 'avatar-store';
const AVATAR_STORE = 'avatars';

const initAvatarDB = async () => {
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

const getCachedAvatar = async (userId: string, avatarHash: string): Promise<string | undefined> => {
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

const setCachedAvatar = async (userId: string, avatarHash: string, blobUrl: string): Promise<void> => {
  try {
    const db = await initAvatarDB();
    if (!db) return;

    const key = `${userId}:${avatarHash}`;
    await db.put(AVATAR_STORE, blobUrl, key);
  } catch (error) {
    console.warn('[UserProfile] Failed to cache avatar:', error);
  }
};

const pageFont = studioPageFont;
const displayFont = studioDisplayFont;

const formatDateTime = (value?: string | number | null): string => {
  if (!value) return '未记录';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未记录';

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const formatRelativeTime = (value?: string | number | null): string => {
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

const formatCountdown = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getAuthProviderLabel = (provider?: AuthProvider): string => {
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

const getLinkedAccountStatusLabel = (status: LinkedAccountStatus): string => {
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

const getMergeStrategyLabel = (strategy: MergeStrategy): string => {
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

const UserProfile: React.FC = () => {
  const { setNotification } = useNotification();

  // Core state
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadTimeout, setLoadTimeout] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');
  const [verificationExpiresAt, setVerificationExpiresAt] = useState<number | null>(null);
  const [verificationTimeLeft, setVerificationTimeLeft] = useState(0);

  // Email change verification
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailCodeCooldown, setEmailCodeCooldown] = useState(0);

  // Authentication state
  const [totpStatus, setTotpStatus] = useState<TotpStatus | null>(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  // Third-party account state
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [linkedAccountsLoading, setLinkedAccountsLoading] = useState(false);
  const [googleBindClientId, setGoogleBindClientId] = useState('');
  const [googleBindActive, setGoogleBindActive] = useState(false);
  const [mergeToken, setMergeToken] = useState('');
  const [mergePreview, setMergePreview] = useState<AccountMergePreview | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [includeApiKeysInMerge, setIncludeApiKeysInMerge] = useState(false);
  const [includeOAuthClientsInMerge, setIncludeOAuthClientsInMerge] = useState(false);
  const [acknowledgeMergeRisks, setAcknowledgeMergeRisks] = useState(false);
  const googleBindButtonRef = useRef<HTMLDivElement | null>(null);
  const linkedAccountsSectionRef = useRef<HTMLElement | null>(null);

  // Password change state
  const [changePwdMode, setChangePwdMode] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [confirmNewPwd, setConfirmNewPwd] = useState('');

  // Avatar state
  const [avatarImg, setAvatarImg] = useState<string | undefined>(undefined);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const avatarObjectUrlRef = useRef<string | undefined>(undefined);

  // Max file size and allowed types
  const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  const loadProfile = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (!background) {
      setLoadError(null);
      setLoadTimeout(false);
      setPageLoading(true);
    }

    const timeoutId = window.setTimeout(() => {
      if (!background) {
        setLoadTimeout(true);
        setPageLoading(false);
      }
    }, 8000);

    try {
      const data = await fetchProfile();
      window.clearTimeout(timeoutId);

      if (!background) {
        setPageLoading(false);
      }

      if (data) {
        setProfile(data);
        setEmail(data.email);
        return data;
      } else {
        if (!background) {
          setLoadError('加载失败，请刷新页面或重新登录');
        }
        return null;
      }
    } catch (error) {
      window.clearTimeout(timeoutId);

      if (!background) {
        setPageLoading(false);
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        setLoadError(`加载失败：${errorMessage}`);
        return null;
      }

      throw error;
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const loadLinkedAccounts = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (!background) {
      setLinkedAccountsLoading(true);
    }

    try {
      const accounts = await fetchLinkedAccounts();
      setLinkedAccounts(accounts);
      const pendingMerge = accounts.find((account) => account.mergeToken && account.mergePreview);
      if (pendingMerge?.mergeToken && pendingMerge.mergePreview && !mergePreview) {
        setMergeToken(pendingMerge.mergeToken);
        setMergePreview(pendingMerge.mergePreview);
      }
      return accounts;
    } catch (error) {
      console.warn('[UserProfile] Failed to fetch linked accounts:', error);
      if (!background) {
        setNotification({
          message: error instanceof Error ? error.message : '获取第三方账号失败',
          type: 'error',
        });
      }
      return [];
    } finally {
      if (!background) {
        setLinkedAccountsLoading(false);
      }
    }
  }, [mergePreview, setNotification]);

  useEffect(() => {
    if (profile?.id) {
      void loadLinkedAccounts({ background: true });
    }
  }, [loadLinkedAccounts, profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;

    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('mergeToken');
    if (!tokenFromUrl) return;

    const loadPreview = async () => {
      try {
        const result = await fetchAccountMergePreview(tokenFromUrl);
        setMergeToken(result.mergeToken);
        setMergePreview(result.preview);
        setShowMergeModal(true);
        params.delete('mergeToken');
        const nextSearch = params.toString();
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
        window.history.replaceState(null, '', nextUrl);
      } catch (error) {
        setNotification({
          message: error instanceof Error ? error.message : '获取合并预览失败',
          type: 'error',
        });
      }
    };

    void loadPreview();
  }, [profile?.id, setNotification]);

  const fetchTotpStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const res = await fetch(`${getApiBaseUrl()}/api/totp/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        console.warn('[UserProfile] Failed to fetch TOTP status:', res.status);
        return;
      }

      const data = await res.json();
      const hasPasskey =
        typeof data?.hasPasskey === 'boolean'
          ? data.hasPasskey
          : typeof data?.passkeyEnabled === 'boolean'
            ? data.passkeyEnabled
            : typeof data?.credentialsCount === 'number'
              ? data.credentialsCount > 0
              : Array.isArray(data?.passkeyCredentials)
                ? data.passkeyCredentials.length > 0
                : await passkeyApi
                    .getCredentials()
                    .then(({ data: credentials }) => Array.isArray(credentials) && credentials.length > 0)
                    .catch(() => false);

      setTotpStatus({
        enabled: Boolean(data.enabled),
        hasPasskey,
      });
    } catch (error) {
      console.warn('[UserProfile] Error fetching TOTP status:', error);
    }
  }, []);

  useEffect(() => {
    fetchTotpStatus();
  }, [fetchTotpStatus]);

  // Email code cooldown timer
  useEffect(() => {
    if (emailCodeCooldown <= 0) return;
    const timer = setInterval(() => {
      setEmailCodeCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailCodeCooldown]);

  // Detect if email has changed from original
  const emailChanged = useMemo(() => {
    if (!profile?.email) return Boolean(email);
    return email.trim().toLowerCase() !== profile.email.trim().toLowerCase();
  }, [email, profile?.email]);

  useEffect(() => {
    if (!emailChanged) {
      setEmailVerificationCode('');
      setEmailCodeSent(false);
      setEmailCodeCooldown(0);
    }
  }, [emailChanged]);

  const resetVerificationState = useCallback(() => {
    setVerified(false);
    setVerificationToken('');
    setVerificationCode('');
    setVerificationExpiresAt(null);
    setVerificationTimeLeft(0);
    setEmailVerificationCode('');
    setEmailCodeSent(false);
    setEmailCodeCooldown(0);
    setShowVerificationModal(false);
  }, []);

  useEffect(() => {
    if (!verificationExpiresAt) {
      setVerificationTimeLeft(0);
      return;
    }

    const syncRemaining = () => {
      const remaining = Math.max(0, verificationExpiresAt - Date.now());
      setVerificationTimeLeft(remaining);

      if (remaining <= 0) {
        resetVerificationState();
        setNotification({ message: '身份验证已过期，请重新验证', type: 'warning' });
        return true;
      }

      return false;
    };

    if (syncRemaining()) {
      return;
    }

    const timer = window.setInterval(() => {
      if (syncRemaining()) {
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [verificationExpiresAt, resetVerificationState, setNotification]);

  const applyVerificationSuccess = useCallback((
    result: ApiResponse & { verificationToken?: string; expiresAt?: number },
    successMessage: string,
  ) => {
    if (!result.success || !result.verificationToken) {
      throw new Error(result.error || '验证失败');
    }

    setVerified(true);
    setVerificationToken(result.verificationToken);
    setVerificationExpiresAt(typeof result.expiresAt === 'number' ? result.expiresAt : null);
    setNotification({ message: successMessage, type: 'success' });
  }, [setNotification]);

  const isSecuritySessionActive = useMemo(() => (
    verified && Boolean(verificationToken) && (!verificationExpiresAt || verificationExpiresAt > Date.now())
  ), [verificationExpiresAt, verificationToken, verified]);

  const passwordChangeReady = useMemo(() => (
    changePwdMode && newPwd.length >= 8 && newPwd === confirmNewPwd
  ), [changePwdMode, confirmNewPwd, newPwd]);

  // Avatar loading logic
  const loadAvatar = useCallback(async (profile: UserProfileData) => {
    if (!profile.avatarUrl || !profile.id) {
      setAvatarImg(undefined);
      return;
    }

    setAvatarLoading(true);

    try {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = undefined;
      }

      if (/^https?:\/\//.test(profile.avatarUrl)) {
        setAvatarImg(profile.avatarUrl);
        setAvatarLoading(false);
        return;
      }

      if (profile.avatarHash) {
        const cached = await getCachedAvatar(profile.id, profile.avatarHash);
        if (cached && cached.startsWith('blob:')) {
          setAvatarImg(cached);
          setAvatarLoading(false);
          return;
        }
      }

      const response = await fetch(profile.avatarUrl);
      if (!response.ok) throw new Error('Failed to load avatar');

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      avatarObjectUrlRef.current = objectUrl;
      setAvatarImg(objectUrl);

      if (profile.avatarHash) {
        await setCachedAvatar(profile.id, profile.avatarHash, objectUrl);
      }
    } catch (error) {
      console.warn('[UserProfile] Failed to load avatar:', error);
      setAvatarImg(undefined);
    } finally {
      setAvatarLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile) {
      loadAvatar(profile);
    }

    return () => {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = undefined;
      }
    };
  }, [profile, loadAvatar]);

  // Avatar upload
  const handleAvatarChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setNotification({
        message: '不支持的文件格式，请上传图片文件（JPEG、PNG、WebP、GIF）',
        type: 'error'
      });
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setNotification({
        message: `文件大小不能超过 ${MAX_AVATAR_SIZE / 1024 / 1024}MB`,
        type: 'error'
      });
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);
    setSubmitting(true);
    setAvatarLoading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token');

      const res = await fetch(`${getApiBaseUrl()}/api/admin/user/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || `Upload failed: ${res.status}`);
      }

      if (result.success && result.avatarUrl) {
        setProfile((prev) => prev ? {
          ...prev,
          avatarUrl: result.avatarUrl,
          avatarHash: result.avatarHash
        } : prev);

        setNotification({ message: '头像上传成功', type: 'success' });
        await loadProfile({ background: true });
      } else {
        throw new Error(result.error || '头像上传失败');
      }
    } catch (error) {
      console.error('[UserProfile] Avatar upload error:', error);

      let errorMessage = '头像上传失败，请稍后重试';
      if (error instanceof Error) {
        if (error.message.includes('fetch') || error.message.includes('network')) {
          errorMessage = '网络连接失败，请检查网络后重试';
        } else if (error.message.includes('timeout')) {
          errorMessage = '上传超时，请稍后重试';
        } else if (error.message.includes('size')) {
          errorMessage = '文件过大，请选择较小的图片';
        } else {
          errorMessage = error.message;
        }
      }

      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      input.value = '';
      setSubmitting(false);
      setAvatarLoading(false);
    }
  }, [setNotification, loadProfile]);

  // Avatar component
  const Avatar = useMemo(() => {
    return ({ src }: { src?: string }) => {
      const [error, setError] = useState(false);
      const [imageLoading, setImageLoading] = useState(true);

      if (!src || error) {
        return (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            {avatarLoading ? (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            ) : (
              <FaUser className="text-3xl text-slate-400" />
            )}
          </div>
        );
      }

      return (
        <div className="relative w-full h-full">
          {imageLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            </div>
          )}
          <img
            src={src}
            alt="头像"
            className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
            onLoad={() => setImageLoading(false)}
            onError={() => {
              setError(true);
              setImageLoading(false);
            }}
          />
        </div>
      );
    };
  }, [avatarLoading]);

  // Security session flow
  const handleVerify = useCallback(async () => {
    if (!profile?.id) {
      setNotification({ message: '用户信息不完整', type: 'error' });
      return;
    }

    if (isSecuritySessionActive) {
      setNotification({ message: '安全会话仍有效，可继续保存账号修改', type: 'success' });
      return;
    }

    setPassword('');
    setVerificationCode('');
    setShowVerificationModal(true);
  }, [isSecuritySessionActive, profile?.id, setNotification]);

  const handlePasswordVerification = useCallback(async () => {
    if (!profile?.id) {
      setNotification({ message: '用户信息不完整', type: 'error' });
      return;
    }

    if (!password) {
      setNotification({ message: '请输入当前密码', type: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await verifyIdentity({ method: 'password', password });
      applyVerificationSuccess(res, '安全会话已建立，可继续保存账号修改');
      setPassword('');
      setShowVerificationModal(false);
    } catch (error) {
      console.error('[UserProfile] Password verification error:', error);
      const errorMessage = error instanceof Error ? error.message : '密码验证失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }, [applyVerificationSuccess, password, profile?.id, setNotification]);

  // Send email verification code
  const handleSendEmailCode = useCallback(async () => {
    if (!isSecuritySessionActive) {
      setNotification({ message: '请先建立安全会话，再发送新邮箱验证码', type: 'warning' });
      setShowVerificationModal(true);
      return;
    }
    if (!email || !emailChanged) {
      setNotification({ message: '请输入新邮箱地址', type: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      await sendEmailCode(verificationToken, email.trim().toLowerCase());
      setEmailCodeSent(true);
      setEmailCodeCooldown(60);
      setNotification({ message: '验证码已发送到新邮箱', type: 'success' });
    } catch (error) {
      console.error('[UserProfile] Send email code error:', error);
      const errorMessage = error instanceof Error ? error.message : '验证码发送失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }, [verificationToken, email, emailChanged, isSecuritySessionActive, setNotification]);

  // Profile update
  const handleUpdate = useCallback(async () => {
    const wantsPasswordChange = changePwdMode && Boolean(newPwd || confirmNewPwd);

    if (!emailChanged && !wantsPasswordChange) {
      setNotification({ message: '当前没有需要保存的资料变更', type: 'warning' });
      return;
    }

    if (!isSecuritySessionActive) {
      setNotification({ message: '保存账号修改前请先建立安全会话', type: 'warning' });
      setShowVerificationModal(true);
      return;
    }

    if (emailChanged && !emailVerificationCode) {
      setNotification({ message: '请输入新邮箱验证码', type: 'warning' });
      return;
    }

    if (wantsPasswordChange) {
      if (!newPwd) {
        setNotification({ message: '请输入新密码', type: 'warning' });
        return;
      }
      if (newPwd.length < 8) {
        setNotification({ message: '新密码长度至少8位', type: 'warning' });
        return;
      }
      if (!confirmNewPwd) {
        setNotification({ message: '请再次输入新密码', type: 'warning' });
        return;
      }
      if (newPwd !== confirmNewPwd) {
        setNotification({ message: '两次输入的新密码不一致', type: 'warning' });
        return;
      }
    }

    setSubmitting(true);

    try {
      const updateData: Record<string, string | undefined> = {};

      if (emailChanged) updateData.email = email.trim().toLowerCase();
      if (verificationToken) updateData.verificationToken = verificationToken;
      if (emailChanged && emailVerificationCode) {
        updateData.emailVerificationCode = emailVerificationCode;
      }
      if (wantsPasswordChange) {
        updateData.newPassword = newPwd;
      }

      await updateProfile(updateData);
      setNotification({ message: '账号修改已保存', type: 'success' });

      await loadProfile({ background: true });

      setPassword('');
      setNewPwd('');
      setConfirmNewPwd('');
      setChangePwdMode(false);
      resetVerificationState();
    } catch (error) {
      console.error('[UserProfile] Update error:', error);
      const errorMessage = error instanceof Error ? error.message : '更新失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }, [
    changePwdMode,
    confirmNewPwd,
    email,
    emailChanged,
    emailVerificationCode,
    isSecuritySessionActive,
    loadProfile,
    newPwd,
    resetVerificationState,
    setNotification,
    verificationToken,
  ]);

  // TOTP verification in modal
  const handleTotpVerification = useCallback(async () => {
    if (!profile?.id || !verificationCode) {
      setNotification({ message: '请输入验证码', type: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await verifyIdentity({ method: 'totp', verificationCode });
      applyVerificationSuccess(res, '安全会话已建立，可继续保存账号修改');
      setShowVerificationModal(false);
    } catch (error) {
      console.error('[UserProfile] TOTP verification error:', error);
      const errorMessage = error instanceof Error ? error.message : '验证失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }, [applyVerificationSuccess, profile, setNotification, verificationCode]);

  // Passkey verification in modal
  const handlePasskeyVerification = useCallback(async () => {
    if (!profile?.username) {
      setNotification({ message: '无法获取用户名', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const passkeyResponse = await getPasskeyAuthResponse(profile.username);
      const res = await verifyIdentity({
        method: 'passkey',
        passkeyResponse,
        clientOrigin: window.location.origin,
      });
      applyVerificationSuccess(res, '安全会话已建立，可继续保存账号修改');
      setShowVerificationModal(false);
    } catch (error) {
      console.error('[UserProfile] Passkey verification error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Passkey 验证失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }, [applyVerificationSuccess, profile, setNotification]);

  const handleGoogleBindResult = useCallback(async (idToken: string) => {
    if (!isSecuritySessionActive) {
      setNotification({ message: '安全会话已过期，请重新验证后绑定 Google', type: 'warning' });
      setGoogleBindActive(false);
      setShowVerificationModal(true);
      return;
    }

    setSubmitting(true);
    try {
      const result = await bindGoogleAccount(idToken, verificationToken);
      setGoogleBindActive(false);

      if (result.status === 'merge_required' && result.mergeToken && result.mergePreview) {
        setMergeToken(result.mergeToken);
        setMergePreview(result.mergePreview);
        setShowMergeModal(true);
        setNotification({ message: '检测到该 Google 账号已绑定其他本地账号，请查看合并预览', type: 'warning' });
      } else if (result.status === 'conflict') {
        setNotification({ message: result.conflictReason || '当前账户已绑定另一个 Google 身份', type: 'error' });
      } else {
        setNotification({
          message: result.status === 'refreshed' ? 'Google 绑定信息已刷新' : 'Google 绑定成功',
          type: 'success',
        });
        await loadProfile({ background: true });
      }

      await loadLinkedAccounts({ background: true });
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : 'Google 绑定失败',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }, [isSecuritySessionActive, loadLinkedAccounts, loadProfile, setNotification, verificationToken]);

  useEffect(() => {
    if (!googleBindActive || !googleBindClientId || !googleBindButtonRef.current) {
      return;
    }

    let cancelled = false;

    const renderButton = async () => {
      try {
        await loadGoogleIdentityScript();
        if (cancelled || !googleBindButtonRef.current || !window.google?.accounts?.id) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: googleBindClientId,
          callback: (response: { credential?: string }) => {
            const credential = typeof response.credential === 'string' ? response.credential : '';
            if (!credential) {
              setNotification({ message: 'Google 未返回有效凭证', type: 'error' });
              return;
            }
            void handleGoogleBindResult(credential);
          },
        });

        googleBindButtonRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBindButtonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: Math.max(googleBindButtonRef.current.offsetWidth || 0, 240),
        });
      } catch (error) {
        setGoogleBindActive(false);
        setNotification({
          message: error instanceof Error ? error.message : '无法加载 Google 绑定模块',
          type: 'error',
        });
      }
    };

    void renderButton();

    return () => {
      cancelled = true;
    };
  }, [googleBindActive, googleBindClientId, handleGoogleBindResult, setNotification]);

  const handleStartLinkedAccountBind = useCallback(async (provider: IdentityProvider) => {
    if (!isSecuritySessionActive) {
      setNotification({ message: '绑定第三方账号前请先建立安全会话', type: 'warning' });
      setShowVerificationModal(true);
      return;
    }

    setSubmitting(true);
    try {
      const result = await startLinkedAccountBind(provider, verificationToken);

      if (result.action === 'redirect' && result.authorizationUrl) {
        window.location.assign(result.authorizationUrl);
        return;
      }

      if (provider === 'google' && result.action === 'google_id_token' && result.clientId) {
        setGoogleBindClientId(result.clientId);
        setGoogleBindActive(true);
        setNotification({ message: '请在 Google 按钮中选择要绑定的账号', type: 'success' });
        return;
      }

      throw new Error('第三方账号绑定响应无效');
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '启动第三方账号绑定失败',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }, [isSecuritySessionActive, setNotification, verificationToken]);

  const handleUnlinkLinkedAccount = useCallback(async (provider: IdentityProvider) => {
    if (!isSecuritySessionActive) {
      setNotification({ message: '解绑第三方账号前请先建立安全会话', type: 'warning' });
      setShowVerificationModal(true);
      return;
    }

    setSubmitting(true);
    try {
      const accounts = await unlinkLinkedAccount(provider, verificationToken);
      setLinkedAccounts(accounts);
      setNotification({ message: `${provider === 'google' ? 'Google' : 'Linux.do'} 已解绑`, type: 'success' });
      await loadProfile({ background: true });
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '解绑第三方账号失败',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }, [isSecuritySessionActive, loadProfile, setNotification, verificationToken]);

  const handleOpenMergePreview = useCallback(async (account: LinkedAccount) => {
    const token = account.mergeToken || mergeToken;
    if (!token) {
      setNotification({ message: '缺少合并预览令牌', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await fetchAccountMergePreview(token);
      setMergeToken(result.mergeToken);
      setMergePreview(result.preview);
      setShowMergeModal(true);
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '获取合并预览失败',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }, [mergeToken, setNotification]);

  const handleConfirmAccountMerge = useCallback(async () => {
    if (!mergeToken || !mergePreview) {
      setNotification({ message: '缺少合并预览', type: 'error' });
      return;
    }

    if (!isSecuritySessionActive) {
      setNotification({ message: '确认合并前请先建立安全会话', type: 'warning' });
      setShowVerificationModal(true);
      return;
    }

    if (mergePreview.requiresRiskAcknowledgement && !acknowledgeMergeRisks) {
      setNotification({ message: '请先确认合并风险项', type: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      await confirmAccountMerge({
        mergeToken,
        verificationToken,
        includeApiKeys: includeApiKeysInMerge,
        includeOAuthClients: includeOAuthClientsInMerge,
        acknowledgeRisks: acknowledgeMergeRisks,
      });

      setNotification({ message: '账号合并已完成，当前登录账号保持不变', type: 'success' });
      setShowMergeModal(false);
      setMergeToken('');
      setMergePreview(null);
      setIncludeApiKeysInMerge(false);
      setIncludeOAuthClientsInMerge(false);
      setAcknowledgeMergeRisks(false);
      await loadProfile({ background: true });
      await loadLinkedAccounts({ background: true });
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '确认账号合并失败',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    acknowledgeMergeRisks,
    includeApiKeysInMerge,
    includeOAuthClientsInMerge,
    loadLinkedAccounts,
    loadProfile,
    mergePreview,
    mergeToken,
    isSecuritySessionActive,
    setNotification,
    verificationToken,
  ]);

  const isAuthenticated = useMemo(() => {
    return Boolean(localStorage.getItem('token'));
  }, []);

  const providerLabel = useMemo(() => getAuthProviderLabel(profile?.authProvider), [profile?.authProvider]);

  const translationAccessLabel = useMemo(() => {
    if (!profile?.isTranslationEnabled) {
      return '未启用';
    }

    if (!profile.translationAccessUntil) {
      return '已启用';
    }

    return `有效至 ${formatDateTime(profile.translationAccessUntil)}`;
  }, [profile?.isTranslationEnabled, profile?.translationAccessUntil]);

  const pendingChanges = useMemo(() => {
    const items: string[] = [];

    if (emailChanged) {
      items.push(`邮箱将更新为 ${email.trim().toLowerCase()}`);
    }

    if (changePwdMode && newPwd) {
      items.push(
        confirmNewPwd && newPwd === confirmNewPwd
          ? '新的登录密码已填写并确认，将随本次账号修改一起保存'
          : '新的登录密码草稿已填写，请确认两次输入一致后再提交',
      );
    }

    if (isSecuritySessionActive && verificationTimeLeft > 0) {
      items.push(`当前安全会话还可使用 ${formatCountdown(verificationTimeLeft)}`);
    }

    return items;
  }, [changePwdMode, confirmNewPwd, email, emailChanged, isSecuritySessionActive, newPwd, verificationTimeLeft]);

  const handleResetForm = useCallback(() => {
    if (!profile) return;

    setEmail(profile.email);
    setPassword('');
    setNewPwd('');
    setConfirmNewPwd('');
    setChangePwdMode(false);
    resetVerificationState();
  }, [profile, resetVerificationState]);

  const handleScrollToLinkedAccounts = useCallback(() => {
    linkedAccountsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const displayedLinkedAccounts = useMemo<LinkedAccount[]>(() => {
    const defaults: LinkedAccount[] = [
      {
        provider: 'google',
        label: 'Google',
        status: 'unbound',
        canBind: true,
        canUnlink: false,
      },
      {
        provider: 'linuxdo',
        label: 'Linux.do',
        status: 'unbound',
        canBind: true,
        canUnlink: false,
      },
    ];

    return defaults.map((fallback) => linkedAccounts.find((account) => account.provider === fallback.provider) || fallback);
  }, [linkedAccounts]);

  const linkedAccountSummary = useMemo(() => {
    const bound = displayedLinkedAccounts.filter((account) => account.status === 'bound');
    if (bound.length === 0) return '未绑定第三方资料';
    return bound
      .map((account) => account.providerUsername ? `${account.label} / ${account.providerUsername}` : account.label)
      .join('、');
  }, [displayedLinkedAccounts]);

  const mergeItemTotal = useMemo(() => {
    return mergePreview?.mergeItems.reduce((sum, item) => sum + item.count, 0) || 0;
  }, [mergePreview]);

  const statusCards = useMemo(() => [
    {
      label: 'Account',
      value: profile?.username || '—',
      tone: 'border-slate-200 bg-slate-50/80',
    },
    {
      label: 'Provider',
      value: providerLabel,
      tone: 'border-slate-200 bg-slate-50/80',
    },
    {
      label: 'Security',
      value: isSecuritySessionActive && verificationTimeLeft > 0
        ? `安全会话 ${formatCountdown(verificationTimeLeft)}`
        : totpStatus?.enabled
          ? 'TOTP 已启用'
          : totpStatus?.hasPasskey
            ? 'Passkey 已启用'
            : '基础密码',
      tone: isSecuritySessionActive || totpStatus?.enabled || totpStatus?.hasPasskey
        ? 'border-emerald-200 bg-emerald-50/80'
        : 'border-slate-200 bg-slate-50/80',
    },
    {
      label: 'Status',
      value: profile?.accountStatus === 'suspended' ? '已暂停' : '正常',
      tone: profile?.accountStatus === 'suspended'
        ? 'border-rose-200 bg-rose-50/80'
        : 'border-slate-200 bg-slate-50/80',
    },
  ], [isSecuritySessionActive, profile, providerLabel, totpStatus, verificationTimeLeft]);

  // ── Error / loading states ──
  if (!isAuthenticated) {
    return (
      <div className={studioPageClassName} style={{ fontFamily: pageFont }}>
        <div className={cn(studioHeroCardClassName, 'mx-auto max-w-3xl text-center')}>
          <div className={studioEyebrowPillClassName}>Authentication</div>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl" style={{ fontFamily: displayFont }}>
            未登录或会话已过期
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-500 sm:text-base sm:leading-8">
            请重新登录后访问个人主页。
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={studioPageClassName} style={{ fontFamily: pageFont }}>
        <div className={cn(studioHeroCardClassName, 'mx-auto max-w-3xl text-center')}>
          <div className={studioEyebrowPillClassName}>Error</div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900 sm:text-2xl" style={{ fontFamily: displayFont }}>
            加载失败
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-500 sm:text-base sm:leading-8 whitespace-pre-line">
            请刷新页面或重新登录。
            {typeof loadError === 'string' && loadError !== '加载失败，请刷新页面或重新登录' ? `\n${loadError}` : ''}
          </p>
          <button
            onClick={() => {
              void loadProfile();
            }}
            className={cn(studioPrimaryButtonClassName, 'mt-6')}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (pageLoading || !profile) {
    if (loadTimeout) {
      return (
        <div className={studioPageClassName} style={{ fontFamily: pageFont }}>
          <div className={cn(studioHeroCardClassName, 'mx-auto max-w-3xl text-center')}>
            <div className={studioEyebrowPillClassName}>Timeout</div>
            <h1 className="mt-4 text-xl font-semibold text-slate-900" style={{ fontFamily: displayFont }}>
              加载超时
            </h1>
            <p className="mt-3 text-sm text-slate-500">请检查网络或刷新页面</p>
            <button
              onClick={() => {
                void loadProfile();
              }}
              className={cn(studioPrimaryButtonClassName, 'mt-6')}
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className={studioPageClassName} style={{ fontFamily: pageFont }}>
        <div className={cn(studioHeroCardClassName, 'mx-auto max-w-3xl')}>
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(studioPageClassName, 'max-w-5xl overflow-x-hidden')}
      style={{ fontFamily: pageFont }}
    >
      <div className="mx-auto max-w-4xl min-w-0">
        {/* ── Header ── */}
        <m.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className={cn('mb-5 sm:mb-8', studioHeroCardClassName)}
        >
          <div className={cn(studioAccentBlobBlueClassName, '-right-12 top-0')} aria-hidden />
          <div className={cn(studioAccentBlobSkyClassName, '-left-10 bottom-0')} aria-hidden />
          <div className="relative flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl min-w-0">
              <div className={cn('mb-3', studioEyebrowPillClassName)}>
                <FaUserCircle />
                Account Settings
              </div>
              <h1
                className="text-[2rem] font-semibold leading-[1.05] text-slate-900 sm:text-5xl sm:leading-tight"
                style={{ fontFamily: displayFont }}
              >
                个人主页
              </h1>
              <p className="mt-3 max-w-2xl text-[13px] leading-6 text-slate-600 sm:text-base sm:leading-7">
                管理您的个人信息、安全设置和账户偏好
              </p>
            </div>

            <div className="w-full lg:w-auto">
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
                {statusCards.map((item) => (
                  <div
                    key={item.label}
                    className={`min-w-0 rounded-[22px] border px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3 ${item.tone}`}
                  >
                    <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{item.label}</div>
                    <div className="mt-2 break-words text-sm font-semibold text-slate-800">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap justify-start gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={handleScrollToLinkedAccounts}
                  className={cn(studioPrimaryButtonClassName, 'px-4 py-2.5 text-xs sm:text-sm')}
                >
                  <FaLink />
                  绑定第三方账号
                </button>
              </div>
            </div>
          </div>
        </m.div>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          {/* ── Main form ── */}
          <m.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className={studioMainSurfaceClassName}
          >
            {/* Avatar section */}
            <div className="mb-6 flex flex-col items-center">
              <div className="relative mb-4 h-24 w-24 overflow-hidden rounded-full bg-slate-200 shadow-lg ring-4 ring-white">
                <Avatar src={avatarImg || profile?.avatarUrl} />
                <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition hover:opacity-100">
                  <FaCamera className="text-xl text-white" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                    disabled={submitting || avatarLoading}
                  />
                </label>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:text-xs">
                <FaCamera />
                {avatarLoading ? '上传中…' : '更换头像'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                  disabled={submitting || avatarLoading}
                />
              </label>
            </div>

            {/* Email field */}
            <section className="mb-4 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
              <label className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                <FaEnvelope />
                邮箱地址
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={studioFieldClassName}
                disabled={submitting}
                placeholder="请输入邮箱地址"
              />

              {/* Email change code */}
              {isSecuritySessionActive && emailChanged && (
                <div className="mt-4 rounded-[20px] border border-slate-200 bg-white/80 p-3.5 sm:p-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    新邮箱验证
                  </div>
                  <p className="mb-3 text-[13px] leading-6 text-slate-600">
                    修改邮箱需要验证新邮箱地址，请先发送验证码
                  </p>
                  <button
                    type="button"
                    onClick={handleSendEmailCode}
                    disabled={submitting || emailCodeCooldown > 0}
                    className={cn(studioPrimaryButtonClassName, 'px-4 py-2 text-xs disabled:opacity-60')}
                  >
                    {emailCodeCooldown > 0 ? `${emailCodeCooldown}s 后重新发送` : emailCodeSent ? '重新发送验证码' : '发送验证码'}
                  </button>
                  {emailCodeSent && (
                    <div className="mt-3">
                      <div className="mb-2 text-[11px] font-medium text-slate-500">输入验证码</div>
                      <input
                        type="text"
                        value={emailVerificationCode}
                        onChange={(e) => setEmailVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className={studioFieldClassName}
                        placeholder="请输入 6 位验证码"
                        maxLength={6}
                        disabled={submitting}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="mb-4 rounded-[24px] border border-slate-200 bg-white p-4 sm:rounded-[28px] sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    变更预览
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">待保存内容</div>
                </div>
                <button
                  type="button"
                  onClick={handleResetForm}
                  disabled={submitting}
                  className="inline-flex self-start items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FaUndoAlt />
                  重置表单
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {pendingChanges.length > 0 ? (
                  pendingChanges.map((item) => (
                    <div
                      key={item}
                    className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-white/80 px-3.5 py-3 text-[13px] text-slate-700 sm:text-sm"
                    >
                      <FaCheckCircle className="mt-0.5 shrink-0 text-emerald-500" />
                      <span>{item}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-start gap-3 rounded-[20px] border border-amber-100 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-700 sm:rounded-2xl sm:text-sm">
                    <FaExclamationCircle className="mt-0.5 shrink-0" />
                    <span>当前没有未保存的资料变更。邮箱修改、密码草稿和验证有效期会显示在这里。</span>
                  </div>
                )}
              </div>

              {isSecuritySessionActive && verificationTimeLeft > 0 && (
                <div className="mt-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] text-emerald-700 sm:rounded-2xl sm:text-sm">
                  <div className="flex items-center gap-2 font-semibold">
                    <FaClock />
                    身份验证有效期
                  </div>
                  <p className="mt-2 leading-6">
                    当前验证还剩 {formatCountdown(verificationTimeLeft)}，到期后需要重新完成身份验证。
                  </p>
                </div>
              )}
            </section>

            {/* Identity verification section */}
            <section className="mb-4 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <FaShieldAlt />
                    安全会话
                  </label>
                  <p className="mt-2 text-[13px] leading-6 text-slate-600 sm:text-sm">
                    先验证一次身份，邮箱、密码和第三方账号操作会复用同一安全会话。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={submitting}
                  className={cn(studioPrimaryButtonClassName, 'self-start px-4 py-2 text-xs disabled:opacity-60')}
                >
                  <FaShieldAlt />
                  {isSecuritySessionActive ? '会话有效' : '建立安全会话'}
                </button>
              </div>
              <div className={`mt-4 rounded-[20px] border px-3 py-3 text-[13px] font-medium sm:rounded-2xl sm:text-sm ${
                isSecuritySessionActive
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-amber-100 bg-amber-50 text-amber-700'
              }`}>
                {isSecuritySessionActive ? (
                  <>
                    <span className="mr-2">✓</span>
                    安全会话已建立
                    {verificationTimeLeft > 0 ? `，剩余 ${formatCountdown(verificationTimeLeft)}` : ''}
                  </>
                ) : (
                  <>
                    <FaExclamationCircle className="mr-2 inline" />
                    保存账号修改或绑定第三方账号前需要建立安全会话。
                  </>
                )}
              </div>
            </section>

            {/* Password change section */}
            <section className="mb-4 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  <FaKey />
                  修改密码
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (changePwdMode) {
                      setNewPwd('');
                      setConfirmNewPwd('');
                    }
                    setChangePwdMode(v => !v);
                  }}
                  className="inline-flex self-start items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  {changePwdMode ? '取消' : '修改密码'}
                </button>
              </div>
              {changePwdMode && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-[20px] border border-slate-200 bg-white/80 px-3.5 py-3 text-[13px] leading-6 text-slate-600 sm:text-sm">
                    密码修改会复用上方安全会话，不需要在这里再次输入旧密码。
                  </div>
                  <div>
                    <div className="mb-2 text-[11px] font-medium text-slate-500">新密码</div>
                    <input
                      type="password"
                      value={newPwd}
                      onChange={e => setNewPwd(e.target.value)}
                      className={studioFieldClassName}
                      disabled={submitting}
                      placeholder="请输入新密码（至少8位）"
                    />
                    <p className="mt-2 text-[11px] leading-5 text-slate-500">
                      后端会按强密码规则校验。至少 8 位，长度超过 12 位或包含数字、大小写、特殊字符会更稳妥。
                    </p>
                  </div>
                  <div>
                    <div className="mb-2 text-[11px] font-medium text-slate-500">确认新密码</div>
                    <input
                      type="password"
                      value={confirmNewPwd}
                      onChange={e => setConfirmNewPwd(e.target.value)}
                      className={studioFieldClassName}
                      disabled={submitting}
                      placeholder="请再次输入新密码"
                    />
                    {confirmNewPwd && (
                      <p className={`mt-2 text-[11px] leading-5 ${newPwd === confirmNewPwd ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {newPwd === confirmNewPwd ? '两次密码输入一致，可以提交。' : '两次输入的新密码不一致。'}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Save button */}
            <button
              type="button"
              onClick={handleUpdate}
              disabled={submitting || avatarLoading || (!emailChanged && !passwordChangeReady)}
              className={cn(studioPrimaryButtonClassName, 'w-full disabled:opacity-60 sm:py-3')}
            >
              {submitting && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>}
              <FaSave />
              {submitting ? '保存中…' : '保存账号修改'}
            </button>
          </m.div>

          {/* ── Sidebar ── */}
          <div className="min-w-0 space-y-4 sm:space-y-6">
            {/* Account info */}
            <m.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className={studioPanelClassName}
            >
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  账户信息
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">Account Overview</div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">用户名</span>
                  <span className="font-semibold text-slate-800">{profile.username}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">邮箱</span>
                  <span className="font-semibold text-slate-800 break-all">{profile.email}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">角色</span>
                  <span className="font-semibold text-slate-800">{profile.role === 'admin' ? '管理员' : '普通用户'}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">登录来源</span>
                  <span className="font-semibold text-slate-800">{providerLabel}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">注册时间</span>
                  <span className="font-semibold text-slate-800">{formatDateTime(profile.createdAt)}</span>
                </div>
              </div>
            </m.section>

            {/* Security status */}
            <m.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className={studioPanelClassName}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white sm:h-10 sm:w-10">
                  <FaShieldAlt />
                </div>
                <div>
                  <div className="text-lg font-semibold text-slate-900">安全状态</div>
                  <div className="text-sm text-slate-500">当前账户安全配置</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">TOTP 验证</span>
                  <span className={`font-semibold ${totpStatus?.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {totpStatus?.enabled ? '已启用' : '未启用'}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">Passkey</span>
                  <span className={`font-semibold ${totpStatus?.hasPasskey ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {totpStatus?.hasPasskey ? '已启用' : '未启用'}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">密码保护</span>
                  <span className="font-semibold text-emerald-600">已启用</span>
                </div>
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">账户状态</span>
                  <span className={`font-semibold ${profile.accountStatus === 'suspended' ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {profile.accountStatus === 'suspended' ? '已暂停' : '正常'}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">翻译权限</span>
                  <span className={`font-semibold ${profile.isTranslationEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {translationAccessLabel}
                  </span>
                </div>
              </div>
            </m.section>

            <m.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24 }}
              className={studioPanelClassName}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 sm:h-10 sm:w-10">
                  <FaHistory />
                </div>
                <div>
                  <div className="text-lg font-semibold text-slate-900">账户轨迹</div>
                  <div className="text-sm text-slate-500">最近登录和绑定信息</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">最近登录</span>
                  <span className="font-semibold text-slate-800">
                    {profile.lastLoginAt ? `${formatDateTime(profile.lastLoginAt)} · ${formatRelativeTime(profile.lastLoginAt)}` : '未记录'}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">最近登录 IP</span>
                  <span className="font-semibold text-slate-800 break-all">{profile.lastLoginIp || '未记录'}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm">
                  <span className="text-slate-500">权限来源</span>
                  <span className="font-semibold text-slate-800 inline-flex items-center gap-2">
                    <FaGlobe className="text-slate-400" />
                    {providerLabel}
                  </span>
                </div>
              </div>
            </m.section>

            <m.section
              ref={linkedAccountsSectionRef}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.27 }}
              className={studioPanelClassName}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 sm:h-10 sm:w-10">
                    <FaLink />
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-slate-900">第三方账号</div>
                    <div className="truncate text-sm text-slate-500">{linkedAccountSummary}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadLinkedAccounts()}
                  disabled={linkedAccountsLoading || submitting}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  title="刷新"
                >
                  <FaSyncAlt className={linkedAccountsLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="space-y-3">
                {displayedLinkedAccounts.map((account) => {
                  const isGoogle = account.provider === 'google';
                  const isBound = account.status === 'bound';
                  const isMergeRequired = account.status === 'merge_required';
                  const statusTone =
                    account.status === 'bound'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : account.status === 'merge_required'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : account.status === 'conflict'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-slate-200 bg-slate-50 text-slate-500';

                  return (
                    <div
                      key={account.provider}
                      className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-3.5"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                          {isGoogle ? <FaGoogle /> : <FaLink />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">{account.label}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone}`}>
                              {getLinkedAccountStatusLabel(account.status)}
                            </span>
                          </div>
                          <div className="mt-1 break-words text-[12px] leading-5 text-slate-500">
                            {account.providerUsername || account.providerEmail || account.conflictReason || '未绑定'}
                          </div>
                          {account.linkedAt && (
                            <div className="mt-1 text-[11px] text-slate-400">
                              {formatDateTime(account.linkedAt)}
                            </div>
                          )}
                        </div>
                      </div>

                      {googleBindActive && isGoogle && (
                        <div className="mt-3 rounded-[18px] border border-slate-200 bg-white p-2">
                          <div ref={googleBindButtonRef} className="flex min-h-[44px] w-full items-center justify-center" />
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleStartLinkedAccountBind(account.provider)}
                          disabled={submitting || !account.canBind}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isGoogle ? <FaGoogle /> : <FaExternalLinkAlt />}
                          {isBound ? '刷新' : '绑定'}
                        </button>
                        {isBound && (
                          <button
                            type="button"
                            onClick={() => void handleUnlinkLinkedAccount(account.provider)}
                            disabled={submitting || !account.canUnlink}
                            className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <FaUnlink />
                            解绑
                          </button>
                        )}
                        {isMergeRequired && (
                          <button
                            type="button"
                            onClick={() => void handleOpenMergePreview(account)}
                            disabled={submitting}
                            className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-2 text-[12px] font-semibold text-amber-700 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <FaExclamationCircle />
                            合并预览
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </m.section>

            {/* Tips */}
            <m.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.30 }}
              className={studioDarkPanelClassName}
            >
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                安全提示
              </div>
              <div className="space-y-2">
                {[
                  '建议启用 TOTP 或 Passkey 增强账户安全',
                  '定期更换密码，使用强密码组合',
                  '修改邮箱需要通过新邮箱验证码确认',
                  '所有敏感操作需先通过身份验证',
                ].map((tip) => (
                  <div
                    key={tip}
                    className="rounded-[20px] border border-white/10 bg-white/5 px-3.5 py-3 text-[13px] text-slate-200 sm:rounded-2xl sm:px-4 sm:text-sm"
                  >
                    {tip}
                  </div>
                ))}
              </div>
            </m.section>
          </div>
        </div>
      </div>

      {/* ── Verification method modal ── */}
      {showVerificationModal && (
        <div
          className={studioModalOverlayClassName}
          onClick={() => setShowVerificationModal(false)}
        >
          <m.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(studioModalCardClassName, 'm-4 max-w-md')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-white">
                <FaShieldAlt className="text-2xl" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900" style={{ fontFamily: displayFont }}>
                建立安全会话
              </h3>
              <p className="mt-2 text-sm text-slate-500">验证一次后，账号修改和第三方绑定会复用该会话</p>
            </div>

            <div className="space-y-4">
              {/* Password */}
              <div className="rounded-[22px] border border-slate-200 p-4 transition hover:border-slate-300">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100">
                    <FaLock className="text-sm text-slate-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">当前密码</div>
                    <div className="text-[11px] text-slate-500">使用登录密码建立 10 分钟安全会话</div>
                  </div>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={studioFieldClassName}
                  disabled={submitting}
                  placeholder="请输入当前密码"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={handlePasswordVerification}
                  disabled={submitting || !password}
                  className={cn(studioPrimaryButtonClassName, 'mt-3 w-full py-2.5 disabled:opacity-50')}
                >
                  {submitting ? '验证中…' : '使用密码验证'}
                </button>
              </div>

              {/* TOTP */}
              {totpStatus?.enabled && (
                <div className="rounded-[22px] border border-slate-200 p-4 transition hover:border-slate-300">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100">
                      <FaShieldAlt className="text-sm text-sky-600" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">TOTP 验证码</div>
                      <div className="text-[11px] text-slate-500">使用认证器应用生成的6位验证码</div>
                    </div>
                  </div>
                  <VerifyCodeInput
                    length={6}
                    onComplete={setVerificationCode}
                    loading={submitting}
                    error={undefined}
                    inputClassName="bg-white border border-slate-200 text-slate-900 focus:ring-2 focus:ring-slate-400/30 focus:border-slate-400 rounded-lg px-2 py-1 text-sm transition-all outline-none mx-1"
                  />
                  <button
                    type="button"
                    onClick={handleTotpVerification}
                    disabled={submitting || verificationCode.length !== 6}
                    className={cn(studioPrimaryButtonClassName, 'mt-3 w-full py-2.5 disabled:opacity-50')}
                  >
                    {submitting ? '验证中…' : '使用 TOTP 验证'}
                  </button>
                </div>
              )}

              {/* Passkey */}
              {totpStatus?.hasPasskey && (
                <div className="rounded-[22px] border border-slate-200 p-4 transition hover:border-emerald-300/50">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100">
                      <FaLock className="text-sm text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Passkey 验证</div>
                      <div className="text-[11px] text-slate-500">使用生物识别或安全密钥进行验证</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handlePasskeyVerification}
                    disabled={submitting}
                    className={cn(studioPrimaryButtonClassName, 'w-full py-2.5 disabled:opacity-50')}
                  >
                    {submitting ? '验证中…' : '使用 Passkey 验证'}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setShowVerificationModal(false)}
                disabled={submitting}
                className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
              >
                取消
              </button>
            </div>
          </m.div>
        </div>
      )}

      {showMergeModal && mergePreview && (
        <div
          className={cn(studioModalOverlayClassName, 'overflow-y-auto')}
          onClick={() => setShowMergeModal(false)}
        >
          <m.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(studioModalCardClassName, 'max-w-2xl p-5 sm:p-7')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <FaExclamationCircle />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold text-slate-900" style={{ fontFamily: displayFont }}>
                  账号合并预览
                </h3>
                <div className="mt-1 text-sm text-slate-500">
                  {mergePreview.provider === 'google' ? 'Google' : 'Linux.do'} · {mergeItemTotal} 项
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">源账号</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{mergePreview.sourceAccount.username}</div>
                <div className="mt-1 break-all text-[12px] text-slate-500">{mergePreview.sourceAccount.email}</div>
                <div className="mt-2 text-[12px] text-slate-500">
                  {mergePreview.sourceAccount.role} · {mergePreview.sourceAccount.accountStatus}
                </div>
              </div>
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">目标账号</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{mergePreview.targetAccount.username}</div>
                <div className="mt-1 break-all text-[12px] text-slate-600">{mergePreview.targetAccount.email}</div>
                <div className="mt-2 text-[12px] text-slate-600">
                  {mergePreview.targetAccount.role} · {mergePreview.targetAccount.accountStatus}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">迁移项目</div>
              <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {mergePreview.mergeItems.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-[18px] border border-slate-100 bg-white px-3 py-2 text-[12px]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-800">{item.label}</span>
                      <span className="text-slate-400">{getMergeStrategyLabel(item.strategy)}</span>
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {mergePreview.riskItems.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-400">风险项</div>
                <div className="space-y-2">
                  {mergePreview.riskItems.map((risk) => (
                    <div
                      key={risk.key}
                      className={`rounded-[18px] border px-3 py-2 text-[12px] leading-5 ${
                        risk.blocking
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : risk.severity === 'high'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      <div className="font-semibold">{risk.label}</div>
                      <div>{risk.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 space-y-2 rounded-[20px] border border-slate-200 bg-slate-50/80 p-3.5 text-[13px] text-slate-700">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={includeApiKeysInMerge}
                  onChange={(event) => setIncludeApiKeysInMerge(event.target.checked)}
                  className="mt-0.5"
                />
                <span>迁移 API Key 和计费事件</span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={includeOAuthClientsInMerge}
                  onChange={(event) => setIncludeOAuthClientsInMerge(event.target.checked)}
                  className="mt-0.5"
                />
                <span>迁移 OAuth 应用；OAuth 授权和 Token 将撤销</span>
              </label>
              {mergePreview.requiresRiskAcknowledgement && (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={acknowledgeMergeRisks}
                    onChange={(event) => setAcknowledgeMergeRisks(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>确认风险项</span>
                </label>
              )}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowMergeModal(false)}
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmAccountMerge}
                disabled={
                  submitting ||
                  !mergePreview.canConfirm ||
                  (mergePreview.requiresRiskAcknowledgement && !acknowledgeMergeRisks)
                }
                className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                确认合并
              </button>
            </div>
          </m.div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
