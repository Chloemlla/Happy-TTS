import React, { useEffect, useState, ChangeEvent, useRef, useCallback, useMemo } from 'react';
import { useNotification } from './Notification';
import { motion } from 'framer-motion';
import VerifyCodeInput from './VerifyCodeInput';
import { LoadingSpinner } from './LoadingSpinner';
import getApiBaseUrl from '../api';
import { openDB } from 'idb';
import { usePasskey } from '../hooks/usePasskey';
import { FaUser, FaUserCircle, FaShieldAlt, FaLock, FaEnvelope, FaCamera, FaEdit, FaSave, FaTimes } from 'react-icons/fa';

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
  success: boolean;
  data?: T;
  error?: string;
  retryable?: boolean;
  detail?: string;
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

const updateProfile = async (data: Partial<UserProfileData> & {
  password?: string;
  newPassword?: string;
  verificationCode?: string;
}): Promise<ApiResponse> => {
  try {
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
    if (!res.ok) {
      throw new Error(result.error || `Request failed: ${res.status}`);
    }

    return result;
  } catch (error) {
    console.error('[UserProfile] updateProfile error:', error);
    throw error;
  }
};

const verifyUser = async (verificationCode: string, userId: string): Promise<ApiResponse> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('No authentication token');

    const res = await fetch(`${getApiBaseUrl()}/api/user/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId, verificationCode }),
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Verification failed');
    }

    return result;
  } catch (error) {
    console.error('[UserProfile] verifyUser error:', error);
    throw error;
  }
};

const AVATAR_DB = 'avatar-store';
const AVATAR_STORE = 'avatars';

// Optimized avatar caching with proper error handling
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

const UserProfile: React.FC = () => {
  const { setNotification } = useNotification();
  const { authenticateWithPasskey } = usePasskey();

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

  // Authentication state
  const [totpStatus, setTotpStatus] = useState<TotpStatus | null>(null);

  // Password change state
  const [changePwdMode, setChangePwdMode] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');

  // Avatar state - simplified and optimized
  const [avatarImg, setAvatarImg] = useState<string | undefined>(undefined);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const avatarObjectUrlRef = useRef<string | undefined>(undefined);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Optimized profile loading with proper error handling
  const loadProfile = useCallback(async () => {
    setLoadError(null);
    setLoadTimeout(false);
    setLoading(true);

    const timeoutId = setTimeout(() => {
      setLoadTimeout(true);
      setLoading(false);
    }, 8000); // 8 second timeout

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

  // Optimized TOTP/Passkey status fetching
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

  // Refresh profile after verification
  useEffect(() => {
    if (verified) {
      loadProfile();
    }
  }, [verified, loadProfile]);

  // Optimized avatar loading logic
  const loadAvatar = useCallback(async (profile: UserProfileData) => {
    if (!profile.avatarUrl || !profile.id) {
      setAvatarImg(undefined);
      return;
    }

    setAvatarLoading(true);

    try {
      // Clean up previous object URL
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = undefined;
      }

      // Direct HTTP/HTTPS URLs - use directly
      if (/^https?:\/\//.test(profile.avatarUrl)) {
        setAvatarImg(profile.avatarUrl);
        setAvatarLoading(false);
        return;
      }

      // Try cached avatar first if we have avatarHash
      if (profile.avatarHash) {
        const cached = await getCachedAvatar(profile.id, profile.avatarHash);
        if (cached && cached.startsWith('blob:')) {
          setAvatarImg(cached);
          setAvatarLoading(false);
          return;
        }
      }

      // Fallback: fetch and create blob URL
      const response = await fetch(profile.avatarUrl);
      if (!response.ok) throw new Error('Failed to load avatar');

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      avatarObjectUrlRef.current = objectUrl;
      setAvatarImg(objectUrl);

      // Cache the blob URL if we have avatarHash
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
      // Cleanup on unmount
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = undefined;
      }
    };
  }, [profile, loadAvatar]);


  // 新增头像上传限制
  const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  // Optimized avatar upload logic
  const handleAvatarChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Frontend file validation
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
        // Update profile with new avatar URL
        setProfile((prev) => prev ? {
          ...prev,
          avatarUrl: result.avatarUrl,
          avatarHash: result.avatarHash
        } : prev);

        setNotification({ message: '头像上传成功', type: 'success' });

        // Refresh profile to get latest data
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

      setNotification({
        message: errorMessage,
        type: 'error'
      });
    } finally {
      setLoading(false);
      setAvatarLoading(false);
    }
  }, [setNotification, loadProfile]);

  // Optimized Avatar component with loading state
  const Avatar = useMemo(() => {
    return ({ src }: { src?: string }) => {
      const [error, setError] = useState(false);
      const [imageLoading, setImageLoading] = useState(true);

      if (!src || error) {
        return (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            {avatarLoading ? (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            ) : (
              <FaUser className="text-3xl text-gray-500" />
            )}
          </div>
        );
      }

      return (
        <div className="relative w-full h-full">
          {imageLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}
          <img
            src={src}
            alt="头像"
            className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoading ? 'opacity-0' : 'opacity-100'
              }`}
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

  // Optimized verification flow
  const handleVerify = useCallback(async () => {
    if (!profile?.id) {
      setNotification({ message: '用户信息不完整', type: 'error' });
      return;
    }

    setLoading(true);

    try {
      if (totpStatus?.hasPasskey && !totpStatus?.enabled) {
        // Passkey only verification
        const username = profile.username;
        if (!username) throw new Error('无法获取用户名');

        const success = await authenticateWithPasskey(username);
        if (success) {
          setVerified(true);
          setNotification({ message: 'Passkey 验证成功', type: 'success' });
        } else {
          setNotification({ message: 'Passkey 验证失败', type: 'error' });
        }
        return;
      }

      if (!totpStatus?.hasPasskey && totpStatus?.enabled) {
        // TOTP only verification
        if (!verificationCode) {
          setNotification({ message: '请输入验证码', type: 'warning' });
          return;
        }

        const res = await verifyUser(verificationCode, profile.id);
        if (res.success) {
          setVerified(true);
          setNotification({ message: '验证成功，请继续修改', type: 'success' });
        } else {
          setNotification({ message: res.error || '验证失败', type: 'error' });
        }
        return;
      }

      if (totpStatus?.hasPasskey && totpStatus?.enabled) {
        // Both methods available - could extend with selection modal
        setNotification({ message: '已同时设置 Passkey 和 TOTP，请在安全设置中选择验证方式。', type: 'info' });
        return;
      }

      // No 2FA - verify with current password
      if (!totpStatus?.hasPasskey && !totpStatus?.enabled) {
        if (!password) {
          setNotification({ message: '请输入当前密码', type: 'warning' });
          return;
        }

        const res = await updateProfile({ password });
        if (res && !res.error) {
          setVerified(true);
          setNotification({ message: '密码验证成功，请继续修改', type: 'success' });
        } else {
          setNotification({ message: res?.error || '密码验证失败', type: 'error' });
        }
        return;
      }

      setNotification({ message: '未检测到二次验证方式', type: 'error' });
    } catch (error) {
      console.error('[UserProfile] Verification error:', error);
      const errorMessage = error instanceof Error ? error.message : '验证失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [profile, totpStatus, verificationCode, password, authenticateWithPasskey, setNotification]);

  // Optimized profile update logic
  const handleUpdate = useCallback(async () => {
    // Validation
    if (totpStatus && !totpStatus.enabled && !totpStatus.hasPasskey) {
      if (!password) {
        setNotification({ message: '请输入当前密码', type: 'warning' });
        return;
      }
    } else {
      if (!verified) {
        setNotification({ message: '请先通过二次验证', type: 'warning' });
        return;
      }
    }

    setLoading(true);

    try {
      const updateData = {
        email,
        password: totpStatus && !totpStatus.enabled && !totpStatus.hasPasskey ? password : undefined,
        newPassword: newPassword || undefined,
        verificationCode: totpStatus && (totpStatus.enabled || totpStatus.hasPasskey) ? verificationCode : undefined,
      };

      const res = await updateProfile(updateData);

      setNotification({ message: '信息修改成功', type: 'success' });

      // Refresh profile data
      await loadProfile();

      // Reset form state
      setPassword('');
      setNewPassword('');
      setVerified(false);
      setVerificationCode('');
    } catch (error) {
      console.error('[UserProfile] Update error:', error);
      const errorMessage = error instanceof Error ? error.message : '更新失败';
      setNotification({ message: errorMessage, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [totpStatus, password, verified, email, newPassword, verificationCode, setNotification, loadProfile]);

  // Optimized password change logic
  const handleChangePassword = useCallback(async () => {
    if (!oldPwd || !newPwd) {
      setNotification({ message: '请输入旧密码和新密码', type: 'warning' });
      return;
    }

    if (newPwd.length < 6) {
      setNotification({ message: '新密码长度至少6位', type: 'warning' });
      return;
    }

    setLoading(true);

    try {
      await updateProfile({
        password: oldPwd,
        newPassword: newPwd
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
  }, [oldPwd, newPwd, setNotification]);

  // Memoized authentication check
  const isAuthenticated = useMemo(() => {
    return Boolean(localStorage.getItem('token'));
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4 rounded-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8">
            <div className="p-8 text-center text-red-500">未登录或会话已过期，请重新登录。</div>
          </div>
        </div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4 rounded-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8">
            <div className="p-8 text-center text-red-500 whitespace-pre-line">
              加载失败，请刷新页面或重新登录。
              {typeof loadError === 'string' && loadError !== '加载失败，请刷新页面或重新登录' ? `\n详细信息：${loadError}` : ''}
            </div>
            <div className="text-center mt-4">
              <button
                onClick={loadProfile}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                重试
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (loading || !profile) {
    if (loadTimeout) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4 rounded-lg">
          <div className="max-w-7xl mx-auto px-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8">
              <div className="p-8 text-center text-red-500">加载超时，请检查网络或刷新页面</div>
              <div className="text-center mt-4">
                <button
                  onClick={loadProfile}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  重试
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4 rounded-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8">
            <LoadingSpinner />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4 rounded-lg">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        {/* 统一的标题部分 */}
        <motion.div
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
            <div className="text-center">
              <motion.div
                className="flex items-center justify-center gap-3 mb-4"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <FaUserCircle className="text-4xl" />
                <h1 className="text-4xl font-bold">个人主页</h1>
              </motion.div>
              <motion.p
                className="text-blue-100 text-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                管理您的个人信息和账户设置
              </motion.p>
            </div>
          </div>
        </motion.div>

        {/* 个人信息区域 */}
        <motion.div
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="p-6">
            <div className="flex items-center gap-2 mb-6 p-3 bg-gray-50 rounded-lg">
              <FaUser className="text-blue-600" />
              <span className="font-semibold text-gray-800">个人信息</span>
            </div>
            <motion.div
              className="flex flex-col items-center mb-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <motion.div
                className="relative w-24 h-24 rounded-full bg-gray-200 overflow-hidden mb-4 shadow-lg"
                whileHover={{ scale: 1.05, rotate: 2 }}
                whileTap={{ scale: 0.97, rotate: -2 }}
              >
                <Avatar src={avatarImg || profile?.avatarUrl} />
                <motion.div
                  className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                  whileHover={{ opacity: 1 }}
                >
                  <FaCamera className="text-white text-xl" />
                </motion.div>
              </motion.div>
              <motion.label
                className="mb-4 cursor-pointer inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 rounded-lg hover:from-blue-100 hover:to-purple-100 transition-all font-medium shadow-sm border border-blue-200"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <FaCamera className="mr-2" />
                {avatarLoading ? '上传中...' : '更换头像'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                  disabled={loading || avatarLoading}
                />
              </motion.label>
              <div className="text-lg font-semibold text-gray-800">{profile.username}</div>
              <div className="text-gray-500 text-sm px-3 py-1 bg-gray-100 rounded-full">
                {profile.role === 'admin' ? '管理员' : '普通用户'}
              </div>
            </motion.div>
            <motion.div className="mb-6" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
              <label className="flex items-center gap-2 text-gray-700 mb-2 font-medium">
                <FaEnvelope className="text-blue-600" />
                邮箱地址
              </label>
              <motion.input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all bg-white/50 backdrop-blur-sm"
                whileFocus={{ scale: 1.02 }}
                disabled={loading}
                placeholder="请输入邮箱地址"
              />
            </motion.div>
            {totpStatus && !totpStatus.enabled && !totpStatus.hasPasskey ? (
              <motion.div className="mb-6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.24 }}>
                <label className="flex items-center gap-2 text-gray-700 mb-2 font-medium">
                  <FaLock className="text-blue-600" />
                  当前密码（未绑定二次认证时用于身份校验）
                </label>
                <motion.input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all bg-white/50 backdrop-blur-sm"
                  whileFocus={{ scale: 1.02 }}
                />
              </motion.div>
            ) : (
              <motion.div className="mb-6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.24 }}>
                <label className="flex items-center gap-2 text-gray-700 mb-2 font-medium">
                  <FaShieldAlt className="text-blue-600" />
                  二次验证（TOTP/Passkey）
                </label>
                <VerifyCodeInput
                  length={8}
                  onComplete={setVerificationCode}
                  loading={loading}
                  error={undefined}
                  inputClassName="bg-white/50 backdrop-blur-sm border-2 border-blue-400 text-blue-700 focus:ring-2 focus:ring-blue-400 focus:border-blue-500 placeholder-blue-200 rounded-lg px-3 py-2 text-lg transition-all outline-none mx-1"
                />
                <motion.button
                  onClick={handleVerify}
                  className="mt-3 px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 shadow-lg font-medium"
                  disabled={loading || verificationCode.length !== 8}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  验证
                </motion.button>
              </motion.div>
            )}
            <div className="mb-6">
              <motion.button
                className="px-6 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg hover:from-gray-600 hover:to-gray-700 transition font-medium shadow-lg"
                onClick={() => setChangePwdMode(v => !v)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {changePwdMode ? '取消修改密码' : '修改密码'}
              </motion.button>
            </div>
            {changePwdMode && (
              <motion.div className="mb-6 p-4 bg-gray-50 rounded-lg" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
                <div className="flex items-center gap-2 mb-4">
                  <FaLock className="text-blue-600" />
                  <span className="font-semibold text-gray-800">修改密码</span>
                </div>
                <label className="block text-gray-700 mb-2 font-medium">旧密码</label>
                <motion.input
                  type="password"
                  value={oldPwd}
                  onChange={e => setOldPwd(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all mb-4 bg-white/50 backdrop-blur-sm"
                  disabled={loading}
                  placeholder="请输入当前密码"
                  whileFocus={{ scale: 1.02 }}
                />
                <label className="block text-gray-700 mb-2 font-medium">新密码</label>
                <motion.input
                  type="password"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all mb-4 bg-white/50 backdrop-blur-sm"
                  disabled={loading}
                  placeholder="请输入新密码（至少6位）"
                  whileFocus={{ scale: 1.02 }}
                />
                <motion.button
                  className="w-full py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleChangePassword}
                  disabled={loading || !oldPwd || !newPwd}
                  whileHover={{ scale: loading ? 1 : 1.02 }}
                  whileTap={{ scale: loading ? 1 : 0.98 }}
                >
                  {loading ? '保存中...' : '保存新密码'}
                </motion.button>
              </motion.div>
            )}
            <motion.button
              onClick={handleUpdate}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || avatarLoading}
              whileHover={{ scale: (loading || avatarLoading) ? 1 : 1.02 }}
              whileTap={{ scale: (loading || avatarLoading) ? 1 : 0.98 }}
            >
              <div className="flex items-center justify-center gap-2">
                {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                <FaSave className="w-4 h-4" />
                {loading ? '保存中...' : '保存修改'}
              </div>
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default UserProfile;