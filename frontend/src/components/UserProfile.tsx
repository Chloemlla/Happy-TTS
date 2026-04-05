import React, { useEffect, useState, ChangeEvent, useRef, useCallback, useMemo } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { useNotification } from './Notification';
import { m } from 'framer-motion';
import VerifyCodeInput from './VerifyCodeInput';
import { LoadingSpinner } from './LoadingSpinner';
import getApiBaseUrl from '../api';
import { passkeyApi } from '../api/passkey';
import { openDB } from 'idb';
import { FaUser, FaUserCircle, FaShieldAlt, FaLock, FaEnvelope, FaCamera, FaSave, FaKey } from 'react-icons/fa';

interface UserProfileData {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  avatarHash?: string;
  role?: string;
}

interface TotpStatus {
  enabled: boolean;
  hasPasskey: boolean;
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

const getPasskeyAuthResponse = async (username: string) => {
  const optionsResponse = await passkeyApi.startAuthentication(username);
  const options = optionsResponse?.data?.options;
  if (!options) throw new Error('无法获取 Passkey 认证选项');
  return await startAuthentication({ optionsJSON: options });
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

const pageFont = '"Avenir Next","PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
const displayFont = '"Iowan Old Style","Noto Serif SC","Source Han Serif SC",serif';

const UserProfile: React.FC = () => {
  const { setNotification } = useNotification();

  // Core state
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadTimeout, setLoadTimeout] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');

  // Email change verification
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailCodeCooldown, setEmailCodeCooldown] = useState(0);

  // Authentication state
  const [totpStatus, setTotpStatus] = useState<TotpStatus | null>(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  // Password change state
  const [changePwdMode, setChangePwdMode] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');

  // Avatar state
  const [avatarImg, setAvatarImg] = useState<string | undefined>(undefined);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const avatarObjectUrlRef = useRef<string | undefined>(undefined);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Max file size and allowed types
  const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  const loadProfile = useCallback(async () => {
    setLoadError(null);
    setLoadTimeout(false);
    setLoading(true);

    const timeoutId = setTimeout(() => {
      setLoadTimeout(true);
      setLoading(false);
    }, 8000);

    try {
      const data = await fetchProfile();
      clearTimeout(timeoutId);
      setLoading(false);

      if (data) {
        setProfile(data);
        setEmail(data.email);
      } else {
        setLoadError('加载失败，请刷新页面或重新登录');
      }
    } catch (error) {
      clearTimeout(timeoutId);
      setLoading(false);

      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setLoadError(`加载失败：${errorMessage}`);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

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
      setTotpStatus({
        enabled: Boolean(data.enabled),
        hasPasskey: Boolean(data.hasPasskey)
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
    setLoading(true);
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
        await loadProfile();
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
      setLoading(false);
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2541b2]"></div>
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2541b2]"></div>
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

  // Verification flow
  const handleVerify = useCallback(async () => {
    if (!profile?.id) {
      setNotification({ message: '用户信息不完整', type: 'error' });
      return;
    }

    setLoading(true);

    try {
      const has2FA = totpStatus?.enabled || totpStatus?.hasPasskey;

      if (!has2FA) {
        if (!password) {
          setNotification({ message: '请输入当前密码', type: 'warning' });
          return;
        }
        const res = await verifyIdentity({ method: 'password', password });
        if (res.success && res.verificationToken) {
          setVerified(true);
          setVerificationToken(res.verificationToken);
          setNotification({ message: '密码验证成功，请继续修改', type: 'success' });
        }
        return;
      }

      if (totpStatus?.hasPasskey && !totpStatus?.enabled) {
        const username = profile.username;
        if (!username) throw new Error('无法获取用户名');
        const passkeyResponse = await getPasskeyAuthResponse(username);
        const res = await verifyIdentity({
          method: 'passkey',
          passkeyResponse,
          clientOrigin: window.location.origin,
        });
        if (res.success && res.verificationToken) {
          setVerified(true);
          setVerificationToken(res.verificationToken);
          setNotification({ message: 'Passkey 验证成功', type: 'success' });
        }
        return;
      }

      if (!totpStatus?.hasPasskey && totpStatus?.enabled) {
        if (!verificationCode) {
          setNotification({ message: '请输入验证码', type: 'warning' });
          return;
        }
        const res = await verifyIdentity({ method: 'totp', verificationCode });
        if (res.success && res.verificationToken) {
          setVerified(true);
          setVerificationToken(res.verificationToken);
          setNotification({ message: '验证成功，请继续修改', type: 'success' });
        }
        return;
      }

      if (totpStatus?.hasPasskey && totpStatus?.enabled) {
        setShowVerificationModal(true);
        return;
      }
    } catch (error) {
      console.error('[UserProfile] Verification error:', error);
      const errorMessage = error instanceof Error ? error.message : '验证失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [profile, totpStatus, verificationCode, password, setNotification]);

  // Send email verification code
  const handleSendEmailCode = useCallback(async () => {
    if (!verificationToken) {
      setNotification({ message: '请先完成身份验证', type: 'warning' });
      return;
    }
    if (!email || !emailChanged) {
      setNotification({ message: '请输入新邮箱地址', type: 'warning' });
      return;
    }

    setLoading(true);
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
      setLoading(false);
    }
  }, [verificationToken, email, emailChanged, setNotification]);

  // Profile update
  const handleUpdate = useCallback(async () => {
    const has2FA = totpStatus?.enabled || totpStatus?.hasPasskey;

    if (!has2FA && !verified) {
      if (!password) {
        setNotification({ message: '请输入当前密码', type: 'warning' });
        return;
      }
    } else if (has2FA && !verified) {
      setNotification({ message: '请先通过二次验证', type: 'warning' });
      return;
    }

    if (emailChanged && !emailVerificationCode) {
      setNotification({ message: '请输入新邮箱验证码', type: 'warning' });
      return;
    }

    setLoading(true);

    try {
      const updateData: Record<string, string | undefined> = {};

      if (emailChanged) updateData.email = email.trim().toLowerCase();
      if (newPassword) updateData.newPassword = newPassword;
      if (verificationToken) updateData.verificationToken = verificationToken;
      if (!has2FA && password) updateData.password = password;
      if (emailChanged && emailVerificationCode) {
        updateData.emailVerificationCode = emailVerificationCode;
      }

      await updateProfile(updateData);
      setNotification({ message: '信息修改成功', type: 'success' });

      await loadProfile();

      setPassword('');
      setNewPassword('');
      setVerified(false);
      setVerificationToken('');
      setVerificationCode('');
      setEmailVerificationCode('');
      setEmailCodeSent(false);
    } catch (error) {
      console.error('[UserProfile] Update error:', error);
      const errorMessage = error instanceof Error ? error.message : '更新失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [totpStatus, password, verified, email, emailChanged, newPassword, verificationToken, emailVerificationCode, setNotification, loadProfile]);

  // Password change
  const handleChangePassword = useCallback(async () => {
    if (!verified && !oldPwd) {
      setNotification({ message: '请输入旧密码', type: 'warning' });
      return;
    }
    if (!newPwd) {
      setNotification({ message: '请输入新密码', type: 'warning' });
      return;
    }
    if (newPwd.length < 6) {
      setNotification({ message: '新密码长度至少6位', type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      await updateProfile({
        password: verified ? undefined : oldPwd,
        newPassword: newPwd,
        verificationToken: verified ? verificationToken : undefined,
      });

      setNotification({ message: '密码修改成功', type: 'success' });
      setChangePwdMode(false);
      setOldPwd('');
      setNewPwd('');
    } catch (error) {
      console.error('[UserProfile] Password change error:', error);
      const errorMessage = error instanceof Error ? error.message : '密码修改失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [oldPwd, newPwd, verified, verificationToken, setNotification]);

  // TOTP verification in modal
  const handleTotpVerification = useCallback(async () => {
    if (!profile?.id || !verificationCode) {
      setNotification({ message: '请输入验证码', type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      const res = await verifyIdentity({ method: 'totp', verificationCode });
      if (res.success && res.verificationToken) {
        setVerified(true);
        setVerificationToken(res.verificationToken);
        setShowVerificationModal(false);
        setNotification({ message: '验证成功，请继续修改', type: 'success' });
      }
    } catch (error) {
      console.error('[UserProfile] TOTP verification error:', error);
      const errorMessage = error instanceof Error ? error.message : '验证失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [profile, verificationCode, setNotification]);

  // Passkey verification in modal
  const handlePasskeyVerification = useCallback(async () => {
    if (!profile?.username) {
      setNotification({ message: '无法获取用户名', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const passkeyResponse = await getPasskeyAuthResponse(profile.username);
      const res = await verifyIdentity({
        method: 'passkey',
        passkeyResponse,
        clientOrigin: window.location.origin,
      });
      if (res.success && res.verificationToken) {
        setVerified(true);
        setVerificationToken(res.verificationToken);
        setShowVerificationModal(false);
        setNotification({ message: 'Passkey 验证成功，请继续修改', type: 'success' });
      }
    } catch (error) {
      console.error('[UserProfile] Passkey verification error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Passkey 验证失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [profile, setNotification]);

  const isAuthenticated = useMemo(() => {
    return Boolean(localStorage.getItem('token'));
  }, []);

  const statusCards = useMemo(() => [
    {
      label: 'Account',
      value: profile?.username || '—',
      tone: 'border-sky-100 bg-[linear-gradient(145deg,rgba(240,249,255,0.94),rgba(255,255,255,0.98))]',
    },
    {
      label: 'Role',
      value: profile?.role === 'admin' ? '管理员' : '普通用户',
      tone: 'border-violet-100 bg-[linear-gradient(145deg,rgba(245,243,255,0.94),rgba(255,255,255,0.98))]',
    },
    {
      label: 'Security',
      value: totpStatus?.enabled ? 'TOTP 已启用' : totpStatus?.hasPasskey ? 'Passkey 已启用' : '基础密码',
      tone: 'border-emerald-100 bg-[linear-gradient(145deg,rgba(236,253,245,0.94),rgba(255,255,255,0.98))]',
    },
  ], [profile, totpStatus]);

  // ── Error / loading states ──
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-8 rounded-3xl lg:px-10 bg-[radial-gradient(circle_at_top,_rgba(68,92,190,0.16),_transparent_32%),linear-gradient(180deg,#eef2ff_0%,#f9fafb_42%,#eef4ff_100%)]" style={{ fontFamily: pageFont }}>
        <div className="mx-auto max-w-3xl rounded-[28px] border border-rose-100 bg-white p-6 text-center shadow-xl sm:rounded-[32px] sm:p-10">
          <div className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-400">Authentication</div>
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
      <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-8 rounded-3xl lg:px-10 bg-[radial-gradient(circle_at_top,_rgba(68,92,190,0.16),_transparent_32%),linear-gradient(180deg,#eef2ff_0%,#f9fafb_42%,#eef4ff_100%)]" style={{ fontFamily: pageFont }}>
        <div className="mx-auto max-w-3xl rounded-[28px] border border-rose-100 bg-white p-6 text-center shadow-xl sm:rounded-[32px] sm:p-10">
          <div className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-400">Error</div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900 sm:text-2xl" style={{ fontFamily: displayFont }}>
            加载失败
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-500 sm:text-base sm:leading-8 whitespace-pre-line">
            请刷新页面或重新登录。
            {typeof loadError === 'string' && loadError !== '加载失败，请刷新页面或重新登录' ? `\n${loadError}` : ''}
          </p>
          <button
            onClick={loadProfile}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#2541b2] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#2541b2]/20 transition hover:bg-[#1f3794]"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (loading || !profile) {
    if (loadTimeout) {
      return (
        <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-8 rounded-3xl lg:px-10 bg-[radial-gradient(circle_at_top,_rgba(68,92,190,0.16),_transparent_32%),linear-gradient(180deg,#eef2ff_0%,#f9fafb_42%,#eef4ff_100%)]" style={{ fontFamily: pageFont }}>
          <div className="mx-auto max-w-3xl rounded-[28px] border border-amber-100 bg-white p-6 text-center shadow-xl sm:rounded-[32px] sm:p-10">
            <div className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">Timeout</div>
            <h1 className="mt-4 text-xl font-semibold text-slate-900" style={{ fontFamily: displayFont }}>
              加载超时
            </h1>
            <p className="mt-3 text-sm text-slate-500">请检查网络或刷新页面</p>
            <button
              onClick={loadProfile}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#2541b2] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#2541b2]/20 transition hover:bg-[#1f3794]"
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-8 rounded-3xl lg:px-10 bg-[radial-gradient(circle_at_top,_rgba(68,92,190,0.16),_transparent_32%),linear-gradient(180deg,#eef2ff_0%,#f9fafb_42%,#eef4ff_100%)]" style={{ fontFamily: pageFont }}>
        <div className="mx-auto max-w-3xl rounded-[28px] border border-white/70 bg-white/75 p-8 shadow-xl backdrop-blur-xl sm:rounded-[32px]">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(68,92,190,0.16),_transparent_32%),linear-gradient(180deg,#eef2ff_0%,#f9fafb_42%,#eef4ff_100%)] px-3 py-4 sm:px-6 sm:py-8 rounded-3xl lg:px-10"
      style={{ fontFamily: pageFont }}
    >
      <div className="mx-auto max-w-4xl min-w-0">
        {/* ── Header ── */}
        <m.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-5 rounded-[28px] border border-white/70 bg-white/75 p-4 shadow-[0_24px_90px_rgba(32,48,90,0.12)] backdrop-blur-xl sm:mb-8 sm:rounded-[32px] sm:p-8 sm:shadow-[0_30px_120px_rgba(32,48,90,0.14)]"
        >
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl min-w-0">
              <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 sm:px-3 sm:text-xs sm:tracking-[0.18em]">
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
              <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
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
            </div>
          </div>
        </m.div>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          {/* ── Main form ── */}
          <m.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="min-w-0 rounded-[28px] border border-slate-200/80 bg-white/85 p-4 shadow-[0_20px_70px_rgba(32,48,90,0.1)] backdrop-blur-xl sm:rounded-[34px] sm:p-6 sm:shadow-[0_24px_90px_rgba(32,48,90,0.1)]"
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
                    disabled={loading || avatarLoading}
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
                  disabled={loading || avatarLoading}
                />
              </label>
            </div>

            {/* Email field */}
            <section className="mb-4 rounded-[24px] border border-slate-200 bg-[#fbfcff] p-4 sm:rounded-[28px] sm:p-5">
              <label className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                <FaEnvelope />
                邮箱地址
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#2541b2] focus:ring-2 focus:ring-[#2541b2]/20 sm:rounded-full"
                disabled={loading}
                placeholder="请输入邮箱地址"
              />

              {/* Email change code */}
              {verified && emailChanged && (
                <div className="mt-4 rounded-[20px] border border-sky-200 bg-sky-50 p-3.5 sm:rounded-2xl sm:p-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600">
                    新邮箱验证
                  </div>
                  <p className="mb-3 text-[13px] leading-6 text-slate-600">
                    修改邮箱需要验证新邮箱地址，请先发送验证码
                  </p>
                  <button
                    type="button"
                    onClick={handleSendEmailCode}
                    disabled={loading || emailCodeCooldown > 0}
                    className="inline-flex items-center gap-2 rounded-full bg-[#2541b2] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[#2541b2]/20 transition hover:bg-[#1f3794] disabled:cursor-not-allowed disabled:opacity-60"
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
                        className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#2541b2] focus:ring-2 focus:ring-[#2541b2]/20 sm:rounded-full"
                        placeholder="请输入 6 位验证码"
                        maxLength={6}
                        disabled={loading}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Identity verification section */}
            <section className="mb-4 rounded-[24px] border border-slate-200 bg-[#fbfcff] p-4 sm:rounded-[28px] sm:p-5">
              {!totpStatus?.enabled && !totpStatus?.hasPasskey ? (
                <>
                  <label className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <FaLock />
                    当前密码
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#2541b2] focus:ring-2 focus:ring-[#2541b2]/20 sm:rounded-full"
                    disabled={loading}
                    placeholder="请输入当前密码用于身份验证"
                  />
                  {!verified && (
                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={loading || !password}
                      className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaShieldAlt />
                      {loading ? '验证中…' : '验证身份'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <label className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <FaShieldAlt />
                    二次验证
                  </label>
                  <div className="mb-3 rounded-[20px] border border-sky-200 bg-sky-50 p-3.5 text-[13px] leading-6 text-sky-700 sm:rounded-2xl sm:p-4 sm:text-sm sm:leading-7">
                    检测到您已启用二次验证，请完成验证后再修改信息
                  </div>
                  {totpStatus?.enabled && (
                    <div className="mb-3">
                      <VerifyCodeInput
                        length={6}
                        onComplete={setVerificationCode}
                        loading={loading}
                        error={undefined}
                        inputClassName="bg-white border border-slate-200 text-slate-900 focus:ring-2 focus:ring-[#2541b2]/20 focus:border-[#2541b2] rounded-lg px-3 py-2 text-lg transition-all outline-none mx-1"
                      />
                    </div>
                  )}
                  {!verified && (
                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={loading || (totpStatus?.enabled && verificationCode.length !== 6)}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaShieldAlt />
                      {loading ? '验证中…' : '验证'}
                    </button>
                  )}
                </>
              )}
              {verified && (
                <div className="mt-3 rounded-[20px] border border-emerald-200 bg-emerald-50 px-3 py-3 text-[13px] font-medium text-emerald-700 sm:rounded-2xl sm:text-sm">
                  <span className="mr-2">✓</span>身份验证成功，现在可以修改信息
                </div>
              )}
            </section>

            {/* Password change section */}
            <section className="mb-4 rounded-[24px] border border-slate-200 bg-[#fbfcff] p-4 sm:rounded-[28px] sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  <FaKey />
                  修改密码
                </label>
                <button
                  type="button"
                  onClick={() => setChangePwdMode(v => !v)}
                  className="inline-flex self-start items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  {changePwdMode ? '取消' : '修改密码'}
                </button>
              </div>
              {changePwdMode && (
                <div className="mt-4 space-y-3">
                  {!verified && (
                    <div>
                      <div className="mb-2 text-[11px] font-medium text-slate-500">旧密码</div>
                      <input
                        type="password"
                        value={oldPwd}
                        onChange={e => setOldPwd(e.target.value)}
                        className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#2541b2] focus:ring-2 focus:ring-[#2541b2]/20 sm:rounded-full"
                        disabled={loading}
                        placeholder="请输入当前密码"
                      />
                    </div>
                  )}
                  <div>
                    <div className="mb-2 text-[11px] font-medium text-slate-500">新密码</div>
                    <input
                      type="password"
                      value={newPwd}
                      onChange={e => setNewPwd(e.target.value)}
                      className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#2541b2] focus:ring-2 focus:ring-[#2541b2]/20 sm:rounded-full"
                      disabled={loading}
                      placeholder="请输入新密码（至少6位）"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={loading || (!verified && !oldPwd) || !newPwd}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-[#2541b2] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#2541b2]/20 transition hover:bg-[#1f3794] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:rounded-full sm:py-2"
                  >
                    <FaSave />
                    保存新密码
                  </button>
                </div>
              )}
            </section>

            {/* Save button */}
            <button
              type="button"
              onClick={handleUpdate}
              disabled={loading || avatarLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-[#2541b2] px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#2541b2]/20 transition hover:bg-[#1f3794] disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-full sm:py-3"
            >
              {loading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>}
              <FaSave />
              {loading ? '保存中…' : '保存修改'}
            </button>
          </m.div>

          {/* ── Sidebar ── */}
          <div className="min-w-0 space-y-4 sm:space-y-6">
            {/* Account info */}
            <m.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className="rounded-[26px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_20px_70px_rgba(32,48,90,0.08)] backdrop-blur-xl sm:rounded-[30px] sm:p-5"
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
              </div>
            </m.section>

            {/* Security status */}
            <m.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="rounded-[26px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_20px_70px_rgba(32,48,90,0.08)] backdrop-blur-xl sm:rounded-[30px] sm:p-5"
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
              </div>
            </m.section>

            {/* Tips */}
            <m.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24 }}
              className="rounded-[26px] border border-slate-200/80 bg-[#111827] p-4 text-white shadow-[0_20px_70px_rgba(17,24,39,0.18)] sm:rounded-[30px] sm:p-5"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowVerificationModal(false)}
        >
          <m.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="m-4 w-full max-w-md rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_30px_120px_rgba(32,48,90,0.2)] sm:rounded-[32px] sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-white">
                <FaShieldAlt className="text-2xl" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900" style={{ fontFamily: displayFont }}>
                选择验证方式
              </h3>
              <p className="mt-2 text-sm text-slate-500">为 {profile.username} 选择一种验证方式</p>
            </div>

            <div className="space-y-4">
              {/* TOTP */}
              <div className="rounded-[22px] border border-slate-200 p-4 transition hover:border-[#2541b2]/30">
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
                  loading={loading}
                  error={undefined}
                  inputClassName="bg-white border border-slate-200 text-slate-900 focus:ring-2 focus:ring-[#2541b2]/20 focus:border-[#2541b2] rounded-lg px-2 py-1 text-sm transition-all outline-none mx-1"
                />
                <button
                  type="button"
                  onClick={handleTotpVerification}
                  disabled={loading || verificationCode.length !== 6}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-[#2541b2] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#2541b2]/20 transition hover:bg-[#1f3794] disabled:opacity-50 sm:rounded-full sm:py-2"
                >
                  {loading ? '验证中…' : '使用 TOTP 验证'}
                </button>
              </div>

              {/* Passkey */}
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
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50 sm:rounded-full sm:py-2"
                >
                  {loading ? '验证中…' : '使用 Passkey 验证'}
                </button>
              </div>
            </div>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setShowVerificationModal(false)}
                disabled={loading}
                className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
              >
                取消
              </button>
            </div>
          </m.div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
